/**
 * Fire-and-forget kick-off of the call-analysis pipeline.
 *
 * Vercel serverless functions can't reliably continue work after the response
 * is returned, and this app doesn't use a queue (no Inngest, no Trigger.dev).
 * Pattern: the webhook posts to an internal worker endpoint without awaiting.
 * The internal endpoint runs the full pipeline within its own request lifetime
 * (with maxDuration set high enough for transcription + Claude). A cron job
 * sweeps any rows that get stuck.
 */
function getBaseUrl(req: Request): string {
  const explicit = process.env.APP_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`

  // Fall back to the host of the incoming request — works for local dev.
  const host = req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`

  return 'http://localhost:3000'
}

export function kickOffCallAnalysis(req: Request, callAnalysisId: string): void {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[CallAnalysis] CRON_SECRET not set; cannot kick off worker')
    return
  }

  const url = `${getBaseUrl(req)}/api/internal/process-call-analysis`

  const post = () =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ callAnalysisId }),
      // Vercel quirk: `keepalive` lets the request survive after response is sent.
      keepalive: true,
    })

  // Intentionally not awaited. These kick-offs were failing outright on
  // transient network faults (ECONNRESET / ETIMEDOUT reaching the app's own
  // host), which left the call sitting untouched until the recovery cron ran up
  // to 10 minutes later — and that sweep is itself best-effort. One quick retry
  // clears the great majority of them straight away.
  post()
    .catch(() => new Promise((r) => setTimeout(r, 750)).then(post))
    .catch((err) => {
      console.error(
        '[CallAnalysis] Failed to kick off worker after retry (recovery cron will pick it up):',
        err
      )
    })
}
