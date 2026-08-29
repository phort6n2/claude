/**
 * Turn a pasted block of tag markup into something that actually runs.
 *
 * THE TRAP THIS EXISTS FOR: markup rendered through
 * `dangerouslySetInnerHTML` does not execute its scripts. React sets the HTML
 * with innerHTML, and the HTML spec says a <script> inserted that way never
 * runs. So a pasted verification tag would sit in the page source looking
 * perfectly installed, pass a "view source" check, and do nothing at all —
 * which is worse than not having the field, because the check that would
 * catch it is the one it passes.
 *
 * So the snippet is taken apart: external sources become <Script src>,
 * inline blocks become <Script> with the code as children, and everything
 * that is not a script (a <noscript> fallback, a <meta> verification tag) is
 * kept aside to be emitted as inert markup, which is exactly what those are.
 *
 * A parser rather than a "paste only the JS" instruction, because every
 * vendor on earth hands you a block with <script> tags around it and the
 * instruction gets ignored — see extractClarityProjectId for the same lesson.
 */

export interface ParsedSnippet {
  /** src attributes for external scripts, in the order they appeared. */
  sources: Array<{ src: string; async: boolean; defer: boolean }>
  /** Inline script bodies, in order. */
  inline: string[]
  /** Everything else: noscript, meta, link, comments. Emitted as-is. */
  markup: string
}

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
const SRC_ATTR = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i

/**
 * Only https and protocol-relative. A pasted http:// tag would be blocked as
 * mixed content by the browser anyway, and silently — so it is refused here
 * where somebody can be told.
 */
function usableSrc(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('https://')) return value
  if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`
  // Anything relative would resolve against the client's own domain, which is
  // never what a third-party tag means.
  return null
}

export function parseSnippet(input: string | null | undefined): ParsedSnippet {
  const empty: ParsedSnippet = { sources: [], inline: [], markup: '' }
  const text = (input || '').trim()
  if (!text) return empty

  const sources: ParsedSnippet['sources'] = []
  const inline: string[] = []

  const withoutScripts = text.replace(SCRIPT_TAG, (_match, attrs: string, bodyText: string) => {
    const srcMatch = SRC_ATTR.exec(attrs || '')
    const rawSrc = srcMatch ? srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '' : ''
    if (rawSrc) {
      const src = usableSrc(rawSrc)
      if (src) {
        sources.push({
          src,
          async: /\basync\b/i.test(attrs || ''),
          defer: /\bdefer\b/i.test(attrs || ''),
        })
      }
      return ''
    }
    const code = (bodyText || '').trim()
    if (code) inline.push(code)
    return ''
  })

  // A self-closing external script (<script src="…" />) never matches the
  // paired pattern above, and vendors do emit them.
  const selfClosing = /<script\b([^>]*?)\/>/gi
  const leftovers = withoutScripts.replace(selfClosing, (_m, attrs: string) => {
    const srcMatch = SRC_ATTR.exec(attrs || '')
    const rawSrc = srcMatch ? srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '' : ''
    const src = rawSrc ? usableSrc(rawSrc) : null
    if (src) {
      sources.push({
        src,
        async: /\basync\b/i.test(attrs || ''),
        defer: /\bdefer\b/i.test(attrs || ''),
      })
    }
    return ''
  })

  return { sources, inline, markup: leftovers.trim() }
}

/** What the admin card reports back, so a paste can be checked before saving. */
export function describeSnippet(input: string | null | undefined): string {
  const parsed = parseSnippet(input)
  const bits: string[] = []
  if (parsed.sources.length) {
    bits.push(
      `${parsed.sources.length} external script${parsed.sources.length === 1 ? '' : 's'} (${parsed.sources
        .map((s) => {
          try {
            return new URL(s.src).hostname
          } catch {
            return s.src
          }
        })
        .join(', ')})`
    )
  }
  if (parsed.inline.length) {
    bits.push(`${parsed.inline.length} inline block${parsed.inline.length === 1 ? '' : 's'}`)
  }
  if (parsed.markup) bits.push('plus non-script markup, emitted as-is')
  if (!bits.length) return 'Nothing recognisable yet — paste the whole tag, script tags and all.'
  return `Will load: ${bits.join(', ')}.`
}
