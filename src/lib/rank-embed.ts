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
 * The interactive report is the map. Fetched with a real token and no
 * cookies it answers 200, sends no X-Frame-Options and no frame-ancestors,
 * and never redirects to their login: it is public, and it is framable. Two
 * earlier probes said otherwise and both were wrong for the same reason —
 * they used an invented `link` token, and an invalid token refuses exactly
 * like a missing route does.
 *
 * It is a client-side app that reads `heatmapRecordId` and `link` off its own
 * query string; nothing is server-rendered. So the only thing it needs from
 * us is the URL passed through untouched — which is why it once drew the
 * Atlantic while the frame was carrying referrerPolicy="no-referrer".
 *
 * `campaign_link` is deliberately not used. It is their standalone marketing
 * page for a campaign, not the report — the report is what it links TO.
 *
 * Preferred above all of it is the WHITE-LABEL form of the same report:
 * `https://{our-share-host}/{link}`. It is the same page on our own domain,
 * and it is the only one of the three that says so in a header —
 * `content-security-policy: frame-ancestors *`, i.e. built to be embedded.
 * A client looking at their own rankings should not be reading a competitor
 * vendor's domain in the address bar of the frame.
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

/**
 * The white-label form of a run's report: the `link` UUID from their URL,
 * served from our own share host.
 *
 * Both halves are validated rather than trusted. The host comes from a
 * setting and the UUID out of a webhook payload, and the result becomes an
 * iframe `src` inside a client's portal — so a malformed host or a token
 * carrying a path must not be able to frame something else.
 */
export function whiteLabelEmbedUrl(
  link: string | null | undefined,
  host: string | null
): string | null {
  if (!host || !link) return null
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null
  try {
    const token = new URL(link).searchParams.get('link')
    if (!token || !/^[0-9a-f-]{16,64}$/i.test(token)) return null
    return `https://${host}/${token}`
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
  /** Our own share host serves the report — the first choice. */
  whiteLabelOk: boolean
  /** Their static heatmap can be framed — the default map. */
  staticOk: boolean
  /** Their interactive report can be framed — offered as a switch. */
  interactiveOk: boolean
  /** Why nothing of theirs is being shown, when nothing is. */
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
  statik: string | null,
  whiteLabel: string | null = null
): Promise<EmbedVerdict> {
  if (whiteLabel) {
    const check = await reachable(whiteLabel)
    if (check.ok) {
      return { whiteLabelOk: true, staticOk: false, interactiveOk: false, reason: 'ok' }
    }
  }

  const [staticCheck, interactiveCheck] = await Promise.all([
    statik ? reachable(statik) : Promise.resolve({ ok: false, why: 'no static link on this run' }),
    interactive
      ? reachable(interactive)
      : Promise.resolve({ ok: false, why: 'no interactive link on this run' }),
  ])

  return {
    whiteLabelOk: false,
    staticOk: staticCheck.ok,
    interactiveOk: interactiveCheck.ok,
    reason: interactiveCheck.ok || staticCheck.ok
      ? 'ok'
      : `their interactive map: ${interactiveCheck.why}; their static map: ${staticCheck.why}`,
  }
}
