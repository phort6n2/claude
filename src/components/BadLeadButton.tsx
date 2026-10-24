'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Loader2, RotateCcw, X } from 'lucide-react'
import { CONFIDENCE_LABELS, reasonLabel, type Confidence } from '@/lib/bad-lead'

/**
 * "Bad lead" — the button, the badge and the panel, on every lead screen
 * (admin list and detail, Master Leads, the shop's portal). ONE component, so
 * the shop and the admin cannot be told different things about one lead.
 *
 * The shop sees its mark and which searches were stopped. The admin also sees
 * the trace, what the model proposed and why each one was or was not added;
 * the owner (`canWrite`) gets Add, Undo and a typed negative.
 */

type Api = 'admin' | 'portal'

export interface BadLeadSummary {
  reason: string
  status: string
  undoneAt?: string | null
}

interface Candidate {
  term: string
  clicks: number
  costMicros: number
  campaignId: string
  campaignName: string
  adGroupId: string | null
  adGroupName: string | null
  keyword: string | null
  bestMatch: boolean
  bestWhy?: string
}
interface Problem {
  kind: string
  detail: string
  blocking?: boolean
}
interface Proposal {
  text: string
  matchType: string
  fromTerm?: string | null
  why?: string
  problems: Problem[]
  outcome: string
  changeId?: string
  error?: string
}
interface AdminData {
  clientId: string
  businessName: string
  autoNegatives: boolean
  autoEnabled: boolean
  canWrite: boolean
  reasons: Array<{ key: string; label: string }>
  mark: null | {
    id: string
    reason: string
    notes: string | null
    status: string
    confidence: Confidence | null
    markedBy: string
    markedByRole: string
    createdAt: string
    undoneAt: string | null
    error: string | null
    trace: null | {
      note: string
      campaign: { id: string; name: string; channel: string } | null
      adGroup: { id: string; name: string } | null
      candidates?: Candidate[]
      alsoPossible?: Array<{ id: string; name: string }>
      date?: string | null
    }
    decision: null | { by: string; aiError?: string; noneReason?: string | null; auto: boolean; autoOffWhy?: string; proposals: Proposal[] }
  }
  changes: Array<{
    id: string
    text: string
    matchType: string
    level: string
    campaignName: string | null
    sharedSetName: string | null
    status: string
    source: string
    userEmail: string
    createdAt: string
    removedAt: string | null
    error: string | null
  }>
}
interface PortalData {
  reasons: Array<{ key: string; label: string }>
  mark: null | { reason: string; notes: string | null; status: string; undone: boolean; createdAt: string; stopped: string[] }
}

/** The marker on a collapsed lead row. Nothing at all for an unmarked lead. */
export function BadLeadTag({ mark }: { mark?: BadLeadSummary | null }) {
  if (!mark || mark.undoneAt) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700" title={reasonLabel(mark.reason)}>
      <Ban className="h-3 w-3" aria-hidden />
      Bad lead
    </span>
  )
}

const money = (micros: number) => `$${(micros / 1e6).toFixed(2)}`

function endpoint(api: Api, leadId: string) {
  return api === 'admin' ? `/api/leads/${leadId}/bad-lead` : `/api/portal/leads/${leadId}/bad-lead`
}

export default function BadLeadButton({
  leadId,
  api,
  initial,
  compact,
  onChange,
}: {
  leadId: string
  api: Api
  initial?: BadLeadSummary | null
  compact?: boolean
  onChange?: (summary: BadLeadSummary | null) => void
}) {
  // What the panel last said, once it has said anything; until then, the row's own data.
  const [local, setSummary] = useState<BadLeadSummary | null | undefined>(undefined)
  const summary = local !== undefined ? local : initial && !initial.undoneAt ? initial : null
  const [open, setOpen] = useState(false)

  const marked = !!summary
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
        }}
        className={
          marked
            ? `inline-flex items-center gap-1 rounded-full bg-red-50 font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100 ${compact ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-xs'}`
            : `inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white font-medium text-gray-700 hover:bg-gray-50 ${compact ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-sm'}`
        }
        title={marked ? reasonLabel(summary!.reason) : 'Mark this lead as junk'}
      >
        <Ban className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden />
        {marked ? `Bad lead${compact ? '' : ` · ${reasonLabel(summary!.reason)}`}` : 'Bad lead'}
      </button>
      {/* Into document.body: inside a lead row or the admin shell the
          overlay is trapped under the shell's sticky header and inside any
          ancestor that scrolls or makes its own stacking context. */}
      {open && createPortal(
        <Panel
          leadId={leadId}
          api={api}
          onClose={() => setOpen(false)}
          onSummary={(s) => {
            setSummary(s)
            onChange?.(s)
          }}
        />,
        document.body
      )}
    </>
  )
}

