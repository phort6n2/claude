/**
 * Microsoft Clarity on a shop's landing pages.
 *
 * ONE PROJECT PER SHOP, not one merged project. Fifteen dashboards is more to
 * look at, but a merged dataset averages away exactly the differences worth
 * acting on — the shops have different traffic, different geography and
 * different pages, and "dead clicks are up" across all of them is not a
 * finding anybody can act on.
 *
 * The official loader snippet, inlined, rather than the `@microsoft/clarity`
 * npm package. The package is a thin wrapper over the same `window.clarity`
 * queue this snippet creates, and using it would mean a client component and
 * its bundle on pages where hydration weight has already been fought over
 * once: the hero LCP work took a landing page from 5.5s to 2.7s on slow 4G,
 * and the quote form was deliberately taken off the hydration path entirely.
 * Adding React to load an analytics tag would give that back.
 *
 * The snippet defines `window.clarity` as a queue immediately, so the tags
 * below are safe to call on the same tick — they queue and flush when the
 * collector arrives.
 *
 * PRIVACY. This records interactions on a real business's website, where the
 * quote form carries names, phone numbers and photos of somebody's car.
 * - Clarity masks text by default and that default is left ON.
 * - The form is additionally marked `data-clarity-mask` at its container, so
 *   it is excluded explicitly rather than by trusting a project setting that
 *   somebody could flip in a dashboard we do not control.
 * - `identify()` is never called. There is no version of tying a session
 *   recording to a named customer that is worth the exposure.
 * - A shop's privacy page says a session-analytics tool is in use, and says
 *   it only when that shop actually has one configured.
 */

// 'kept' is its own value, not folded into 'legal' or 'service': these are
// the pages carried over from a shop's old site, they are where live ads
// already point, and how they convert against the template's own pages is
// exactly the comparison worth being able to make.
export type SitePageType = 'home' | 'service' | 'location' | 'legal' | 'blog' | 'kept'

const LOADER = (projectId: string) =>
  `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
  `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` +
  `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})` +
  `(window,document,"clarity","script",${JSON.stringify(projectId)});`

/**
 * The tags are the whole reason this is worth wiring rather than pasting.
 *
 * Without them the export API returns one undifferentiated pile per shop.
 * With them, "dead clicks on the location pages, from paid clicks, on mobile"
 * is a question the aggregates can answer — and `paid` is the join to Google
 * Ads, which is where the conversion rate that matters is actually measured.
 *
 * `upgrade` prioritises the session for recording. At auto-glass volumes most
 * traffic is not worth a replay; a visit that arrived on a paid click is.
 */
const TAGS = (slug: string, pageType: SitePageType) =>
  `(function(){try{` +
  `var q=new URLSearchParams(location.search);` +
  `var paid=!!(q.get("gclid")||q.get("gbraid")||q.get("wbraid"));` +
  `window.clarity("set","shop",${JSON.stringify(slug)});` +
  `window.clarity("set","page_type",${JSON.stringify(pageType)});` +
  `window.clarity("set","paid_click",paid?"yes":"no");` +
  `if(paid){window.clarity("upgrade","paid_click");}` +
  `}catch(e){}})();`

export function SiteAnalytics({
  projectId,
  slug,
  pageType,
}: {
  projectId: string | null | undefined
  slug: string
  pageType: SitePageType
}) {
  // A shop with no project set gets no script at all — not an empty one.
  if (!projectId) return null
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: LOADER(projectId) }} />
      <script dangerouslySetInnerHTML={{ __html: TAGS(slug, pageType) }} />
    </>
  )
}
