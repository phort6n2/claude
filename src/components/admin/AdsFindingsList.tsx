'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Eye, Loader2, RotateCcw, X } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * The findings inbox. OPEN rows lead, alerts before reviews, newest last
 * seen first. Dismiss is "known, stop telling me" — the row moves to the
 * quiet list below rather than vanishing, because a dismissal you cannot
 * see is one you cannot revisit.
 */

export interface FindingRow {
  id: string
  clientId: string
  clientName: string
  check: string
  cadence: string
  severity: string
  title: string
  detail: string
  status: string
  firstSeenAt: string
  lastSeenAt: string
  evidence: unknown
}

function timeAgo(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function Finding({
  finding,
  onAction,
  busy,
}: {
  finding: FindingRow
  onAction: (id: string, action: 'dismiss' | 'reopen') => void
  busy: string | null
}) {
  const [showEvidence, setShowEvidence] = useState(false)
  const open = finding.status === 'OPEN'
  const alert = finding.severity === 'ALERT'
  return (
    <div
      className={`rounded-xl border p-4 ${
        open
          ? alert
            ? 'border-red-200 bg-red-50'
            : 'border-amber-200 bg-amber-50'
          : 'border-gray-200 bg-white opacity-70'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 font-semibold text-gray-900 text-sm flex flex-wrap items-center gap-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${
                alert
                  ? 'text-red-700 bg-white border-red-300'
                  : 'text-amber-800 bg-white border-amber-300'
              }`}
            >
              {finding.severity}
            </span>
            <Link
              href={`/admin/clients/${finding.clientId}/advertising`}
              className="hover:underline"
            >
              {finding.clientName}
            </Link>
            <span className="font-normal">— {finding.title}</span>
          </p>
          <p className="m-0 mt-1 text-sm text-gray-700">{finding.detail}</p>
          <p className="m-0 mt-1 text-xs text-gray-500">
            {finding.check} · first seen {timeAgo(finding.firstSeenAt)} · last seen{' '}
            {timeAgo(finding.lastSeenAt)}
            {' · '}
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
            >
              <Eye size={11} /> evidence
            </button>
          </p>
          {showEvidence && (
            <pre className="mt-2 mb-0 text-xs bg-white border border-gray-200 rounded-lg p-2 overflow-x-auto">
              {JSON.stringify(finding.evidence, null, 2)}
            </pre>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAction(finding.id, open ? 'dismiss' : 'reopen')}
          disabled={busy !== null}
          title={open ? 'Known — stop telling me' : 'Reopen'}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white disabled:opacity-50"
        >
          {busy === finding.id ? (
            <Loader2 size={15} className="animate-spin" />
          ) : open ? (
            <X size={15} />
          ) : (
            <RotateCcw size={15} />
          )}
        </button>
      </div>
    </div>
  )
}

export default function AdsFindingsList({ findings }: { findings: FindingRow[] }) {
  const [rows, setRows] = useState(findings)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(id: string, action: 'dismiss' | 'reopen') {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/ads-findings/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'Could not update it'))
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, status: action === 'dismiss' ? 'DISMISSED' : 'OPEN' } : row
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  const order = (row: FindingRow) => (row.severity === 'ALERT' ? 0 : 1)
  const open = rows
    .filter((row) => row.status === 'OPEN')
    .sort((a, b) => order(a) - order(b) || b.lastSeenAt.localeCompare(a.lastSeenAt))
  const quiet = rows.filter((row) => row.status !== 'OPEN')

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      {open.length === 0 ? (
        <p className="text-sm text-green-700 flex items-center gap-1.5 bg-white rounded-xl border border-gray-200 p-4">
          <CheckCircle2 size={15} /> Nothing needs action. The daily check runs every morning and
          emails you when that changes.
        </p>
      ) : (
        open.map((finding) => (
          <Finding key={finding.id} finding={finding} onAction={act} busy={busy} />
        ))
      )}

      {quiet.length > 0 && (
        <details className="pt-2">
          <summary className="text-sm text-gray-500 cursor-pointer">
            {quiet.length} dismissed or recently resolved
          </summary>
          <div className="mt-2 space-y-2">
            {quiet.map((finding) => (
              <Finding key={finding.id} finding={finding} onAction={act} busy={busy} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
