import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import {
  decrypt,
  isEncryptionConfigured,
  isUnencryptedFallback,
  reencryptPlain,
} from '@/lib/encryption'
import { isSensitiveKey } from '@/lib/setting-keys'

export const dynamic = 'force-dynamic'

/**
 * POST — encrypt every secret that was stored without encryption.
 *
 * `encrypt()` falls back to base64 when ENCRYPTION_KEY is missing or not 64
 * hex characters, and production ran that way: every key saved through
 * Settings → API keys went in readable by anybody with database access, and
 * everything kept working, so nothing said so. Setting the key fixes new
 * saves only. This fixes what is already stored, without anybody retyping a
 * credential they may not have to hand.
 *
 * Covers:
 *  - Setting rows written by the fallback (`b64:`),
 *  - Setting rows for a SENSITIVE key stored with `encrypted: false` — plain
 *    text, from before that key was on the sensitive list. Every reader
 *    honours the flag, so flipping it with the value is safe,
 *  - Client.clarityApiToken and ClientAdsTracking.metaCapiToken, belt and
 *    braces: both routes refuse rather than fall back, so these should be
 *    empty of `b64:`, and the count proves it.
 *
 * NEVER RETURNS A VALUE, not even masked — the response names keys and
 * clients only, because it is read in a browser and pasted into chats.
 * Each value is round-tripped before it is written (`reencryptPlain`), and a
 * failure leaves the stored value exactly as it was: a credential readable
 * in the database is a problem, a credential destroyed is an outage.
 *
 * Refuses outright without a key: there is nothing it could do, and a run
 * that reported "0 changed" would read as all-clear. Safe to run twice — a
 * second pass finds nothing. `?dryRun=1` because the Maintenance runner sends
 * no body.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          'ENCRYPTION_KEY is not set (or is not 64 hex characters) on this deployment, so there is nothing to encrypt with. Add it in Vercel, redeploy, then run this again.',
      },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const dryRun =
    new URL(request.url).searchParams.get('dryRun') === '1' || body?.dryRun === true

  const results: Array<{ what: string; from: string; changed: boolean; note: string }> = []

  async function upgrade(
    what: string,
    from: 'base64' | 'plain text',
    plain: string | null,
    write: (value: string) => Promise<unknown>
  ) {
    if (plain === null || plain === '') {
      results.push({ what, from, changed: false, note: 'could not read the stored value — left as it is' })
      return
    }
    const made = reencryptPlain(plain)
    if (!made.ok) {
      results.push({ what, from, changed: false, note: `${made.reason} — left as it is` })
      return
    }
    if (dryRun) {
      results.push({ what, from, changed: false, note: 'would encrypt (dry run)' })
      return
    }
    try {
      await write(made.value)
      results.push({ what, from, changed: true, note: 'encrypted' })
    } catch (error) {
      results.push({
        what,
        from,
        changed: false,
        note: `write failed — left as it is (${error instanceof Error ? error.message : String(error)})`,
      })
    }
  }

  // ── Settings → API keys ────────────────────────────────────────────────
  const settings = await prisma.setting.findMany({ select: { key: true, value: true, encrypted: true } })
  for (const row of settings) {
    if (row.encrypted && isUnencryptedFallback(row.value)) {
      await upgrade(`Setting ${row.key}`, 'base64', decrypt(row.value), (value) =>
        prisma.setting.update({ where: { key: row.key }, data: { value, encrypted: true } })
      )
    } else if (!row.encrypted && isSensitiveKey(row.key) && row.value) {
      await upgrade(`Setting ${row.key}`, 'plain text', row.value, (value) =>
        prisma.setting.update({ where: { key: row.key }, data: { value, encrypted: true } })
      )
    }
  }

  // ── Per-client tokens ──────────────────────────────────────────────────
  const clarity = await prisma.client.findMany({
    where: { clarityApiToken: { startsWith: 'b64:' } },
    select: { id: true, businessName: true, clarityApiToken: true },
  })
  for (const c of clarity) {
    await upgrade(`${c.businessName}: Clarity API token`, 'base64', decrypt(c.clarityApiToken!), (value) =>
      prisma.client.update({ where: { id: c.id }, data: { clarityApiToken: value } })
    )
  }

  const meta = await prisma.clientAdsTracking.findMany({
    where: { metaCapiToken: { startsWith: 'b64:' } },
    select: { id: true, metaCapiToken: true, client: { select: { businessName: true } } },
  })
  for (const m of meta) {
    await upgrade(`${m.client.businessName}: Meta access token`, 'base64', decrypt(m.metaCapiToken!), (value) =>
      prisma.clientAdsTracking.update({ where: { id: m.id }, data: { metaCapiToken: value } })
    )
  }

  const failed = results.filter((r) => !r.changed && !r.note.startsWith('would')).length
  return NextResponse.json({
    dryRun,
    found: results.length,
    changed: results.filter((r) => r.changed).length,
    failed,
    note:
      results.length === 0
        ? 'Nothing stored without encryption. Every secret is already encrypted with the current key.'
        : undefined,
    results,
  })
}
