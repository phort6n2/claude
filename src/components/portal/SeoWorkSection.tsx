import { ArrowDownRight, ArrowUpRight, FileText, Link2, Sparkles } from 'lucide-react'
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
 *
 * THE LOOK. The first version was correct and read as a list of sentences
 * beside a supplier's PDF that had tiles, bars and a chart. So: a KPI row, then
 * the evidence as small bar charts. The charts are EMPHASIS charts — the shop
 * in its own brand ink, everyone else in grey — one hue plus a neutral, so the
 * only colour decision is the one the shop already made. `--brand-ink` rather
 * than `--brand`: it is darkened until it reads on white, so a yellow shop's
 * bar is a dark gold and never vanishes. Validated against the grey for every
 * real brand in the book (normal-vision ΔE ≥ 20, colour-blind ≥ 16). Every bar
 * carries its value as TEXT beside it, so colour is never the only channel.
 */
export default function SeoWorkSection({
  seo,
  showHeading = true,
}: {
  seo: DigestSeo
  /** Off when the section sits in a card that already names it. */
  showHeading?: boolean
}) {
  const { articles, links, ai } = seo
  if (!articles && !links && !ai) return null

  const rating = links && links.ratingFrom !== null && links.ratingTo !== null ? links : null
  const aiDelta =
    ai && ai.previousShare !== null && ai.previousLabel ? ai.share - ai.previousShare : null

  /* Share of voice, with the shop IN it. The reader drops the shop's own row
     from the PDF's list (its name wraps, and it must never be listed as its
     own competitor); the headline share is the same measure for the shop, so
     it goes back in here as "You". Ties put the shop first. */
  const voice = ai
    ? [
        { name: 'You', share: ai.share, you: true },
        ...ai.competitors.map((c) => ({ ...c, you: false })),
      ].sort((a, b) => b.share - a.share || Number(b.you) - Number(a.you))
    : []

  return (
    <section className="space-y-4">
      {showHeading && <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">SEO</h3>}

      <div className="grid gap-3 sm:grid-cols-3">
        {articles && (
          <Tile
            icon={<FileText className="h-4 w-4" />}
            label="Articles published"
            value={String(articles.published)}
            note={
              articles.visitors !== null && articles.visitors > 0
                ? `${articles.visitors.toLocaleString('en-US')} visitors came in through them`
                : undefined
            }
          />
        )}
        {links && (
          <Tile
            icon={<Link2 className="h-4 w-4" />}
            label="Links earned"
            value={String(links.links)}
            note={`from ${links.referringDomains} different sites`}
          />
        )}
        {ai && (
          <Tile
            icon={<Sparkles className="h-4 w-4" />}
            label="Named in AI answers"
            value={`${ai.share}%`}
            note={`${ai.named} of ${ai.asked} answers`}
            delta={
              aiDelta !== null && aiDelta !== 0 ? (
                <Delta up={aiDelta > 0} text={`${Math.abs(aiDelta)} pts vs ${ai.previousLabel}`} />
              ) : undefined
            }
          />
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {articles && articles.list.length > 0 && (
          <Panel
            title="Published"
            aside={
              articles.list.length < articles.published
                ? `${articles.list.length} of ${articles.published} shown`
                : undefined
            }
          >
            <ol className="divide-y divide-gray-100">
              {articles.list.map((a) => (
                <li
                  key={`${a.published}:${a.title}`}
                  className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <span className="min-w-0 text-sm font-medium leading-snug text-gray-900">{a.title}</span>
                  <span className="w-fit shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-600">
                    {a.published.replace(/,\s*\d{4}$/, '')}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        )}

        {links && (rating || links.strongest.length > 0) && (
          <Panel title="Links to your site">
            {rating && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-gray-700">
                    <span className="text-2xl font-extrabold tabular-nums text-gray-900">{rating.ratingTo}</span>
                    <span className="text-gray-500"> / 100 site authority</span>
                  </p>
                  {rating.ratingTo !== rating.ratingFrom && (
                    <Delta
                      up={(rating.ratingTo ?? 0) > (rating.ratingFrom ?? 0)}
                      text={`${Math.abs((rating.ratingTo ?? 0) - (rating.ratingFrom ?? 0))} since ${rating.since ?? 'last month'}`}
                    />
                  )}
                </div>
                {/* A METER: the track is the same ink at a light step, so the
                    whole 0–100 reads as one scale. The earlier value is a
                    hairline tick, so the change shows without a second bar. */}
                <div
                  className="relative h-2.5 rounded-full bg-[var(--brand-chip,#e5e7eb)]"
                  role="img"
                  aria-label={`Site authority ${rating.ratingTo} out of 100, up from ${rating.ratingFrom}`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--brand-ink,#1d4ed8)]"
                    style={{ width: `${clampPct(rating.ratingTo ?? 0)}%` }}
                  />
                  <div
                    className="absolute -top-1 h-[18px] w-0.5 rounded bg-gray-500"
                    style={{ left: `calc(${clampPct(rating.ratingFrom ?? 0)}% - 1px)` }}
                    title={`${rating.since ?? 'Earlier'}: ${rating.ratingFrom}`}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  How much weight other sites give yours. It moves slowly, so a point or two is real
                  progress.
                </p>
              </div>
            )}
            {links.strongest.length > 0 && (
              <div className={rating ? 'mt-4 space-y-2.5' : 'space-y-2.5'}>
                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Strongest sites linking to you
                </h5>
                {links.strongest.map((s) => (
                  <BarRow key={s.domain} label={s.domain} value={s.rating} display={String(s.rating)} emphasis />
                ))}
              </div>
            )}
          </Panel>
        )}
      </div>

      {ai && (
        <Panel title="AI answers" aside={`${ai.asked} answers checked`}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2.5">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                How often you are named
              </h5>
              {ai.previousShare !== null && ai.previousLabel && (
                <BarRow label={ai.previousLabel} value={ai.previousShare} display={`${ai.previousShare}%`} />
              )}
              <BarRow label="Now" value={ai.share} display={`${ai.share}%`} emphasis strong />
              {ai.byAssistant.length > 0 && (
                <>
                  <h5 className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    By assistant
                  </h5>
                  {ai.byAssistant.map((b) => (
                    <BarRow key={b.name} label={b.name} value={b.share} display={`${b.share}%`} emphasis />
                  ))}
                </>
              )}
            </div>
            {voice.length > 1 && (
              <div className="space-y-2.5">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Against other shops
                </h5>
                {voice.map((v) => (
                  <BarRow
                    key={v.name}
                    label={v.name}
                    value={v.share}
                    display={`${v.share}%`}
                    emphasis={v.you}
                    strong={v.you}
                  />
                ))}
              </div>
            )}
          </div>
          {ai.visitors !== null && ai.visitors > 0 && (
            <p className="mt-4 rounded-lg bg-[var(--brand-wash,#f8fafc)] px-3 py-2 text-sm text-gray-700">
              <strong className="tabular-nums">{ai.visitors.toLocaleString('en-US')}</strong> visitors came
              to your site from AI assistants.
            </p>
          )}
        </Panel>
      )}

      {seo.period && <p className="text-xs text-gray-500">SEO figures cover {seo.period}.</p>}
    </section>
  )
}

const clampPct = (n: number) => Math.max(0, Math.min(100, n))

function Tile({
  icon,
  label,
  value,
  note,
  delta,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note?: string
  delta?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-chip,#eef2ff)] text-[var(--brand-ink,#1d4ed8)]">
          {icon}
        </span>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="text-3xl font-extrabold leading-none tabular-nums text-gray-900">{value}</span>
        {delta}
      </div>
      {note && <p className="mt-1.5 text-xs text-gray-500">{note}</p>}
    </div>
  )
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        {aside && <span className="text-xs text-gray-500">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * A change, with an arrow AND words — never colour alone. Up is green; down is
 * a neutral grey rather than red: a sampled share dipping one month is not an
 * alarm, and red on a client's report reads as one.
 */
function Delta({ up, text }: { up: boolean; text: string }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? 'Up' : 'Down'} {text}
    </span>
  )
}

/**
 * One bar on a 0–100 scale: label and value on one line, the bar beneath, so
 * a long name wraps instead of being clipped and the row works at 320px.
 * Rounded data-end, square at the baseline; a faint track shows the scale;
 * the value is always printed.
 */
function BarRow({
  label,
  value,
  display,
  emphasis = false,
  strong = false,
}: {
  label: string
  value: number
  display: string
  emphasis?: boolean
  strong?: boolean
}) {
  return (
    <div title={`${label}: ${display}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={`min-w-0 break-words ${strong ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
          {label}
        </span>
        <span className={`shrink-0 tabular-nums ${strong ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
          {display}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-r-[4px] bg-gray-100">
        <div
          className="h-full rounded-r-[4px]"
          style={{
            width: `${clampPct(value)}%`,
            background: emphasis ? 'var(--brand-ink, #1d4ed8)' : '#9ca3af',
          }}
        />
      </div>
    </div>
  )
}
