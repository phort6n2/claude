import type { DigestSeo } from '@/lib/monthly-digest'

/**
 * The month's SEO work, inside our report — never the supplier's PDF.
 *
 * Read out of that PDF by `lib/seo-report.ts`; which three parts are shown,
 * and which are left out and why, is recorded there. Each block strips itself
 * when the report did not have it, and nothing here names who produced the
 * figures (§2, white label): to the shop, this is simply their report.
 *
 * `problems` are NOT rendered. They are for the operator, on the admin page;
 * a client reading "the links section could not be read" learns nothing they
 * can act on and something about how the report is made.
 */
export default function SeoWorkSection({ seo }: { seo: DigestSeo }) {
  const { articles, links, ai } = seo
  if (!articles && !links && !ai) return null

  const aiTrend =
    ai && ai.previousShare !== null && ai.previousLabel
      ? ai.share > ai.previousShare
        ? `up from ${ai.previousShare}% in ${ai.previousLabel}`
        : ai.share < ai.previousShare
          ? `down from ${ai.previousShare}% in ${ai.previousLabel}`
          : `the same as ${ai.previousLabel}`
      : null
  const rating =
    links && links.ratingFrom !== null && links.ratingTo !== null ? links : null

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">SEO</h3>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {articles && (
          <Stat label="Articles published" value={String(articles.published)} />
        )}
        {links && (
          <Stat
            label="Links earned"
            value={String(links.links)}
            hint={`from ${links.referringDomains} different sites`}
          />
        )}
        {ai && (
          <Stat
            label="Named in AI answers"
            value={`${ai.share}%`}
            hint={`${ai.named} of ${ai.asked} answers${aiTrend ? ` · ${aiTrend}` : ''}`}
          />
        )}
      </div>

      {articles && articles.list.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">
            {articles.list.length < articles.published ? 'Some of what was published' : 'What was published'}
          </h4>
          <ul className="space-y-1.5">
            {articles.list.map((a) => (
              <li key={`${a.published}:${a.title}`} className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{a.title}</span>
                <span className="block text-xs text-gray-500">{a.published}</span>
              </li>
            ))}
          </ul>
          {articles.visitors !== null && articles.visitors > 0 && (
            <p className="text-xs text-gray-500">
              {articles.visitors.toLocaleString('en-US')} visitors came in through the articles.
            </p>
          )}
        </div>
      )}

      {links && (rating || links.strongest.length > 0) && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">Links to your site</h4>
          {rating && (
            <p className="text-sm text-gray-700">
              Site authority {rating.ratingTo === rating.ratingFrom ? 'held at' : 'went from'}{' '}
              {rating.ratingTo === rating.ratingFrom ? (
                <strong>{rating.ratingTo}</strong>
              ) : (
                <>
                  <strong>{rating.ratingFrom}</strong> to <strong>{rating.ratingTo}</strong>
                </>
              )}
              {rating.since ? ` since ${rating.since}` : ''}.{' '}
              <span className="text-gray-500">
                A 0–100 score for how much weight other sites give yours; it moves slowly.
              </span>
            </p>
          )}
          {links.strongest.length > 0 && (
            <p className="text-sm text-gray-700">
              Strongest sites linking to you:{' '}
              {links.strongest.map((s, i) => (
                <span key={s.domain}>
                  {i > 0 && ', '}
                  {s.domain} <span className="text-gray-500">({s.rating})</span>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {ai && (ai.byAssistant.length > 0 || ai.competitors.length > 0 || ai.visitors) && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">AI answers</h4>
          {ai.byAssistant.length > 0 && (
            <p className="text-sm text-gray-700">
              {ai.byAssistant.map((b, i) => (
                <span key={b.name}>
                  {i > 0 && ' · '}
                  {b.name} <strong className="tabular-nums">{b.share}%</strong>
                </span>
              ))}
            </p>
          )}
          {ai.competitors.length > 0 && (
            <p className="text-sm text-gray-700">
              Also named:{' '}
              {ai.competitors.map((c, i) => (
                <span key={c.name}>
                  {i > 0 && ', '}
                  {c.name} <span className="text-gray-500">{c.share}%</span>
                </span>
              ))}
            </p>
          )}
          {ai.visitors !== null && ai.visitors > 0 && (
            <p className="text-xs text-gray-500">
              {ai.visitors.toLocaleString('en-US')} visitors came to your site from AI assistants.
            </p>
          )}
        </div>
      )}

      {seo.period && <p className="text-xs text-gray-500">SEO figures cover {seo.period}.</p>}
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-2xl font-extrabold tabular-nums text-gray-900">{value}</div>
      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}
