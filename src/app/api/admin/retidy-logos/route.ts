import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import { logoPngFrom, storeLogoUpload } from '@/lib/photo-upload'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Stop before the platform does, and say who was not reached. */
const TIME_BUDGET_MS = 240_000

/**
 * POST — re-store every client's logo with its baked-in margin removed.
 *
 * The trim runs at upload, and every logo on the platform was stored before
 * the trim existed. Without this they keep their padding forever: the header
 * sizes the FILE, so a logo that is 35% ink renders its ink at 35% of the
 * space — MAG Mobile's was a 53x27 mark in a 72px header, which is what
 * "the logo doesn't look great" meant.
 *
 * SAFE TO RUN REPEATEDLY, and it has to be: a trimmed logo has no margin left
 * to find, so a second pass measures the same dimensions and writes nothing.
 * That is also what makes the dry run trustworthy — it does the same
 * measurement and just does not store the result.
 *
 * A failure never clears a logo. The row keeps the URL it has, the client
 * keeps the logo it has, and the response names who was skipped and why: a
 * blank header on a live site is a far worse outcome than a padded logo.
 *
 * `?dryRun=1` as well as a JSON body, because the Maintenance runner sends no
 * body — the same reason the WRHQ backfill accepts both.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const dryRun =
    new URL(request.url).searchParams.get('dryRun') === '1' || body?.dryRun === true

  const clients = await prisma.client.findMany({
    where: { OR: [{ logoUrl: { not: null } }, { footerLogoUrl: { not: null } }] },
    select: { id: true, slug: true, businessName: true, logoUrl: true, footerLogoUrl: true },
    orderBy: { businessName: 'asc' },
  })

  const started = Date.now()
  const results: Array<Record<string, unknown>> = []
  const notReached: string[] = []

  for (const client of clients) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      notReached.push(client.businessName)
      continue
    }

    const slots: Array<['logoUrl' | 'footerLogoUrl', string | null]> = [
      ['logoUrl', client.logoUrl],
      ['footerLogoUrl', client.footerLogoUrl],
    ]

    for (const [field, url] of slots) {
      if (!url) continue
      const row: Record<string, unknown> = { client: client.businessName, slot: field }
      try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12_000) })
        if (!res.ok) throw new Error(`fetch ${res.status}`)
        const source = Buffer.from(await res.arrayBuffer())

        // Measured through the REAL pipeline rather than by a separate trim
        // here, so what the dry run predicts is what a store would produce.
        const made = await logoPngFrom(source)
        if (!made.ok) throw new Error(made.error)

        const { default: sharp } = await import('sharp')
        const before = await sharp(source).metadata()
        const after = await sharp(made.png).metadata()
        row.before = `${before.width}x${before.height}`
        row.after = `${after.width}x${after.height}`

        // Only a change worth a new file. A couple of pixels is an
        // anti-aliased edge, not a margin, and re-storing on every run would
        // mint a blob a day for fifteen shops forever.
        const shrankBy =
          (before.width || 0) - (after.width || 0) + ((before.height || 0) - (after.height || 0))
        if (shrankBy <= 4) {
          row.changed = false
          row.note = 'already tidy'
          results.push(row)
          continue
        }

        row.trimmed = `${shrankBy}px off the long edges`
        if (dryRun) {
          row.changed = false
          row.note = 'would re-store (dry run)'
          results.push(row)
          continue
        }

        const stored = await storeLogoUpload({
          file: source.buffer.slice(
            source.byteOffset,
            source.byteOffset + source.byteLength
          ) as ArrayBuffer,
          clientSlug: client.slug,
        })
        if (!stored.ok) throw new Error(stored.error)

        await prisma.client.update({ where: { id: client.id }, data: { [field]: stored.url } })
        row.changed = true
        row.note = 're-stored'
      } catch (error) {
        // The old file is still there and still referenced. Reported, not fatal.
        row.changed = false
        row.error = error instanceof Error ? error.message : String(error)
      }
      results.push(row)
    }
  }

  return NextResponse.json({
    dryRun,
    checked: results.length,
    changed: results.filter((r) => r.changed).length,
    failed: results.filter((r) => r.error).length,
    notReached,
    results,
  })
}
