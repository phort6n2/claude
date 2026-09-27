import { ArrowRight, MapPin, Search, Sparkles } from 'lucide-react'

/**
 * The case for SEO, for a shop that does not have it. ONE component, read by
 * the Traffic page and the Rankings page, so the two cannot describe the
 * service differently.
 *
 * It names all THREE places the work shows up — the map, Google search and AI
 * answers. The Traffic page's version only ever talked about the website, so
 * a shop reading its map rankings (the report they look at most) was never
 * told SEO has anything to do with them, which is the part of the service a
 * local shop feels first.
 *
 * WHAT THE WORK AIMS AT, NEVER WHAT IT WILL DO. No rank, no position, no
 * timescale: an owner quotes a promise back the month it does not come true,
 * and nothing here can guarantee where Google puts anybody. The one concrete
 * claim is a fact about THIS platform — an SEO shop's rankings are measured on
 * four searches weekly rather than two monthly (`syncCampaignTier`).
 */
export default function SeoPitch({
  where,
  businessName,
}: {
  /** Which page it sits on — the headline answers the question that page raises. */
  where: 'traffic' | 'rankings'
  businessName: string
}) {
  const heading =
    where === 'traffic'
      ? `Add SEO and this report fills in for ${businessName}`
      : 'Add SEO to work on these rankings'
  return (
    <section
      className="rounded-2xl p-6 text-white shadow-sm"
      style={{ backgroundColor: 'var(--brand, #1d4ed8)' }}
    >
      <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
        {where === 'traffic' ? 'Not switched on' : 'SEO'}
      </p>
      <h2 className="mt-1 text-xl font-extrabold">{heading}</h2>
      <p className="mt-2 text-white/90 max-w-prose">
        You already pay to be found through ads. SEO is the other half — the places people find
        a shop without clicking an ad — and it is built to lift all three together.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3 list-none p-0">
        <li className="rounded-xl bg-white/10 p-3">
          <MapPin className="h-5 w-5" />
          <p className="mt-1.5 font-bold">Map rankings</p>
          <p className="text-sm text-white/85">
            Where you sit in Google&apos;s map results across your area — the listings people call
            straight from.
          </p>
        </li>
        <li className="rounded-xl bg-white/10 p-3">
          <Search className="h-5 w-5" />
          <p className="mt-1.5 font-bold">Google search</p>
          <p className="text-sm text-white/85">
            Your own website showing up for the searches that bring jobs, not only for your name.
          </p>
        </li>
        <li className="rounded-xl bg-white/10 p-3">
          <Sparkles className="h-5 w-5" />
          <p className="mt-1.5 font-bold">AI answers</p>
          <p className="text-sm text-white/85">
            Being the shop ChatGPT, Gemini and the rest name when someone asks who fixes
            windshields near them.
          </p>
        </li>
      </ul>
      {where === 'rankings' && (
        <p className="mt-3 text-sm text-white/85">
          With SEO, these rankings are measured on four searches every week instead of two once a
          month, so you can see the work moving.
        </p>
      )}
      <a
        href="mailto:hello@glassleads.app?subject=SEO%20for%20my%20shop"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-bold no-underline"
        style={{ color: 'var(--brand-ink, #1e40af)' }}
      >
        Ask about SEO
        <ArrowRight className="h-4 w-4" />
      </a>
    </section>
  )
}
