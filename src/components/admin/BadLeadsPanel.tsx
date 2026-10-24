'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CONFIDENCE_LABELS, reasonLabel, type Confidence } from '@/lib/bad-lead'
import BadLeadButton from '@/components/BadLeadButton'

/**
 * The owner's view of bad leads: what waits for him, the last 30 days per
 * client (by reason, by campaign, untraced), and every negative added with
 * its Undo. Cards, not a table: the owner's rule is no table that scrolls
 * both ways on a phone, and this page is mostly read from one.
 */

export interface MarkRow {
  id: string
  leadId: string
  clientId: string
  clientName: string
  leadName: string
  source: string
  leadAt: string
  createdAt: string
  reason: string
  status: string
  confidence: string | null
  markedBy: string
  markedByRole: string
  undone: boolean
  campaign: string | null
  adGroup: string | null
  note: string | null
  waiting: number
}
export interface ChangeRow {
  id: string
  clientId: string
  clientName: string
  leadId: string | null
  text: string
  matchType: string
  level: string
  where: string
  status: string
  source: string
  userEmail: string
  createdAt: string
  removedAt: string | null
  error: string | null
}
export interface ClientRow {
  id: string
  name: string
  autoNegatives: boolean
}

const STATUS_LABEL: Record<string, string> = {
  tracing: 'Tracing…',
  applied: 'Negatives added',
  review: 'Needs you',
  untraced: 'Not traced',
  'no-action': 'Nothing to add',
  failed: 'Trace failed',
  undone: 'Undone',
}
const STATUS_STYLE: Record<string, string> = {
  applied: 'bg-green-50 text-green-800 ring-green-200',
  review: 'bg-amber-50 text-amber-900 ring-amber-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const kw = (text: string, matchType: string) => (matchType === 'EXACT' ? `[${text}]` : matchType === 'PHRASE' ? `"${text}"` : text)

function Count({ rows }: { rows: Array<[string, number]> }) {
  if (!rows.length) return <p className="text-sm text-gray-500">None.</p>
  const max = Math.max(...rows.map((r) => r[1]))
  return (
    <ul className="space-y-1">
      {rows.map(([label, n]) => (
        <li key={label} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate text-gray-800">{label}</span>
            <span className="tabular-nums text-gray-600">{n}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded bg-gray-100">
            <div className="h-1.5 rounded bg-red-400" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function tally(values: string[]): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export default function BadLeadsPanel({ marks, changes, clients, autoEnabled }: { marks: MarkRow[]; changes: ChangeRow[]; clients: ClientRow[]; autoEnabled: boolean }) {
  const router = useRouter()
  const [clientId, setClientId] = useState('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState<Record<string, boolean>>(() => Object.fromEntries(clients.map((c) => [c.id, c.autoNegatives])))

  const inScope = <T extends { clientId: string }>(rows: T[]) => (clientId === 'all' ? rows : rows.filter((r) => r.clientId === clientId))
  const live = inScope(marks).filter((m) => !m.undone)
  const waiting = live.filter((m) => m.status === 'review' || m.status === 'failed')
  const added = inScope(changes).filter((c) => c.status === 'applied' || c.status === 'unconfirmed' || c.status === 'removed')
  const untraced = live.filter((m) => m.status === 'untraced')

  async function undo(id: string) {
    setBusy(id)
    setError(null)
    const res = await fetch(`/api/admin/bad-leads/negatives/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setError(json.error || `Failed (HTTP ${res.status})`)
    router.refresh()
  }

  async function toggle(id: string, on: boolean) {
    setAuto((a) => ({ ...a, [id]: on }))
    const res = await fetch('/api/admin/bad-leads/client-auto', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: id, on }),
    })
    if (!res.ok) {
      setAuto((a) => ({ ...a, [id]: !on }))
      setError('Could not save the setting.')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Bad leads</h1>
        <p className="mt-1 text-sm text-gray-600">
          Leads marked as junk, traced to the Google search that bought them. The AI picks the negatives; one that passes every safety check is added on its own, anything else waits here.
          {autoEnabled ? '' : ' Automatic negatives are switched OFF (BAD_LEAD_AUTO_NEGATIVES=false) — everything waits here.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-600" htmlFor="bl-client">Client</label>
        <select id="bl-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-2 text-sm">
          <option value="all">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Waiting for you ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">Nothing waiting.</p>
        ) : (
          <ul className="space-y-2">
            {waiting.map((m) => (
              <MarkCard key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">By reason · 30 days</h3>
          <Count rows={tally(live.map((m) => reasonLabel(m.reason)))} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">By campaign · 30 days</h3>
          <Count rows={tally(live.filter((m) => m.campaign).map((m) => (clientId === 'all' ? `${m.clientName}: ${m.campaign}` : m.campaign!)))} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Totals · 30 days</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-gray-600">Marked bad</dt><dd className="tabular-nums">{live.length}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Negatives added</dt><dd className="tabular-nums">{added.filter((c) => c.status !== 'removed').length}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">…of which automatically</dt><dd className="tabular-nums">{added.filter((c) => c.status !== 'removed' && c.source === 'auto').length}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Could not be traced</dt><dd className="tabular-nums">{untraced.length}</dd></div>
          </dl>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Negatives added · 30 days</h2>
        {added.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">None yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {added.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                <span className={`font-mono ${c.removedAt ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{kw(c.text, c.matchType)}</span>
                <span className="text-xs text-gray-600">
                  {clientId === 'all' ? `${c.clientName} · ` : ''}
                  {c.where}
                  {c.level === 'ad_group' ? ' (ad group)' : ''} · {c.source === 'auto' ? 'automatic' : c.userEmail} · {when(c.createdAt)}
                  {c.status === 'unconfirmed' ? ' · Google accepted it but the read-back did not show it' : ''}
                </span>
                {!c.removedAt && c.status !== 'removed' && (
                  <button type="button" onClick={() => undo(c.id)} disabled={busy === c.id} className="ml-auto h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                    {busy === c.id ? 'Removing…' : 'Undo'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">All bad leads · 30 days</h2>
        {live.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">No lead has been marked bad.</p>
        ) : (
          <ul className="space-y-2">
            {live.map((m) => (
              <MarkCard key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Add negatives automatically</h2>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <span className="text-gray-900">{c.name}</span>
              <label className="inline-flex items-center gap-2 text-gray-700">
                <input type="checkbox" checked={!!auto[c.id]} onChange={(e) => toggle(c.id, e.target.checked)} className="h-5 w-5" />
                {auto[c.id] ? 'On' : 'Off — review all'}
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function MarkCard({ m }: { m: MarkRow }) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-gray-900">{m.leadName}</span>
        <span className="text-xs text-gray-500">{m.clientName} · {m.source.toLowerCase()} · {when(m.leadAt)}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[m.status] || 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
          {STATUS_LABEL[m.status] || m.status}
          {m.waiting > 0 && m.status === 'review' ? ` · ${m.waiting}` : ''}
        </span>
        <span className="ml-auto">
          <BadLeadButton leadId={m.leadId} api="admin" initial={{ reason: m.reason, status: m.status }} compact />
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-700">
        {reasonLabel(m.reason)}
        {m.campaign ? ` · ${m.campaign}${m.adGroup ? ` › ${m.adGroup}` : ''}` : ''}
        {m.confidence ? ` · ${CONFIDENCE_LABELS[m.confidence as Confidence] || m.confidence}` : ''}
      </p>
      <p className="text-xs text-gray-500">Marked by {m.markedBy}{m.markedByRole === 'client' ? ' (the shop)' : ''} · {when(m.createdAt)}</p>
    </li>
  )
}
