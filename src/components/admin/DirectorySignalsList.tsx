'use client'

import { useState } from 'react'
import { Phone, Mail, Globe, MapPin, Check, Loader2, ExternalLink } from 'lucide-react'
import { SIGNAL_META, type SignalType } from '@/lib/directory-signal-types'

export interface SignalRow {
  id: string
  type: string
  slug: string | null
  name: string
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  website: string | null
  rank: number | null
  totalInCity: number | null
  previousRank: number | null
  monthlyVolume: string | null
  frustration: string | null
  wantsMarketingHelp: boolean | null
  status: string
  occurredAt: string
}

const DIRECTORY = 'https://windshieldrepairhq.com'

function meta(type: string) {
  return SIGNAL_META[type as SignalType] ?? { label: type, hot: false, why: '' }
}

function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function DirectorySignalsList({ rows }: { rows: SignalRow[] }) {
  // Optimistic first, reconcile after — the convention for admin cards here. A
  // button that waits on a round trip before moving reads as broken.
  const [state, setState] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  async function setStatus(id: string, status: string) {
    const previous = state[id]
    setState((s) => ({ ...s, [id]: status }))
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/directory-signals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setState((s) => ({ ...s, [id]: previous ?? '' }))
    } finally {
      setBusy('')
    }
  }

  const statusOf = (r: SignalRow) => state[r.id] || r.status
  const open = rows.filter((r) => statusOf(r) === 'NEW')
  const done = rows.filter((r) => statusOf(r) !== 'NEW')

  if (!rows.length) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Nothing yet. A shop claiming its listing or buying Featured will show up here within
        seconds of doing it.
      </p>
    )
  }

  const Card = ({ r }: { r: SignalRow }) => {
    const m = meta(r.type)
    const dismissed = statusOf(r) !== 'NEW'
    const where = [r.city, r.state?.toUpperCase()].filter(Boolean).join(', ')
    return (
      <div
        className={`rounded-xl border bg-white p-4 ${
          dismissed ? 'border-gray-200 opacity-60' : m.hot ? 'border-red-200' : 'border-gray-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  m.hot ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {m.label}
              </span>
              <span className="text-xs text-gray-400">{when(r.occurredAt)}</span>
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-gray-900">{r.name}</h3>
            {where && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-gray-500">
                <MapPin width={13} height={13} /> {where}
                {r.rank != null && (
                  <span className="ml-1">
                    · #{r.rank}
                    {r.totalInCity ? ` of ${r.totalInCity}` : ''}
                    {r.previousRank != null ? ` (was #${r.previousRank})` : ''}
                  </span>
                )}
              </p>
            )}
          </div>
          {!dismissed ? (
            <button
              type="button"
              onClick={() => setStatus(r.id, 'DISMISSED')}
              disabled={busy === r.id}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {busy === r.id ? (
                <Loader2 className="animate-spin" width={13} height={13} />
              ) : (
                <Check width={13} height={13} />
              )}
              Dealt with
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatus(r.id, 'NEW')}
              disabled={busy === r.id}
              className="shrink-0 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-60"
            >
              Reopen
            </button>
          )}
        </div>

        {/* The reason to ring them, in their words. */}
        {r.frustration && (
          <p className="mt-3 border-l-2 border-gray-200 pl-3 text-sm italic text-gray-800">
            “{r.frustration}”
          </p>
        )}
        {(r.monthlyVolume || r.wantsMarketingHelp) && (
          <p className="mt-2 text-sm text-gray-600">
            {r.monthlyVolume && <>Says they do {r.monthlyVolume}. </>}
            {r.wantsMarketingHelp && (
              <span className="font-medium text-gray-900">Asked for marketing help.</span>
            )}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          {r.phone && (
            <a
              href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline"
            >
              <Phone width={14} height={14} /> {r.phone}
            </a>
          )}
          {r.email && (
            <a
              href={`mailto:${r.email}`}
              className="inline-flex items-center gap-1.5 text-gray-700 hover:underline"
            >
              <Mail width={14} height={14} /> {r.email}
            </a>
          )}
          {r.website && (
            <a
              href={r.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gray-600 hover:underline"
            >
              <Globe width={14} height={14} /> Their site
            </a>
          )}
          {r.slug && (
            <a
              href={`${DIRECTORY}/directory/shop/${r.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gray-600 hover:underline"
            >
              <ExternalLink width={14} height={14} /> Listing
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {open.map((r) => (
        <Card key={r.id} r={r} />
      ))}
      {done.length > 0 && (
        <>
          <p className="pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Dealt with · last 30 days
          </p>
          {done.map((r) => (
            <Card key={r.id} r={r} />
          ))}
        </>
      )}
    </div>
  )
}
