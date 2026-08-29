import Script from 'next/script'
import { parseSnippet } from '@/lib/site-scripts'

/**
 * The owner's own tags on a client's site.
 *
 * Two slots, and the difference is when they run:
 *
 * HEAD — `beforeInteractive`, for anything that has to be present before the
 * page renders: a site-verification tag, a consent manager, an A/B tool that
 * would otherwise flash the original.
 *
 * BODY END — `afterInteractive`, for everything else: chat widgets, pixels,
 * heatmaps. This is where a tag belongs unless it has a reason not to be,
 * because these pages are paid landing pages and every blocking script in the
 * head is spend that bought a slower page.
 *
 * Rendered only for the client that has them set, so a shop with no tags
 * loads nothing extra at all.
 */
export function CustomScripts({
  head,
  bodyEnd,
}: {
  head?: string | null
  bodyEnd?: string | null
}) {
  return (
    <>
      <SnippetSlot snippet={head} idPrefix="gl-head" strategy="beforeInteractive" />
      <SnippetSlot snippet={bodyEnd} idPrefix="gl-body" strategy="afterInteractive" />
    </>
  )
}

function SnippetSlot({
  snippet,
  idPrefix,
  strategy,
}: {
  snippet?: string | null
  idPrefix: string
  strategy: 'beforeInteractive' | 'afterInteractive'
}) {
  const parsed = parseSnippet(snippet)
  if (!parsed.sources.length && !parsed.inline.length && !parsed.markup) return null

  return (
    <>
      {parsed.sources.map((source, i) => (
        <Script key={`${idPrefix}-src-${i}`} id={`${idPrefix}-src-${i}`} src={source.src} strategy={strategy} />
      ))}
      {parsed.inline.map((code, i) => (
        <Script key={`${idPrefix}-inline-${i}`} id={`${idPrefix}-inline-${i}`} strategy={strategy}>
          {code}
        </Script>
      ))}
      {/* Whatever was not a script — a <noscript>, a verification <meta>.
          These are inert by definition, which is the only reason it is safe
          to set them as raw HTML. */}
      {parsed.markup ? <span dangerouslySetInnerHTML={{ __html: parsed.markup }} /> : null}
    </>
  )
}
