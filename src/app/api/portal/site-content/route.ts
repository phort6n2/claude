import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requirePortalSession } from '@/lib/portal-guard'
import { validatePortalContent } from '@/lib/portal-content-limits'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * The client-facing slice of site content: the few fields a shop owner owns.
 *
 * Deliberately NOT a general content API — it reads and writes only the
 * warranty and FAQ. Structure, layout, hero copy, bullets, chapters, photos,
 * and the regulator registration stay with the admin, because the layout is
 * the product and the compliance fields are ours to get right.
 */

export async function GET() {
  const guard = await requirePortalSession()
  if ('response' in guard) return guard.response
  const { session } = guard

  try {
    const content = await prisma.clientSiteContent.findUnique({
      where: { clientId: session.clientId },
      select: { warrantyTitle: true, warrantyText: true, faq: true },
    })
    return NextResponse.json({
      warrantyTitle: content?.warrantyTitle ?? null,
      warrantyText: content?.warrantyText ?? null,
      faq: content?.faq ?? [],
    })
  } catch (error) {
    console.error('[Portal] Failed to load site content:', error)
    return NextResponse.json({ error: 'Could not load your content' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requirePortalSession({ mutating: true })
  if ('response' in guard) return guard.response
  const { session } = guard

  try {
    const body = await request.json()
    const result = validatePortalContent(body)
    if (!result.ok || !result.value) {
      return NextResponse.json({ error: result.errors.join(' ') }, { status: 400 })
    }

    const { warrantyTitle, warrantyText, faq } = result.value
    const faqJson = faq as unknown as Prisma.InputJsonValue
    await prisma.clientSiteContent.upsert({
      where: { clientId: session.clientId },
      update: { warrantyTitle, warrantyText, faq: faqJson },
      create: { clientId: session.clientId, warrantyTitle, warrantyText, faq: faqJson },
    })

    // Push the change to the live site rather than waiting out the ISR window.
    const client = await prisma.client.findUnique({
      where: { id: session.clientId },
      select: { slug: true },
    })
    if (client) {
      revalidatePath(`/sites/${client.slug}`, 'layout')
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Portal] Failed to save site content:', error)
    return NextResponse.json({ error: 'Could not save your changes' }, { status: 500 })
  }
}
