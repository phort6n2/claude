import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { scanSocialLinks } from '@/lib/social-scan'
import {
  SOCIAL_PLATFORMS,
  countSocialLinks,
  readSocialLinks,
  type SocialLinks,
} from '@/lib/social-links'

export const dynamic = 'force-dynamic'
// One fetch of one page. Nothing here is slow, but a shop's host can be.
export const maxDuration = 60

/**
 * POST — read this client's social profiles off their own website.
 *
 * READ-ONLY, ON PURPOSE. It reports what it found and which of those are new;
 * the card writes through `PUT /api/clients/[id]`, which is the one path that
 * screens the values and triggers the directory sync. A second writer here
 * would be a second copy of both of those.
 *
 * That also gives the operator the review the scrape needs: `socialLinkProblem`
 * can prove a share button is not an account, and it cannot prove that a real
 * Instagram account belongs to the shop rather than to whoever built their
 * site. A human looking at the handle can.
 *
 * The URL defaults to `Client.websiteUrl` — seeded from the Business Profile
 * at intake, so for an existing client this is a one-press action with nothing
 * to type. A body `url` overrides it, for a shop whose socials sit on a
 * different host from the page we hold.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { websiteUrl: true, socialLinks: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const target = (typeof body?.url === 'string' && body.url.trim()) || client.websiteUrl || ''
  if (!target) {
    return NextResponse.json(
      {
        error:
          'No website on file for this client. Add one on the Website tab, or paste the address to read.',
      },
      { status: 400 }
    )
  }

  const scan = await scanSocialLinks(target)
  if (!scan.ok) return NextResponse.json({ error: scan.error, url: scan.url }, { status: 422 })

  // What is genuinely new, so the card can offer those and stay quiet about
  // the ones already on file — "found 4" about four values that are already
  // stored reads as the button having done something.
  const stored = readSocialLinks(client.socialLinks)
  const fresh: SocialLinks = {}
  for (const platform of SOCIAL_PLATFORMS) {
    const found = scan.links[platform]
    if (found && found !== stored[platform]) fresh[platform] = found
  }

  const total = countSocialLinks(scan.links)
  const newCount = countSocialLinks(fresh)
  return NextResponse.json({
    ok: true,
    url: scan.url,
    found: scan.links,
    fresh,
    message: total
      ? newCount
        ? `Found ${total} profile${total === 1 ? '' : 's'}, ${newCount} not on file. Check each one belongs to the shop and not to whoever built their site.`
        : `Found ${total} profile${total === 1 ? '' : 's'} — all already on file.`
      : 'No social profiles on that page. Their footer may load with JavaScript, or the links may be on another page — paste that page’s address to read it instead.',
  })
}
