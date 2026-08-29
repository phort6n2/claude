/**
 * Read the error out of a failed response, whatever it turns out to contain.
 *
 * THE BUG THIS EXISTS FOR: a route that throws before it can answer sends
 * back Next's HTML error page, not JSON. Every save button in the admin did
 * `const data = await res.json()` on the failure path, so the parser hit the
 * first `<` and reported:
 *
 *     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * to a shop owner trying to change a timezone. It names the parser's problem,
 * not the server's, and it looks like the form is broken rather than the
 * request — which is exactly backwards for whoever has to fix it.
 *
 * So: JSON when there is JSON, otherwise the status, which at least says
 * whether this was a server fault, a permission problem or a missing route.
 */
export async function errorFrom(res: Response, fallback = 'Failed to save'): Promise<string> {
  const body = await res.text().catch(() => '')

  // A JSON body is the normal case: every route in this app answers
  // { error: "..." } when it can answer at all.
  if (body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown }
      const message = parsed.error ?? parsed.message
      if (typeof message === 'string' && message.trim()) return message
    } catch {
      // fall through to the status
    }
  }

  if (res.status === 401 || res.status === 403) {
    return 'Your session has expired. Reload the page and sign in again.'
  }
  if (res.status === 404) return 'That endpoint is not there (404). Nothing was saved.'
  if (res.status >= 500) {
    return `The server failed on this request (${res.status}). Nothing was saved — the details are in the Vercel runtime logs.`
  }
  return `${fallback} (${res.status})`
}
