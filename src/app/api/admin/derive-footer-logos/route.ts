import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { deriveFooterLogo } from '@/lib/footer-logo'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST — derive the white footer logo for every client that needs one.
 *
 * The per-save hook only fires when a logo is SAVED, and every existing
 * client's logo was saved before the derivation existed. One pass here fills
 * the gap; after it, the hook keeps up on its own. Safe to run repeatedly —
 * the helper skips clients with a footer logo already set, and opaque logos
 * are skipped by the alpha check (those shops keep the wordmark).
 */
export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const clients = await prisma.client.findMany({
    where: { logoUrl: { not: null }, footerLogoUrl: null },
    select: { id: true, businessName: true },
    orderBy: { businessName: 'asc' },
  })

  const results = []
  for (const client of clients) {
    await deriveFooterLogo(client.id)
    const after = await prisma.client.findUnique({
      where: { id: client.id },
      select: { footerLogoUrl: true },
    })
    results.push({
      client: client.businessName,
      derived: !!after?.footerLogoUrl,
      note: after?.footerLogoUrl
        ? 'white footer logo generated'
        : 'skipped — logo is opaque (footer shows the wordmark) or could not be read',
    })
  }

  return NextResponse.json({
    checked: results.length,
    derived: results.filter((r) => r.derived).length,
    results,
  })
}
