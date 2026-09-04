import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { importSiteContent, looksLikeForeignMark } from '@/lib/site-import'
import { mirrorImages, mirrorRemoteImage } from '@/lib/photo-mirror'

export const dynamic = 'force-dynamic'
// Crawl (up to 5 pages) + the model reading up to 24 images + mirroring the
// kept photos to blob storage, all in one request. 120 was measured too
// tight on slow shop hosts, and a platform timeout surfaces to the admin as
// a bare "Import failed" with everything half-done.
export const maxDuration = 300

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — fetch a client's existing website and extract site content as a
 * DRAFT. Nothing is written to the database: the response pre-fills the Site
 * Content editor and an admin reviews before saving.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      select: { slug: true, businessName: true, city: true, state: true, logoUrl: true },
    })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const body = await request.json()
    if (typeof body.url !== 'string' || !body.url.trim()) {
      return NextResponse.json({ error: 'A URL is required' }, { status: 400 })
    }

    // `html` is the admin pasting the page a blocked site would not give us.
    const providedHtml = typeof body.html === 'string' ? body.html : undefined
    const result = await importSiteContent(
      body.url,
      { name: client.businessName, city: client.city, state: client.state },
      providedHtml
    )
    if (!result.ok) {
      // Every refusal is logged with the URL that caused it. The message
      // already reaches the admin; without this it reaches nobody who can
      // read it afterwards, which is how "the importer is broken again"
      // became unanswerable twice.
      console.warn(`[SiteImport] refused ${body.url}: ${result.error}`)
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    // Copied onto our own storage before the draft is even shown. Hot-linking
    // the shop's old CMS was measured at ~1MB of images into 358px phone slots
    // on one live site, and it breaks silently the day they redesign. Anything
    // that cannot be copied keeps its original URL — a hot-linked photo beats
    // no photo.
    result.draft.photos = await mirrorImages(result.draft.photos, client.slug)
    if (result.draft.logoUrl) {
      const mirrored = await mirrorRemoteImage(result.draft.logoUrl, client.slug, 'logo')
      if (mirrored) result.draft.logoUrl = mirrored
    }

    // The scorer refusing to pick another brand's badge is only half the fix
    // when an earlier, dumber import already saved that badge as the logo. If
    // this import found no logo and the saved one is recognisably someone
    // else's mark, clear it — the site renders the business name instead,
    // which is embarrassing to nobody, unlike Acura's badge in the header.
    if (!result.draft.logoUrl && client.logoUrl && looksLikeForeignMark(client.logoUrl, client.businessName)) {
      await prisma.client.update({ where: { id }, data: { logoUrl: null } }).catch(() => {})
      result.draft.warnings.push(
        'Removed the previously saved logo — it was another brand’s mark (a car maker or partner badge), not this shop’s. Upload their real logo when you have it.'
      )
    }

    return NextResponse.json({ draft: result.draft })
  } catch (error) {
    console.error('Failed to import site content:', error)
    return NextResponse.json({ error: 'Failed to import site content' }, { status: 500 })
  }
}