function Panel({
  leadId,
  api,
  onClose,
  onSummary,
}: {
  leadId: string
  api: Api
  onClose: () => void
  onSummary: (s: BadLeadSummary | null) => void
}) {
  const [data, setData] = useState<AdminData | PortalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const polls = useRef(0)

  const load = useCallback(async () => {
    const res = await fetch(endpoint(api, leadId), { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json.error || `Could not load (HTTP ${res.status})`)
      return null
    }
    setData(json)
    return json as AdminData | PortalData
  }, [api, leadId])

  useEffect(() => {
    load()
  }, [load])

  const mark = data?.mark || null
  const active = !!mark && !('undone' in mark ? mark.undone : mark.undoneAt)
  const status = mark?.status

  // The trace runs after the press; look again until it has answered.
  useEffect(() => {
    if (status !== 'tracing' || polls.current > 30) return
    const t = setTimeout(() => {
      polls.current++
      load()
    }, 3000)
    return () => clearTimeout(t)
  }, [status, load, data])

  useEffect(() => {
    if (!mark) return
    onSummary(active ? { reason: mark.reason, status: mark.status } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.reason, mark?.status, active])

  async function save() {
    if (!reason) return setError('Choose a reason.')
    if (reason === 'other' && !notes.trim()) return setError('Say what was wrong with it.')
    setBusy(true)
    setError(null)
    const res = await fetch(endpoint(api, leadId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, notes }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(json.error || `Failed (HTTP ${res.status})`)
    polls.current = 0
    setEditing(false)
    await load()
  }

  async function undo() {
    setBusy(true)
    setError(null)
    const res = await fetch(endpoint(api, leadId), { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(json.error || `Failed (HTTP ${res.status})`)
    if (json.failed?.length) setError(`Undone, but some negatives could not be removed: ${json.failed.join('; ')}`)
    onSummary(null)
    await load()
  }

  const showForm = !active || editing
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bad-lead-title"
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 text-left shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="bad-lead-title" className="text-base font-semibold text-gray-900">
            {active && !editing ? `Bad lead · ${reasonLabel(mark!.reason)}` : 'Mark as a bad lead'}
          </h2>
          <button type="button" onClick={onClose} className="-m-2 p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!data && !error && (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}

        {data && showForm && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-600">
              {api === 'portal'
                ? 'Tell us why this one was junk. We trace it back to the Google search that sent it and stop paying for searches like it.'
                : 'Why was it junk? It is traced to the search that bought it, and the negatives that pass every check are added.'}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {data.reasons.map((r) => (
                <label
                  key={r.key}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${reason === r.key ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <input type="radio" name="bad-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="h-4 w-4" />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={reason === 'other' ? 'What was wrong with it? (required)' : 'Anything else? (optional)'}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              {editing && (
                <button type="button" onClick={() => setEditing(false)} className="h-11 rounded-lg px-4 text-sm font-medium text-gray-700 hover:bg-gray-100">
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Mark as bad lead'}
              </button>
            </div>
          </div>
        )}

        {data && active && !editing && (
          <div className="mt-3 space-y-4">
            {status === 'tracing' && (
              <p className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <Loader2 className="h-4 w-4 animate-spin" /> Tracing it to the search that sent it…
              </p>
            )}
            {'stopped' in mark! ? <PortalResult mark={mark as PortalData['mark'] & object} /> : <AdminResult data={data as AdminData} reload={load} setError={setError} />}
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
              <button type="button" onClick={() => { setReason(mark!.reason); setNotes(mark!.notes || ''); setEditing(true) }} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100">
                Change reason
              </button>
              <button type="button" onClick={undo} disabled={busy} className="inline-flex h-10 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" aria-hidden /> Not a bad lead (undo)
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}

function PortalResult({ mark }: { mark: NonNullable<PortalData['mark']> }) {
  if (mark.status === 'tracing') return null
  return (
    <div className="space-y-2 text-sm text-gray-700">
      {mark.notes && <p className="text-gray-500">“{mark.notes}”</p>}
      {mark.stopped.length > 0 ? (
        <p>
          Done — we stopped paying for searches like{' '}
          {mark.stopped.map((t, i) => (
            <span key={t}>
              {i > 0 && ', '}
              <strong>“{t}”</strong>
            </span>
          ))}
          .
        </p>
      ) : mark.status === 'untraced' ? (
        <p>Thanks. This one did not come from a Google ad click we could trace, so there was no search to stop — it is noted.</p>
      ) : (
        <p>Thanks — it is with us. We will check the search behind it and stop it if it is not one you want.</p>
      )}
    </div>
  )
}

const OUTCOME_STYLE: Record<string, string> = {
  applied: 'bg-green-50 text-green-800 ring-green-200',
  review: 'bg-amber-50 text-amber-900 ring-amber-200',
  duplicate: 'bg-gray-100 text-gray-600 ring-gray-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  'not-tried': 'bg-gray-100 text-gray-500 ring-gray-200',
}
const OUTCOME_LABEL: Record<string, string> = {
  applied: 'Added',
  review: 'Needs you',
  duplicate: 'Already excluded',
  failed: 'Google refused',
  'not-tried': 'Dismissed',
}

function AdminResult({ data, reload, setError }: { data: AdminData; reload: () => Promise<unknown>; setError: (e: string | null) => void }) {
  const mark = data.mark!
  const trace = mark.trace
  const decision = mark.decision
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ key: string; problems: Problem[]; body: Record<string, unknown> } | null>(null)

  async function add(body: Record<string, unknown>, key: string) {
    setBusy(key)
    setError(null)
    const res = await fetch('/api/admin/bad-leads/negatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: data.clientId, markId: mark.id, ...body }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (res.status === 409 && json.status === 'problems') {
      setConfirm({ key, problems: json.problems || [], body })
      return
    }
    if (!res.ok) {
      setError(json.error || json.problems?.map((p: Problem) => p.detail).join(' ') || `Failed (HTTP ${res.status})`)
      return
    }
    setConfirm(null)
    await reload()
  }

  async function undoChange(id: string) {
    setBusy(id)
    setError(null)
    const res = await fetch(`/api/admin/bad-leads/negatives/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setError(json.error || `Failed (HTTP ${res.status})`)
    await reload()
  }

  async function markAction(body: Record<string, unknown>, key: string) {
    setBusy(key)
    await fetch(`/api/admin/bad-leads/marks/${mark.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(null)
    await reload()
  }

  const campaignOf = (p: Proposal) => {
    const c = trace?.candidates?.find((x) => x.term.toLowerCase() === (p.fromTerm || '').toLowerCase())
    return { campaignId: c?.campaignId || trace?.campaign?.id || null, adGroupId: c?.adGroupId || trace?.adGroup?.id || null }
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-gray-500">
        Marked by {mark.markedBy} ({mark.markedByRole}) · {new Date(mark.createdAt).toLocaleString()}
        {mark.notes ? ` · “${mark.notes}”` : ''}
      </p>

      {mark.status === 'failed' && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">The trace failed: {mark.error}</p>}

      {trace && (
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="font-medium text-gray-900">
            {trace.campaign ? (
              <>
                {trace.campaign.name}
                {trace.adGroup ? ` › ${trace.adGroup.name}` : ''}
              </>
            ) : (
              'Not traced'
            )}
            {mark.confidence && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-gray-200">{CONFIDENCE_LABELS[mark.confidence]}</span>}
          </p>
          <p className="mt-1 text-xs text-gray-600">{trace.note}</p>
        </div>
      )}

      {decision && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Negatives {decision.by === 'model' ? 'the AI chose' : 'chosen without the AI'}
          </p>
          {decision.aiError && <p className="mb-1 text-xs text-amber-800">AI unavailable ({decision.aiError}) — fell back to the best-match search, exact.</p>}
          {decision.autoOffWhy && decision.proposals.some((p) => p.outcome === 'review') && <p className="mb-1 text-xs text-gray-600">Not added on its own: {decision.autoOffWhy}</p>}
          {decision.proposals.length === 0 && <p className="text-gray-600">{decision.noneReason || 'Nothing to add.'}</p>}
          <ul className="space-y-2">
            {decision.proposals.map((p) => {
              const key = `${p.matchType}:${p.text}`
              const change = data.changes.find((c) => c.id === p.changeId)
              return (
                <li key={key} className="rounded-lg border border-gray-200 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-gray-900">{p.matchType === 'EXACT' ? `[${p.text}]` : p.matchType === 'PHRASE' ? `"${p.text}"` : p.text}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${OUTCOME_STYLE[change?.removedAt ? 'not-tried' : p.outcome] || OUTCOME_STYLE.review}`}>
                      {change?.removedAt ? 'Undone' : OUTCOME_LABEL[p.outcome] || p.outcome}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {data.canWrite && (p.outcome === 'review' || p.outcome === 'failed') && (
                        <>
                          <button type="button" disabled={!!busy} onClick={() => add({ text: p.text, matchType: p.matchType, level: 'campaign', fromTerm: p.fromTerm, ...campaignOf(p) }, key)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                            {busy === key ? 'Adding…' : 'Add'}
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => markAction({ action: 'dismiss', text: p.text, matchType: p.matchType }, `d:${key}`)} className="h-8 rounded-lg px-2 text-xs text-gray-600 hover:bg-gray-100">
                            Dismiss
                          </button>
                        </>
                      )}
                      {data.canWrite && change && !change.removedAt && (change.status === 'applied' || change.status === 'unconfirmed') && (
                        <button type="button" disabled={!!busy} onClick={() => undoChange(change.id)} className="h-8 rounded-lg border border-gray-300 px-2 text-xs text-gray-700 hover:bg-gray-50">
                          {busy === change.id ? 'Removing…' : 'Undo negative'}
                        </button>
                      )}
                    </span>
                  </div>
                  {p.why && <p className="mt-1 text-xs text-gray-600">{p.why}</p>}
                  {p.problems.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
                      {p.problems.map((x, i) => <li key={i}>{x.detail}</li>)}
                    </ul>
                  )}
                  {p.error && <p className="mt-1 text-xs text-red-700">{p.error}</p>}
                  {confirm?.key === key && (
                    <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
                      <p className="font-semibold">Add it anyway?</p>
                      <ul className="list-disc pl-5">{confirm.problems.map((x, i) => <li key={i}>{x.detail}</li>)}</ul>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => add({ ...confirm.body, override: true }, key)} className="h-8 rounded-lg bg-amber-600 px-3 font-semibold text-white">Add anyway</button>
                        <button type="button" onClick={() => setConfirm(null)} className="h-8 rounded-lg px-3 text-gray-700">Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {trace?.candidates && trace.candidates.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Searches that day{trace.date ? ` (${trace.date})` : ''}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-3 font-medium">Search</th>
                  <th className="py-1 pr-3 text-right font-medium">Clicks</th>
                  <th className="py-1 pr-3 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {trace.candidates.map((c) => (
                  <tr key={c.term + c.campaignId} className={`border-t border-gray-100 ${c.bestMatch ? 'bg-amber-50' : ''}`}>
                    <td className="py-1 pr-3 text-gray-900">
                      {c.term}
                      {c.bestMatch && <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-900" title={c.bestWhy}>best match</span>}
                      {c.adGroupName && !trace.adGroup && <span className="block text-[11px] text-gray-500">{c.campaignName} › {c.adGroupName}</span>}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">{c.clicks}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{money(c.costMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.canWrite && trace?.campaign && <CustomAdd data={data} add={add} busy={busy} />}

      {data.changes.some((c) => !data.mark?.decision?.proposals.some((p) => p.changeId === c.id)) && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Added by hand</p>
          <ul className="space-y-1 text-xs">
            {data.changes
              .filter((c) => !data.mark?.decision?.proposals.some((p) => p.changeId === c.id))
              .map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="font-mono">{c.matchType === 'EXACT' ? `[${c.text}]` : `"${c.text}"`}</span>
                  <span className="text-gray-500">{c.level === 'shared_list' ? c.sharedSetName : c.campaignName} · {c.removedAt ? 'undone' : c.status}</span>
                  {!c.removedAt && (c.status === 'applied' || c.status === 'unconfirmed') && (
                    <button type="button" onClick={() => undoChange(c.id)} className="ml-auto h-7 rounded border border-gray-300 px-2 text-gray-700">Undo</button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {data.canWrite && mark.status !== 'tracing' && (
        <button type="button" disabled={!!busy} onClick={() => markAction({ action: 'retrace' }, 'retrace')} className="text-xs font-medium text-blue-600 hover:underline">
          Trace it again
        </button>
      )}
    </div>
  )
}

function CustomAdd({ data, add, busy }: { data: AdminData; add: (body: Record<string, unknown>, key: string) => Promise<void>; busy: string | null }) {
  const trace = data.mark!.trace!
  const [text, setText] = useState('')
  const [matchType, setMatchType] = useState('PHRASE')
  const [level, setLevel] = useState('campaign')
  const [lists, setLists] = useState<Array<{ id: string; name: string; shared: boolean; memberCount: number }> | null>(null)
  const [listId, setListId] = useState('')
  const pmax = trace.campaign?.channel === 'PERFORMANCE_MAX'

  useEffect(() => {
    if (level !== 'shared_list' || lists) return
    fetch(`/api/admin/bad-leads/lists?clientId=${data.clientId}&campaignId=${trace.campaign!.id}`)
      .then((r) => r.json())
      .then((j) => {
        setLists(j.lists || [])
        if (j.lists?.[0]) setListId(j.lists[0].id)
      })
      .catch(() => setLists([]))
  }, [level, lists, data.clientId, trace.campaign])

  const chosen = lists?.find((l) => l.id === listId)
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Add your own</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="negative keyword" className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm" />
        <select value={matchType} onChange={(e) => setMatchType(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-2 text-sm">
          <option value="PHRASE">Phrase</option>
          <option value="EXACT">Exact</option>
          <option value="BROAD">Broad</option>
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-2 text-sm">
          <option value="campaign">This campaign</option>
          {!pmax && trace.adGroup && <option value="ad_group">This ad group</option>}
          <option value="shared_list">A negative list…</option>
        </select>
      </div>
      {level === 'shared_list' && (
        <div className="mt-2">
          {!lists ? (
            <p className="text-xs text-gray-500">Loading lists…</p>
          ) : lists.length === 0 ? (
            <p className="text-xs text-gray-500">No negative lists found.</p>
          ) : (
            <select value={listId} onChange={(e) => setListId(e.target.value)} className="h-10 w-full rounded-lg border border-gray-300 px-2 text-sm">
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.memberCount}){l.shared ? ' — shared across clients' : ''}
                </option>
              ))}
            </select>
          )}
          {chosen?.shared && <p className="mt-1 text-xs text-amber-800">This list is in the manager account and applies to EVERY client that uses it, not just {data.businessName}.</p>}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={!text.trim() || !!busy || (level === 'shared_list' && !listId)}
          onClick={() => add({ text, matchType, level, listId, campaignId: trace.campaign!.id, adGroupId: level === 'ad_group' ? trace.adGroup?.id : null }, 'custom')}
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy === 'custom' ? 'Adding…' : 'Add negative'}
        </button>
      </div>
    </div>
  )
}
