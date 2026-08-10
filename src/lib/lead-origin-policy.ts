import { prisma } from '@/lib/db'

/**
 * Which web pages are allowed to post leads into the platform.
 *
 * The rule the platform sells is simple: a page built here, served here, on a
 * glassleads.app subdomain or on a custom domain pointed at this project.
 * Anything else is somebody else's website using our endpoint, and the first
 * sign of it is a shop getting alerts for enquiries the platform never saw the
 * page for — or, worse, duplicates of leads their own site already handled.
 *
 * The test that captures "served here" exactly, without a list to maintain:
 *
 *   the page's Origin host === the host this request arrived on
 *
 * A hosted site posts to a relative URL, so the widget's fetch goes to the
 * very host the page loaded from. That is true on {sub}.glassleads.app, on a
 * custom domain attached to the Vercel project, on /sites/{slug} under the app
 * host, and on preview deployments — all of them our pages, all of them
 * matching, none of them enumerated anywhere. A third-party site embedding our
 * widget script loads it from glassleads.app, so its fetch carries its own
 * Origin against our Host, and the two differ. That is the whole distinction.
 *
 * Two deliberate exceptions:
 *
 *   - No Origin header at all → allowed. Server-to-server callers (HighLevel,
 *     Zapier, curl) do not send one. Requiring it would break every inbound
 *     integration and stop nothing, since anything that can omit a header can
 *     equally send a convincing one.
 *
 *   - The client's own `allowedOrigins` list → allowed. This is the opt-in for
 *     the embeddable widget on a client's existing website. It is admin-set,
 *     per client, and deliberately not defaulted to anything.
 *
 * None of this is a security boundary. Origin is enforced by browsers; a
 * script ignores it. What it does is stop a page — anyone's page — from
 * quietly wiring itself into a client's lead flow.
 */

export interface OriginDecision {
  allowed: boolean
  /** Why, in a form that is worth putting in a log line. */
  reason: 'no-origin' | 'same-host' | 'configured' | 'rejected'
}

/**
 * The public host this request arrived on.
 *
 * `x-forwarded-host` is what the edge sets when it proxies, and it is the
 * host the browser actually typed; `host` is the fallback. `request.url` is
 * not used — it can carry an internal rewrite target.
 */
export function requestHost(headers: Headers): string {
  const raw = headers.get('x-forwarded-host') || headers.get('host') || ''
  return raw.split(',')[0].split(':')[0].trim().toLowerCase()
}

/** Host part of an Origin header, lowercased, port stripped. */
function originHost(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

/**
 * Decide whether `origin` may post leads for `clientSlug`.
 *
 * Never throws. A database failure falls back to the same-host rule, which
 * needs no database and keeps every hosted site working: an outage must not
 * take lead capture down with it.
 */
export async function decideOrigin(
  origin: string | null,
  host: string,
  clientSlug: string | null
): Promise<OriginDecision> {
  if (!origin) return { allowed: true, reason: 'no-origin' }

  const from = originHost(origin)
  if (from && host && from === host) return { allowed: true, reason: 'same-host' }

  if (!clientSlug) return { allowed: false, reason: 'rejected' }

  try {
    const client = await prisma.client.findUnique({
      where: { slug: clientSlug },
      select: { allowedOrigins: true },
    })
    const wanted = normalizeOrigin(origin)
    const listed = (client?.allowedOrigins || []).some((o) => normalizeOrigin(o) === wanted)
    return listed ? { allowed: true, reason: 'configured' } : { allowed: false, reason: 'rejected' }
  } catch (err) {
    console.warn('[Lead origin] allowedOrigins lookup failed, same-host rule only:', err)
    return { allowed: false, reason: 'rejected' }
  }
}
