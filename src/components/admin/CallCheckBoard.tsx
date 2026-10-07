'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info, Loader2, PhoneCall, XCircle } from 'lucide-react'
import type { WeekRow, CallCheckVerdict } from '@/lib/call-check'

/**
 * One row per shop; the Google side is fetched when somebody asks, because it
 * is four queries per account and fifteen accounts on page load is a screen
 * nobody opens twice.
 *
 * The columns are in the order the question is asked: what rang our numbers,
 * how much of that came from an ad's call button (Google logged it too), how
 * much did not, and what Google CREDITED as website calls — beside the old
 * HighLevel "AGMP Call" for the weeks before a shop moved over.
 */

export interface CallCheckClient {
  id: string
  businessName: string
  hasAdsAccount: boolean
  trackingNumbers: number
}

interface Leftover {
  at: string
  areaCode: string | null
  status: string | null
  durationSecs: number | null
  leadId?: string
}

interface Result {
  days: number
  since: string
  timezone: string
  adsAccount: string | null
  googleError: string | null
  callAssets: Array<{ phone: string; ours: boolean }>
  weeks: WeekRow[]
  verdicts: CallCheckVerdict[]
  notFromAdButton: Leftover[]
  googleOnly: Leftover[]
}

type State = { running: boolean; result?: Result; error?: string; open?: boolean }

const DAY_OPTIONS = [30, 90, 180, 365]

