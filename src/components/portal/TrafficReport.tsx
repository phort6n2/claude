import Link from 'next/link'
import { ArrowRight, Globe, Search, Sparkles, TrendingUp, Users } from 'lucide-react'
import type { SearchReport, TrafficReport as Traffic } from '@/lib/site-analytics'

/**
 * "How people find you" — the shop's own website, measured.
 *
 * TWO STATES, ONE PAGE. For an SEO client it is the report. For everyone else
 * it is the argument for buying the service, and it is deliberately the same
 * page: a shop that has never seen what the reporting looks like has no idea
 * what they are being offered.
 *
 * EVERY NUMBER HERE IS GOOGLE'S, NOT OURS. Nothing is estimated, grossed up
 * or modelled — the same rule the monthly report runs on. Where a figure
 * understates (AI referrals, and Search Console's two-day lag) the page says
 * so beside it rather than quietly presenting a floor as a count.
 */

function Tile({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-extrabold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * A plain area sparkline. Hand-drawn SVG for the same reason RankTrend is:
 * one chart does not justify a charting library on a page a shop opens on a
 * phone.
 */
function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const W = 640
  const H = 90
  const max = Math.max(...points, 1)
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - (v / max) * (H - 4) - 2
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-24"
      role="img"
      aria-label="Daily trend"
    >
      <path
        d={`${line.join(' ')} L ${W} ${H} L 0 ${H} Z`}
        fill={color}
        fillOpacity="0.12"
        stroke="none"
      />
      <path d={line.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Bars({ rows }: { rows: Array<{ name: string; value: number; share: number }> }) {
  if (!rows.length) return <p className="text-sm text-gray-500">Nothing recorded yet.</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-gray-700">{row.name}</span>
            <span className="text-gray-500 tabular-nums">
              {row.value.toLocaleString()} <span className="text-gray-400">· {row.share}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(row.value / max) * 100}%`, backgroundColor: 'var(--brand)' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {sub && <p className="text-sm text-gray-500 mb-3">{sub}</p>}
      <div className={sub ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

/** Wide tables scroll inside their own box; the page never scrolls sideways. */
function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto -mx-5 px-5">{children}</div>
}

export function TrafficUpsell({ businessName }: { businessName: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">How people find you</h1>
        <p className="text-gray-500">
          This page reports on {businessName}&apos;s own website — who reaches it, what they
          searched for, and which pages do the work.
        </p>
      </div>

      <section
        className="rounded-2xl p-6 text-white shadow-sm"
        style={{ backgroundColor: 'var(--brand)' }}
      >
        <p className="text-sm font-semibold uppercase tracking-wide opacity-80">Not switched on</p>
        <h2 className="mt-1 text-xl font-extrabold">Add SEO and this page fills in</h2>
        {/* No promises about rank, timing or results — see the content rules.
            It describes what the REPORTING shows, which is a fact about this
            page, not a claim about an outcome we cannot guarantee. */}
        <p className="mt-2 text-white/90">
          Your ads buy clicks for as long as you pay for them. Search results keep sending people
          after the spend stops. We measure that side the same way we measure the ads — from
          Google&apos;s own numbers, with nothing estimated.
        </p>
        <a
          href="mailto:hello@glassleads.app?subject=SEO%20for%20my%20shop"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-bold no-underline"
          style={{ color: 'var(--brand-ink)' }}
        >
          Ask about SEO
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            icon: Users,
            title: 'Who arrives, and from where',
            body: 'Visitors to your site each day, split by how they got there — Google, a map listing, a link someone shared, or straight to your address.',
          },
          {
            icon: Search,
            title: 'What they searched for',
            body: 'The actual Google searches your site appeared for, how often it was shown, how often it was clicked, and where it sat on the page.',
          },
          {
            icon: TrendingUp,
            title: 'Which pages do the work',
            body: 'Your best pages ranked by the people they bring in — so effort goes where it already pays.',
          },
          {
            icon: Sparkles,
            title: 'Whether AI is sending anyone',
            body: 'Visits that arrive from ChatGPT, Gemini, Copilot and the rest. A growing share of "who fixes windshields near me" is answered there now.',
          },
        ].map((card) => (
          <div key={card.title} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
              <card.icon className="h-4 w-4" />
              {card.title}
            </div>
            <p className="mt-2 text-sm text-gray-600">{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TrafficReport({
  businessName,
  traffic,
  search,
  fetchedAt,
  error,
}: {
  businessName: string
  traffic: Traffic | null
  search: SearchReport | null
  fetchedAt: string | null
  error: string | null
}) {
  const nothing = !traffic && !search
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">How people find you</h1>
        <p className="text-gray-500">
          {businessName}&apos;s own website over the last 90 days. Every figure comes straight from
          Google — nothing here is estimated.
        </p>
      </div>

      {/* Stale data plus a reason beats an empty page: an operator finds out
          the property was un-shared, and the shop still sees last week. */}
      {error && (
        <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          These numbers stopped updating. We are on it.
          {fetchedAt && ` Last read ${new Date(fetchedAt).toLocaleDateString()}.`}
        </p>
      )}

      {nothing && !error && (
        <p className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-600">
          We are still connecting your website&apos;s analytics. This page fills in once that is
          done.
        </p>
      )}

      {traffic && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              label="People on your site"
              value={traffic.activeUsers.toLocaleString()}
              sub="last 90 days"
              icon={Users}
            />
            <Tile
              label="Visits"
              value={traffic.sessions.toLocaleString()}
              sub="one person can visit more than once"
              icon={Globe}
            />
            <Tile
              label="Sent by AI assistants"
              value={traffic.aiUsers.toLocaleString()}
              sub="at least — most arrive unlabelled"
              icon={Sparkles}
            />
          </div>

          <Panel title="Visitors, day by day">
            <Spark points={traffic.daily.map((d) => d.value)} color="var(--brand)" />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="How they got here" sub="Every visitor, grouped by what brought them.">
              <Bars rows={traffic.channels} />
            </Panel>
            <Panel
              title="AI assistants"
              // The honest caveat, next to the number rather than in a footer.
              sub="A floor, not a count — most AI referrals arrive with nothing to identify them and land in Direct."
            >
              <Bars rows={traffic.aiSources} />
            </Panel>
          </div>

          {traffic.topPages.length > 0 && (
            <Panel title="Your busiest pages">
              <Scroller>
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 font-medium">Page</th>
                      <th className="py-2 font-medium text-right">People</th>
                      <th className="py-2 font-medium text-right">Share</th>
                      <th className="py-2 font-medium text-right">Mostly from</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traffic.topPages.map((row) => (
                      <tr key={row.page} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3 text-gray-900 break-all">{row.page}</td>
                        <td className="py-2 text-right tabular-nums">{row.users.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{row.share}%</td>
                        <td className="py-2 text-right text-gray-500">{row.topSource}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            </Panel>
          )}
        </>
      )}

      {search && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile
              label="Clicks from Google"
              value={search.clicks.toLocaleString()}
              sub="people who chose your result"
              icon={Search}
            />
            <Tile
              label="Times you were shown"
              value={search.impressions.toLocaleString()}
              sub="appearances in search results"
              icon={Globe}
            />
            <Tile
              label="Average position"
              value={search.averagePosition ? search.averagePosition.toFixed(1) : '—'}
              sub="1 is the top result"
              icon={TrendingUp}
            />
          </div>

          <Panel
            title="Google search, day by day"
            // The lag is stated, because "the last two days look dead" is
            // otherwise a support call every single week.
            sub="Google reports search data two to three days behind, so the last couple of days always look light."
          >
            <Spark points={search.daily.map((d) => d.clicks)} color="var(--brand)" />
          </Panel>

          {search.topQueries.length > 0 && (
            <Panel title="What people searched for">
              <Scroller>
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 font-medium">Search</th>
                      <th className="py-2 font-medium text-right">Clicks</th>
                      <th className="py-2 font-medium text-right">Shown</th>
                      <th className="py-2 font-medium text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search.topQueries.map((row) => (
                      <tr key={row.query} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3 text-gray-900">{row.query}</td>
                        <td className="py-2 text-right tabular-nums">{row.clicks.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">
                          {row.impressions.toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-500">
                          {row.position.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            </Panel>
          )}

          {search.topPages.length > 0 && (
            <Panel title="Pages Google sends people to">
              <Scroller>
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 font-medium">Page</th>
                      <th className="py-2 font-medium text-right">Clicks</th>
                      <th className="py-2 font-medium text-right">Shown</th>
                      <th className="py-2 font-medium text-right">Clicked</th>
                      <th className="py-2 font-medium text-right">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {search.topPages.map((row) => (
                      <tr key={row.page} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3 text-gray-900 break-all">{row.page}</td>
                        <td className="py-2 text-right tabular-nums">{row.clicks.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">
                          {row.impressions.toLocaleString()}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{row.ctr}%</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">
                          {row.position.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Scroller>
            </Panel>
          )}
        </>
      )}

      <p className="text-sm text-gray-400">
        <Link href="/portal" className="underline">
          Back to your dashboard
        </Link>
      </p>
    </div>
  )
}
