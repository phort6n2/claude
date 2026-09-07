'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Globe, Search, Sparkles, TrendingUp, Users, LineChart } from 'lucide-react'
import type { RangeKey, SearchReport, TrafficReport as Traffic } from '@/lib/site-analytics'
import TrafficChart from '@/components/portal/TrafficChart'
import RangePicker from '@/components/portal/RangePicker'

/**
 * "How people find you" — the shop's own website, measured.
 *
 * TWO STATES. For a shop with a property connected it is the report; for
 * everyone else it is the argument for buying the service, deliberately on
 * the same page, because a shop that has never seen what the reporting looks
 * like has no idea what they are being offered.
 *
 * THREE TABS, ONE FETCH. All traffic, AI search and Google search are three
 * questions about the same window and the answers all arrive in one payload,
 * so switching tabs is instant and costs nothing. Only the RANGE goes back to
 * Google, because a 7-day channel breakdown genuinely is a different query
 * rather than the 90-day one sliced.
 *
 * EVERY NUMBER IS GOOGLE'S, NOT OURS. Nothing is estimated, grossed up or
 * modelled — the same rule the monthly report runs on. Where a figure
 * understates (AI referrals, and Search Console's lag) the page says so beside
 * it rather than presenting a floor as a count.
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
      <p className="mt-2 text-3xl font-extrabold text-gray-900 tabular-nums break-words">{value}</p>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
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
              style={{
                width: `${(row.value / max) * 100}%`,
                backgroundColor: 'var(--brand, #1d4ed8)',
              }}
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

/** A page path as a shop reads it. "/" is the homepage, not an empty cell. */
function pageLabel(path: string): string {
  return path === '/' || path === '' ? 'Homepage' : path
}