export default function CallCheckBoard({ clients }: { clients: CallCheckClient[] }) {
  const [days, setDays] = useState(90)
  const [state, setState] = useState<Record<string, State>>({})

  async function check(id: string) {
    setState((s) => ({ ...s, [id]: { ...s[id], running: true, error: undefined } }))
    try {
      const res = await fetch(`/api/admin/call-check/${id}?days=${days}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setState((s) => ({ ...s, [id]: { running: false, result: data, open: s[id]?.open ?? true } }))
    } catch (e) {
      setState((s) => ({ ...s, [id]: { running: false, error: e instanceof Error ? e.message : 'Failed' } }))
    }
  }

  async function checkAll() {
    // One at a time: fifteen accounts in parallel is how a quota trips.
    for (const c of clients) await check(c.id)
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-700 space-y-2">
        <p>
          <strong>How to read this.</strong> Every call that rings one of our tracking numbers is recorded here. A call
          Google also logged came from an <em>ad&apos;s call button</em>. The rest came from the website, the Business
          Profile or somebody dialling direct, and only the website ones can ever count as Google&apos;s
          &ldquo;AGMP Website Call&rdquo;.
        </p>
        <p>
          If many calls reach us without coming from an ad button while Google credits almost none to the website,
          Google is missing calls the pages produce. If both are low, fewer people are calling. Google&apos;s call log
          does not go back as far as its conversion counts, so older weeks show conversions only.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">
          Period{' '}
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="ml-1 rounded-md border px-2 py-1 text-sm"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === 365 ? 'Last year' : `Last ${d} days`}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={checkAll}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          Check every shop
        </button>
        <span className="text-xs text-gray-500">Read-only — nothing in Google Ads or the app is changed.</span>
      </div>

      {clients.map((c) => {
        const s = state[c.id]
        return (
          <div key={c.id} className="rounded-xl border bg-white">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <PhoneCall className="h-4 w-4 text-gray-400" />
              <Link href={`/admin/clients/${c.id}`} className="font-semibold text-gray-900 hover:underline">
                {c.businessName}
              </Link>
              <span className="text-xs text-gray-500">
                {c.trackingNumbers} tracking number{c.trackingNumbers === 1 ? '' : 's'}
                {c.hasAdsAccount ? '' : ' · no Google Ads account linked'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {s?.result && (
                  <button
                    onClick={() => setState((st) => ({ ...st, [c.id]: { ...st[c.id], open: !st[c.id]?.open } }))}
                    className="text-sm text-gray-600 hover:underline"
                  >
                    {s.open ? 'Hide weeks' : 'Show weeks'}
                  </button>
                )}
                <button
                  onClick={() => check(c.id)}
                  disabled={s?.running}
                  className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {s?.running ? <Loader2 className="h-4 w-4 animate-spin" /> : s?.result ? 'Check again' : 'Check'}
                </button>
              </div>
            </div>
            {s?.error && <p className="px-4 pb-4 text-sm text-red-700">{s.error}</p>}
            {s?.result && <ResultView result={s.result} open={!!s.open} />}
          </div>
        )
      })}
      {!clients.length && <p className="text-sm text-gray-500">No live client has a tracking number or an ads account.</p>}
    </div>
  )
}

function ResultView({ result, open }: { result: Result; open: boolean }) {
  const totals = result.weeks.reduce(
    (t, w) => ({
      app: t.app + w.appCalls,
      ad: t.ad + w.fromAdButton,
      notAd: t.notAd + w.notFromAdButton,
      gOnly: t.gOnly + w.googleOnly,
      web: t.web + w.conversions.websiteCall,
      legacy: t.legacy + w.conversions.legacyCall,
    }),
    { app: 0, ad: 0, notAd: 0, gOnly: 0, web: 0, legacy: 0 }
  )
  return (
    <div className="border-t px-4 pb-4 pt-3 space-y-3">
      {result.googleError && (
        <p className="text-sm text-amber-800">Google could not be read in full: {result.googleError}</p>
      )}
      <ul className="space-y-1">
        {result.verdicts.map((v, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-800">
            <VerdictIcon tone={v.tone} />
            <span>{v.text}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
        <Stat label="Calls to our numbers" value={totals.app} />
        <Stat label="From an ad's call button" value={totals.ad} />
        <Stat label="Not from an ad button" value={totals.notAd} />
        <Stat label="Google credited to website" value={round1(totals.web)} />
        <Stat label="HighLevel “AGMP Call” (old)" value={round1(totals.legacy)} />
        <Stat label="Google ad calls we never saw" value={totals.gOnly} />
      </div>
      {result.callAssets.length > 0 && (
        <p className="text-xs text-gray-600">
          Ads&apos; call assets ring:{' '}
          {result.callAssets.map((a, i) => (
            <span key={i} className={a.ours ? 'text-gray-800' : 'text-amber-800'}>
              {i ? ', ' : ''}
              {a.phone} {a.ours ? '(our tracking number)' : '(not a tracking number — we cannot see these calls)'}
            </span>
          ))}
        </p>
      )}
      {open && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-1 pr-3">Week of</th>
                  <th className="py-1 pr-3">Our calls</th>
                  <th className="py-1 pr-3">Answered</th>
                  <th className="py-1 pr-3">From ad button</th>
                  <th className="py-1 pr-3">Not from ad button</th>
                  <th className="py-1 pr-3">Google: website calls</th>
                  <th className="py-1 pr-3">Google: calls from ads</th>
                  <th className="py-1 pr-3">HighLevel: AGMP Call</th>
                  <th className="py-1 pr-3">Forms (new / HighLevel)</th>
                  <th className="py-1 pr-3">Ad calls we never saw</th>
                </tr>
              </thead>
              <tbody>
                {result.weeks.map((w) => (
                  <tr key={w.week} className="border-t">
                    <td className="py-1 pr-3 whitespace-nowrap">{w.week}</td>
                    <td className="py-1 pr-3">{w.appCalls}</td>
                    <td className="py-1 pr-3">{w.appAnswered}</td>
                    <td className="py-1 pr-3">{w.fromAdButton}</td>
                    <td className="py-1 pr-3">{w.notFromAdButton}</td>
                    <td className="py-1 pr-3">{round1(w.conversions.websiteCall)}</td>
                    <td className="py-1 pr-3">{round1(w.conversions.callFromAds)}</td>
                    <td className="py-1 pr-3">{round1(w.conversions.legacyCall)}</td>
                    <td className="py-1 pr-3">
                      {round1(w.conversions.leadForm)} / {round1(w.conversions.legacyForm)}
                    </td>
                    <td className={`py-1 pr-3 ${w.googleOnly ? 'text-amber-800 font-medium' : ''}`}>{w.googleOnly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Leftovers
            title="Recent calls that did not come from an ad's call button"
            rows={result.notFromAdButton}
            timezone={result.timezone}
          />
          <Leftovers
            title="Recent ad calls Google logged that never reached our numbers"
            rows={result.googleOnly}
            timezone={result.timezone}
          />
        </>
      )}
    </div>
  )
}

function Leftovers({ title, rows, timezone }: { title: string; rows: Leftover[]; timezone: string }) {
  if (!rows.length) return null
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-700">
        {title} ({rows.length}
        {rows.length === 40 ? '+' : ''})
      </summary>
      <table className="mt-1">
        <tbody>
          {rows.map((r, i) => (
            <Fragment key={i}>
              <tr className="border-t">
                <td className="py-0.5 pr-3 whitespace-nowrap">
                  {new Date(r.at).toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="py-0.5 pr-3">{r.areaCode ? `(${r.areaCode})` : 'number withheld'}</td>
                <td className="py-0.5 pr-3">{r.status || '—'}</td>
                <td className="py-0.5 pr-3">{r.durationSecs != null ? `${r.durationSecs}s` : ''}</td>
                <td className="py-0.5 pr-3">
                  {r.leadId && (
                    <Link href={`/admin/leads/${r.leadId}`} className="underline">
                      lead
                    </Link>
                  )}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-gray-50 px-3 py-2">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-[11px] leading-tight text-gray-600">{label}</div>
    </div>
  )
}

function VerdictIcon({ tone }: { tone: CallCheckVerdict['tone'] }) {
  if (tone === 'bad') return <XCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
  if (tone === 'warn') return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
  if (tone === 'ok') return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
  return <Info className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10)
}
