'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * Where the money actually lands.
 *
 * Off-target rows lead and are never folded away — each names the campaign,
 * the ad or sitelink, and the exact URL, because "3 ads point at the old
 * site" is a finding nobody can act on without knowing which three. The
 * clean rows collapse to a count; reading ninety correct URLs to find the
 * three wrong ones is the job this card exists to remove.
 */

interface JudgedUrl {
  url: string
  host: string | null
  ok: boolean
}

interface LandingRow {
  level: 'ad' | 'asset-group' | 'sitelink'
  campaign: string | null
  adGroup: string | null
  label: string
  urls: JudgedUrl[]
  ok: boolean
}

interface Audit {
  customerId: string
  allowedHosts: string[]
  rows: LandingRow[]
  checked: number
  offTarget: number
  strayHosts: string[]
}

const LEVEL_LABEL: Record<LandingRow['level'], string> = {
  ad: 'Ad',
  'asset-group': 'PMax asset group',
  sitelink: 'Sitelink',
}

/** Rows with no campaign (account-level sitelinks) group under this label. */
const ACCOUNT_LEVEL = 'Account-level sitelinks'

export default function LandingPagesCard({ clientId }: { clientId: string }) {
  const [audit, setAudit] = useState<Audit | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showClean, setShowClean] = useState(false)
  // Campaigns the operator has unticked — a branding campaign that points at
  // a partner page on purpose, a test they know about. Kept per client in
  // localStorage: it is a viewing preference for one admin, not a fact about
  // the account, and a DB column would promote it to one.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const storageKey = `ads-landing-excluded:${clientId}`

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(stored)) setExcluded(new Set(stored.filter((v) => typeof v === 'string')))
    } catch {
      /* fresh browser, nothing stored */
    }
  }, [storageKey])

  const toggleCampaign = (name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {
        /* private mode — the tick still works for this visit */
      }
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setReason(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ads-landing`)
      if (!res.ok) throw new Error(await errorFrom(res, 'The check failed'))
      const data = await res.json()
      setAudit(data.audit)
      if (!data.audit) setReason(data.reason || 'The check did not run.')
    } catch (err) {
      setAudit(null)
      setReason(err instanceof Error ? err.message : 'The check failed')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  const campaignOf = (row: LandingRow) => row.campaign || ACCOUNT_LEVEL
  const campaigns = [...new Set((audit?.rows ?? []).map(campaignOf))].sort((a, b) =>
    a === ACCOUNT_LEVEL ? 1 : b === ACCOUNT_LEVEL ? -1 : a.localeCompare(b)
  )
  const included = (audit?.rows ?? []).filter((row) => !excluded.has(campaignOf(row)))
  const offRows = included.filter((row) => !row.ok)
  const cleanRows = included.filter((row) => row.ok)
  const strayHosts = [
    ...new Set(
      offRows.flatMap((row) => row.urls.filter((u) => !u.ok)).map((u) => u.host || 'unparseable URL')
    ),
  ]
  const excludedCount = (audit?.rows.length ?? 0) - included.length

  return (
    <div className="p-6 pt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {audit ? (
            <>
              Checked <span className="font-semibold">{included.length}</span> live ads, asset
              groups and sitelinks
              {excludedCount > 0 && (
                <span className="text-gray-400"> ({excludedCount} in unticked campaigns hidden)</span>
              )}{' '}
              against{' '}
              <span className="font-mono text-xs">{audit.allowedHosts.join(', ') || '(no hosts set)'}</span>
            </>
          ) : (
            'Every live ad, PMax asset group and sitelink, checked against this client’s own hosts.'
          )}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 shrink-0"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Re-check
        </button>
      </div>

      {loading && !audit && (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Reading the account…
        </p>
      )}

      {reason && !loading && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          {reason}
        </p>
      )}

      {audit && campaigns.length > 1 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Campaigns in this check
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {campaigns.map((name) => (
              <label key={name} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={!excluded.has(name)}
                  onChange={() => toggleCampaign(name)}
                  className="h-4 w-4"
                />
                <span className={excluded.has(name) ? 'text-gray-400 line-through' : 'text-gray-800'}>
                  {name}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Untick a campaign to leave it out of the verdict — for one that points elsewhere on
            purpose. Remembered on this browser only.
          </p>
        </div>
      )}

      {audit && offRows.length === 0 && included.length > 0 && (
        <p className="text-sm text-green-700 flex items-center gap-1.5">
          <CheckCircle2 size={15} /> Every live click lands on this client&apos;s own pages.
        </p>
      )}

      {audit && offRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
            <AlertCircle size={15} />
            {offRows.length} of {included.length} point somewhere else
            {strayHosts.length > 0 && (
              <span className="font-normal text-red-600">— {strayHosts.join(', ')}</span>
            )}
          </p>
          {offRows.map((row, index) => (
            <div
              key={index}
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm space-y-1"
            >
              <p className="text-gray-900">
                <span className="text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border border-red-300 bg-white text-red-700 mr-2">
                  {LEVEL_LABEL[row.level]}
                </span>
                <span className="font-medium">{row.label}</span>
                {row.campaign && <span className="text-gray-500"> · {row.campaign}</span>}
                {row.adGroup && <span className="text-gray-500"> · {row.adGroup}</span>}
              </p>
              {row.urls
                .filter((u) => !u.ok)
                .map((u) => (
                  <p key={u.url} className="font-mono text-xs text-red-700 break-all flex items-start gap-1">
                    <ExternalLink size={12} className="mt-0.5 shrink-0" />
                    {u.url}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}

      {audit && cleanRows.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowClean((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            {cleanRows.length} pointing at the right pages
            <ChevronDown size={14} className={`transition-transform ${showClean ? 'rotate-180' : ''}`} />
          </button>
          {showClean && (
            <ul className="mt-2 space-y-1">
              {cleanRows.map((row, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start gap-1.5">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                  <span>
                    <span className="text-gray-400">{LEVEL_LABEL[row.level]}:</span> {row.label}
                    {row.campaign && <span className="text-gray-400"> · {row.campaign}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Live things only — a paused ad pointing at the wrong page costs nothing, and listing it
        would bury the rows spending money right now. Reads only: fixing a URL happens in Google
        Ads, not here.
      </p>
    </div>
  )
}