function PageTable({
  rows,
  lastLabel,
}: {
  rows: Array<{ page: string; users: number; share: number; last: string }>
  lastLabel: string
}) {
  if (!rows.length) return <p className="text-sm text-gray-500">Nothing recorded yet.</p>
  return (
    <Scroller>
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 font-medium">Page</th>
            <th className="py-2 font-medium text-right">People</th>
            <th className="py-2 font-medium text-right">Share</th>
            <th className="py-2 font-medium text-right">{lastLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.page} className="border-b border-gray-100 last:border-0">
              <td className="py-2 pr-3 text-gray-900 break-all">{pageLabel(row.page)}</td>
              <td className="py-2 text-right tabular-nums">{row.users.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums text-gray-500">{row.share}%</td>
              <td className="py-2 text-right text-gray-500">{row.last}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroller>
  )
}

/**
 * The site these numbers are about, said plainly and linked.
 *
 * A shop has two sites — the one they already had and the landing page this
 * platform hosts — and a page of numbers with no address on it invites them
 * to assume the wrong one.
 */
function SiteLine({ siteUrl }: { siteUrl: string | null }) {
  if (!siteUrl) return null
  const href = siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 no-underline hover:bg-gray-50"
    >
      <Globe className="h-3.5 w-3.5 text-gray-400" />
      {siteUrl}
    </a>
  )
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
        style={{ backgroundColor: 'var(--brand, #1d4ed8)' }}
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
          style={{ color: 'var(--brand-ink, #1e40af)' }}
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
          <div
            key={card.title}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
          >
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

type TabKey = 'all' | 'ai' | 'google'

export default function TrafficReport({
  siteUrl,
  range,
  traffic,
  search,
  fetchedAt,
  error,
  showPortalLink = true,
}: {
  /** The shop's OWN site, so nobody has to wonder which one this counts. */
  siteUrl: string | null
  range: RangeKey
  traffic: Traffic | null
  search: SearchReport | null
  fetchedAt: string | null
  error: string | null
  /* The admin renders this same component on the SEO tab to check what a shop
     was sent. The footer link back to the portal dashboard is meaningless
     there — and would drop an operator into a client's portal. */
  showPortalLink?: boolean
}) {
  const [tab, setTab] = useState<TabKey>('all')
  const nothing = !traffic && !search

  const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; enabled: boolean }> = [
    { key: 'all', label: 'All traffic', icon: LineChart, enabled: !!traffic },
    { key: 'ai', label: 'AI search', icon: Sparkles, enabled: !!traffic },
    { key: 'google', label: 'Google search', icon: Search, enabled: !!search },
  ]
  // A tab whose half of the setup is missing is not offered, rather than
  // offered and empty — Search Console can be connected without Analytics and
  // the other way round.
  const shown = TABS.filter((t) => t.enabled)
  const active = shown.some((t) => t.key === tab) ? tab : (shown[0]?.key ?? 'all')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">How people find you</h1>
          <p className="text-gray-500">Straight from Google — nothing here is estimated.</p>
          <div className="mt-2">
            <SiteLine siteUrl={siteUrl} />
          </div>
        </div>
        <RangePicker value={range} />
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

      {shown.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {shown.map((t) => {
            const on = t.key === active
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={on ? 'page' : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  on
                    ? 'text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
                style={on ? { borderColor: 'var(--brand, #1d4ed8)' } : undefined}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {active === 'all' && traffic && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="People on your site"
              value={(traffic.activeUsers ?? 0).toLocaleString()}
              sub="in this period"
              icon={Users}
            />
            <Tile
              label="Visits"
              value={(traffic.sessions ?? 0).toLocaleString()}
              sub="one person can visit more than once"
              icon={Globe}
            />
            <Tile
              label="Top channel"
              value={traffic.channels?.[0]?.name ?? '—'}
              sub={
                traffic.channels?.[0]
                  ? `${traffic.channels[0].value.toLocaleString()} people · ${traffic.channels[0].share}%`
                  : 'nothing recorded yet'
              }
              icon={TrendingUp}
            />
            <Tile
              label="Sent by AI"
              value={(traffic.aiUsers ?? 0).toLocaleString()}
              sub="at least — most arrive unlabelled"
              icon={Sparkles}
            />
          </div>

          <Panel
            title="Where your visitors come from"
            sub="Every visitor by day and by channel. Hover the chart for one day; tap a colour to hide it."
          >
            <TrafficChart series={traffic.series} />
          </Panel>

          <Panel title="Channel breakdown">
            <Bars rows={traffic.channels ?? []} />
          </Panel>

          <Panel title="Top pages" sub="Which pages bring the most people in.">
            <PageTable
              rows={(traffic.topPages ?? []).map((p) => ({ ...p, last: p.topSource }))}
              lastLabel="Mostly from"
            />
          </Panel>
        </>
      )}

      {active === 'ai' && traffic && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="People from AI"
              value={(traffic.aiUsers ?? 0).toLocaleString()}
              sub="in this period"
              icon={Sparkles}
            />
            <Tile
              label="Visits from AI"
              value={(traffic.aiSessions ?? 0).toLocaleString()}
              sub="sessions that started at an assistant"
              icon={Globe}
            />
            <Tile
              label="Top assistant"
              value={traffic.aiSources?.[0]?.name ?? '—'}
              sub={
                traffic.aiSources?.[0]
                  ? `${traffic.aiSources[0].value.toLocaleString()} people · ${traffic.aiSources[0].share}%`
                  : 'none seen yet'
              }
              icon={TrendingUp}
            />
            <Tile
              label="Assistants seen"
              value={String(traffic.aiSources?.length ?? 0)}
              sub="sending at least one visit"
              icon={Users}
            />
          </div>

          {/* The caveat sits on the tab it applies to, not in a footnote. */}
          <p className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
            Read these as a floor, not a count. Most AI referrals arrive with nothing to identify
            them and land in Direct, so the real number is higher. What is worth watching is
            whether it grows.
          </p>

          <Panel
            title="Which assistants send people"
            sub="By day, per assistant. Hover for one day; tap a colour to hide it."
          >
            <TrafficChart series={traffic.aiSeries} />
          </Panel>

          <Panel title="Assistant breakdown">
            <Bars rows={traffic.aiSources ?? []} />
          </Panel>

          <Panel title="Top pages" sub="Which pages AI assistants send people to.">
            <PageTable
              rows={(traffic.aiTopPages ?? []).map((p) => ({ ...p, last: p.topModel }))}
              lastLabel="Mostly from"
            />
          </Panel>
        </>
      )}

      {active === 'google' && search && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Clicks from Google"
              value={(search.clicks ?? 0).toLocaleString()}
              sub="people who chose your result"
              icon={Search}
            />
            <Tile
              label="Times you were shown"
              value={(search.impressions ?? 0).toLocaleString()}
              sub="appearances in search results"
              icon={Globe}
            />
            <Tile
              label="Click rate"
              value={
                search.impressions
                  ? `${Math.round((search.clicks / search.impressions) * 1000) / 10}%`
                  : '—'
              }
              sub="of the times you were shown"
              icon={TrendingUp}
            />
            <Tile
              label="Average position"
              value={search.averagePosition ? search.averagePosition.toFixed(1) : '—'}
              sub="1 is the top result"
              icon={Users}
            />
          </div>

          <Panel
            title="Google search, over time"
            /* Both limits stated where they bite: the reporting lag, and the
               clamp that stops "All time" quietly meaning something shorter
               without saying so. */
            sub={`Google reports search data two to three days behind, so the last couple of days always look light.${
              search.clamped ? ' Search Console keeps 16 months, so this window stops there.' : ''
            }`}
          >
            <TrafficChart series={search.series} initiallyHidden={['Impressions']} />
          </Panel>

          {(search.topQueries?.length ?? 0) > 0 && (
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
                    {(search.topQueries ?? []).map((row) => (
                      <tr key={row.query} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3 text-gray-900">{row.query}</td>
                        <td className="py-2 text-right tabular-nums">
                          {row.clicks.toLocaleString()}
                        </td>
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

          <Panel title="Top pages" sub="Which pages Google sends people to.">
            {search.topPages?.length ? (
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
                    {(search.topPages ?? []).map((row) => (
                      <tr key={row.page} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-3 text-gray-900 break-all">{row.page}</td>
                        <td className="py-2 text-right tabular-nums">
                          {row.clicks.toLocaleString()}
                        </td>
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
            ) : (
              <p className="text-sm text-gray-500">Nothing recorded yet.</p>
            )}
          </Panel>
        </>
      )}

      {showPortalLink && (
        <p className="text-sm text-gray-400">
          <Link href="/portal" className="underline">
            Back to your dashboard
          </Link>
        </p>
      )}
    </div>
  )
}
