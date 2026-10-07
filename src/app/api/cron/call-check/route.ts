import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { LIVE_STATUSES } from '@/lib/site-preview'
import { runCallCheck } from '@/lib/call-check-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET/POST /api/cron/call-check (daily)
 *
 * The admin Call check, run for every live shop over the last year, with the
 * result written to the server log as `[Call check]` lines. It exists so the
 * comparison can be read WITHOUT an admin session: Vercel's runtime logs are
 * readable through the deploy tooling, an admin login is not, and nobody
 * should be pasting a password into a chat to get a number. Daily because
 * runtime logs keep only a day.
 *
 * COUNTS ONLY in the log — weeks, totals, verdicts, the call-asset numbers
 * (the shop's own published lines) — never a caller's number or a lead id.
 * Read-only on both sides, like the page.
 */
async function handle(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (process.env.NODE_ENV === 'production' && !cronSecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clients = await prisma.client.findMany({
    where: {
      status: { in: [...LIVE_STATUSES] },
      OR: [{ adsTracking: { googleAdsCustomerId: { not: null } } }, { trackingNumbers: { some: {} } }],
    },
    select: { id: true, businessName: true },
    orderBy: { businessName: 'asc' },
  })

  const started = Date.now()
  const done: string[] = []
  for (const c of clients) {
    // Leave room to answer: a run killed at the limit logs nothing about why.
    if (Date.now() - started > 240_000) break
    try {
      const r = await runCallCheck(c.id, 365)
      if (!r) continue
      const t = r.weeks.reduce(
        (s, w) => ({
          app: s.app + w.appCalls,
          answered: s.answered + w.appAnswered,
          ad: s.ad + w.fromAdButton,
          notAd: s.notAd + w.notFromAdButton,
          gOnly: s.gOnly + w.googleOnly,
        }),
        { app: 0, answered: 0, ad: 0, notAd: 0, gOnly: 0 }
      )
      console.log(
        `[Call check] ${c.businessName} summary ` +
          JSON.stringify({
            account: r.adsAccount,
            tz: r.timezone,
            googleError: r.googleError,
            googleLogStarts: r.googleLogStarts,
            callAssets: r.callAssets,
            totals: t,
            verdicts: r.verdicts.map((v) => `${v.tone}: ${v.text}`),
          })
      )
      // Oldest first, thirteen weeks a line, so no single line is long enough
      // for the log to cut. Columns: week, our calls, answered, from ad
      // button, not from ad button, Google-only, then every action by name.
      const weeks = [...r.weeks].reverse()
      for (let i = 0; i < weeks.length; i += 13) {
        const chunk = weeks.slice(i, i + 13).map((w) => [
          w.week,
          w.appCalls,
          w.appAnswered,
          w.fromAdButton,
          w.notFromAdButton,
          w.googleOnly,
          r.byAction[w.week] || {},
        ])
        console.log(`[Call check] ${c.businessName} weeks ${JSON.stringify(chunk)}`)
      }
      done.push(c.businessName)
    } catch (e) {
      console.error(`[Call check] ${c.businessName} FAILED: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const skipped = clients.map((c) => c.businessName).filter((n) => !done.includes(n))
  console.log(`[Call check] finished: ${done.length} shops${skipped.length ? `; not reached or failed: ${skipped.join(', ')}` : ''}`)
  return NextResponse.json({ checked: done.length, skipped })
}

export async function POST(request: NextRequest) {
  return handle(request)
}

export async function GET(request: NextRequest) {
  return handle(request)
}
