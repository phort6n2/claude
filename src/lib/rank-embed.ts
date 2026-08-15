/**
 * Embedding Local Dominator's own heatmap.
 *
 * Two links arrive on every run and only one of them is ours to use:
 *
 * - `image_link` — despite the name, an HTML page, not an image. It 307s to
 *   `/share/static-images/heat-map-image?...`, and that `/share/` prefix is
 *   the whole point: it is their PUBLIC route, gated by the `link` UUID
 *   rather than by a session. It renders the heatmap and nothing else — no
 *   dashboard chrome, no nav. This is the one to embed.
 *
 * - `dynamic_url` — their live dashboard. It has no `/share/` form; signed
 *   out it renders with no data, which is why it once came up centred on
 *   0,0 in the Atlantic. It is only useful to an admin who is logged in, so
 *   it is an admin-only new-tab link and never a client-facing frame.
 *
 * Fetching it as an `<img src>` was the original mistake — it returns
 * text/html, so the browser drew a broken image. It has to be an iframe.
 */

const PROVIDER_HOST = 'app.localdominator.co'

/**
 * Their public share URL for a run, or null if the link is not one.
 *
 * Host-checked rather than pattern-matched: this URL comes out of a webhook
 * payload and ends up as an iframe `src`, so it must be impossible for a
 * malformed or hostile payload to frame something else inside a client's
 * portal.
 */
export function shareEmbedUrl(link: string | null | undefined): string | null {
  if (!link) return null
  try {
    const url = new URL(link)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== PROVIDER_HOST) return null
    // Skip the redirect and go straight at the public route.
    if (!url.pathname.startsWith('/share/')) {
      url.pathname = `/share${url.pathname}`
    }
    return url.toString()
  } catch {
    return null
  }
}

export interface EmbedVerdict {
  ok: boolean
  /** Why not, in a sentence an admin can act on. */
  reason: string
}

/**
 * Ask the share page, server-side, whether it can actually be framed.
 *
 * A blank grey box in front of a paying client is worse than our own map, and
 * an iframe fails silently — the parent page cannot see that the frame was
 * refused. So the decision is made here, before anything renders, and the
 * fallback is chosen deliberately rather than discovered by the client.
 *
 * Cached for a day. The answer is a property of their route, not of the run,
 * so re-asking per page view would be a request per keyword per visit for a
 * value that changes when they redeploy, if ever.
 */
export async function canEmbedShare(url: string | null): Promise<EmbedVerdict> {
  if (!url) return { ok: false, reason: 'This run carried no share link.' }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 },
    })

    if (!res.ok) {
      return {
        ok: false,
        reason:
          res.status === 401 || res.status === 403
            ? `Local Dominator refused the share link (${res.status}) — it may have expired.`
            : `The share page returned ${res.status}.`,
      }
    }

    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase()
    if (xfo.includes('deny') || xfo.includes('sameorigin')) {
      return { ok: false, reason: `They block framing (X-Frame-Options: ${xfo}).` }
    }

    const csp = res.headers.get('content-security-policy') || ''
    const ancestors = csp.match(/frame-ancestors([^;]*)/i)?.[1]?.trim()
    if (ancestors && !/\*/.test(ancestors) && !/glassleads\.app/i.test(ancestors)) {
      return { ok: false, reason: `They block framing (frame-ancestors ${ancestors}).` }
    }

    return { ok: true, reason: 'ok' }
  } catch {
    return { ok: false, reason: 'The share page could not be reached.' }
  }
}
