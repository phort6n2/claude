/**
 * Embedding Local Dominator's own heatmap.
 *
 * Two links arrive on every run, and which of them can be framed is a
 * question that has been answered wrongly twice, so it is no longer answered
 * by reading their URLs.
 *
 * - `dynamic_url` — their live, interactive report. The better map: pan,
 *   zoom, click a point. It once rendered centred on 0,0 in the Atlantic,
 *   which was read as "it needs a login". It does not: the same URL opens
 *   correctly in a new tab for a signed-out visitor, so the `link` UUID is
 *   the credential and the Atlantic was the iframe context failing, not auth.
 *
 * - `image_link` — despite the name, an HTML page, not an image. It 307s to
 *   `/share/static-images/heat-map-image?...`; that `/share/` prefix is their
 *   public route. It renders the heatmap and nothing else. Fetching it as an
 *   `<img src>` was the original mistake — it returns text/html.
 *
 * Both are tried, interactive first, and the choice is made by asking their
 * server with the real token and no cookies. Probing with a made-up token
 * proves nothing, because an invalid token and a missing route both come back
 * as a refusal — reading one as the other is exactly how the interactive map
 * got written off.
 */

const PROVIDER_HOST = 'app.localdominator.co'

/**
 * Normalise one of their links for embedding, or null if it is not one.
 *
 * Host-checked rather than pattern-matched: this URL comes out of a webhook
 * payload and ends up as an iframe `src`, so it must be impossible for a
 * malformed or hostile payload to frame something else inside a portal.
 */
function normalise(link: string | null | undefined, forceShare: boolean): string | null {
  if (!link) return null
  try {
    const url = new URL(link)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== PROVIDER_HOST) return null
    if (forceShare && !url.pathname.startsWith('/share/')) {
      url.pathname = `/share${url.pathname}`
    }
    // Their router 301s to the trailing-slash form; going straight there
    // saves a redirect inside the frame.
    if (!url.pathname.endsWith('/') && !url.pathname.includes('.')) {
      url.pathname = `${url.pathname}/`
    }
    return url.toString()
  } catch {
    return null
  }
}

/** Their interactive report for a run. */
export function interactiveEmbedUrl(dynamicUrl: string | null | undefined): string | null {
  return normalise(dynamicUrl, false)
}

/** Their static heatmap page, on the public /share/ route. */
export function shareEmbedUrl(imageLink: string | null | undefined): string | null {
  return normalise(imageLink, true)
}

export interface EmbedVerdict {
  /** The URL to frame, best first, or null when nothing of theirs works. */
  url: string | null
  /** Which one won, for the admin note. */
  kind: 'interactive' | 'static' | null
  /** Why nothing worked, when nothing did. */
  reason: string
}

async function reachable(url: string): Promise<{ ok: boolean; why: string }> {
  try {
    // No credentials, deliberately: this has to reproduce a signed-out
    // visitor, which is what every client and every share-link prospect is.
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 86_400 },
    })

    if (/\/login\b|\/signin\b|\/sign-in\b/i.test(res.url || '')) {
      return { ok: false, why: 'it redirects a signed-out visitor to their login' }
    }
    if (!res.ok) return { ok: false, why: `it returned ${res.status}` }

    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase()
    if (xfo.includes('deny') || xfo.includes('sameorigin')) {
      return { ok: false, why: `they block framing (X-Frame-Options: ${xfo})` }
    }

    const csp = res.headers.get('content-security-policy') || ''
    const ancestors = csp.match(/frame-ancestors([^;]*)/i)?.[1]?.trim()
    if (ancestors && !/\*/.test(ancestors) && !/glassleads\.app/i.test(ancestors)) {
      return { ok: false, why: `they block framing (frame-ancestors ${ancestors})` }
    }

    return { ok: true, why: 'ok' }
  } catch {
    return { ok: false, why: 'it could not be reached' }
  }
}

/**
 * Which of their maps to frame, decided server-side before anything renders.
 *
 * An iframe fails silently — the parent page cannot tell that a frame was
 * refused — and a blank grey box in front of a paying client is worse than
 * our own map. So the fallback is chosen deliberately here rather than
 * discovered by the client.
 *
 * Cached for a day: the answer is a property of their routes, not of a run,
 * so re-asking per page view would be a request per visit for a value that
 * changes when they redeploy, if ever.
 */
export async function pickEmbed(
  interactive: string | null,
  statik: string | null
): Promise<EmbedVerdict> {
  const tried: string[] = []

  if (interactive) {
    const check = await reachable(interactive)
    if (check.ok) return { url: interactive, kind: 'interactive', reason: 'ok' }
    tried.push(`their interactive map: ${check.why}`)
  }

  if (statik) {
    const check = await reachable(statik)
    if (check.ok) return { url: statik, kind: 'static', reason: 'ok' }
    tried.push(`their static map: ${check.why}`)
  }

  return {
    url: null,
    kind: null,
    reason: tried.length ? tried.join('; ') : 'this run carried no share link',
  }
}
