'use client'

import { useState } from 'react'
import { Loader2, Mail, Check, AlertCircle } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * The month's reports, waiting for somebody to read them and press send.
 *
 * WHY A HUMAN IS IN THIS LOOP AT ALL. The cron builds on the 1st and stops.
 * An email to a real business owner cannot be unsent, and the figures most
 * likely to be wrong are the ones nobody has looked at yet: a cost per
 * conversion flattered by an account still counting phone calls twice, a
 * spend of nothing because the API was down, a booked count of zero because
 * the shop never ticked the box. Each of those takes two seconds to spot here
 * and is invisible to the code that built it.
 *
 * The note is the ONLY free text in the report and it is typed by an operator.
 * A model writing monthly advice for a named business is § 2's invented fact
 * with a stamp on it; the findings the sweeps already filed carry their own
 * evidence and go in underneath whatever is written here.
 */

export interface ReportRow {
  id: string
  clientId: string
  businessName: string
  label: string
  enquiries: number
  booked: number
  revenue: number
  spend: number | null
  costPerConversion: number | null
  adsProblem: string | null
  workItems: number
  findings: number
  note: string | null
  builtAt: string
  sentAt: string | null
  sentTo: string[]
  sendError: string | null
  /** Empty means nobody to send to — the portal invite has not gone out. */
  recipients: string[]
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function MonthlyReportsList({ rows }: { rows: ReportRow[] }) {
  const [state, setState] = useState(rows)
  const [busy, setBusy] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.note || '']))
  )
  const [noteSaved, setNoteSaved] = useState<Record<string, boolean>>({})

  async function saveNote(id: string) {
    try {
      const res = await fetch(`/api/admin/monthly-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: notes[id] ?? '' }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      setNoteSaved((s) => ({ ...s, [id]: true }))
      setTimeout(() => setNoteSaved((s) => ({ ...s, [id]: false })), 2500)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save the note' })
    }
  }

  async function send(row: ReportRow) {
    // The note is saved first: pressing Send with unsaved text in the box is
    // how a report goes out without the paragraph somebody just wrote for it.
    if ((notes[row.id] ?? '') !== (row.note || '')) await saveNote(row.id)
    setBusy(row.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/monthly-reports/${row.id}/send`, { method: 'POST' })
      if (!res.ok) throw new Error(await errorFrom(res))
      const data = await res.json()
      setState((s) =>
        s.map((r) =>
          r.id === row.id
            ? { ...r, sentAt: new Date().toISOString(), sentTo: data.sentTo || [], sendError: null }
            : r
        )
      )
      setMessage({ ok: true, text: `${row.businessName}: ${data.message}` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Send failed' })
    } finally {
      setBusy(null)
    }
  }

  async function build() {
    setBuilding(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/monthly-reports/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      const data = await res.json()
      setMessage({ ok: true, text: `${data.message}. Reload to see them.` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Build failed' })
    } finally {
      setBuilding(false)
    }
  }

  const unsent = state.filter((r) => !r.sentAt)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={build}
          disabled={building}
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {building && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {building ? 'Building…' : 'Build last month now'}
        </button>
        <span className="text-xs text-gray-500">
          The same code the 1st-of-month run uses. A report already sent is never rebuilt — the
          shop has that email.
        </span>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
            message.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {state.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          No reports built yet. They appear here on the 1st of each month, or press the button
          above.
        </p>
      )}

      {unsent.length > 0 && (
        <p className="text-sm font-medium text-gray-700">
          {unsent.length} waiting to be sent. Read the figures before you press send.
        </p>
      )}

      {state.map((row) => (
        <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-semibold text-gray-900">{row.businessName}</h3>
              <p className="text-xs text-gray-500">{row.label}</p>
            </div>
            {row.sentAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
                <Check className="h-3.5 w-3.5" />
                Sent {row.sentAt.slice(0, 10)}
                {row.sentTo.length > 0 && ` to ${row.sentTo.join(', ')}`}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => send(row)}
                disabled={busy === row.id || row.recipients.length === 0}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                title={
                  row.recipients.length === 0
                    ? 'No portal login for this client, so there is nobody to send it to'
                    : `Sends to ${row.recipients.join(', ')}`
                }
              >
                {busy === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                Send
              </button>
            )}
          </div>

          {/* Two across on a phone. The admin only recently worked on one. */}
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Figure label="Enquiries" value={String(row.enquiries)} />
            <Figure label="Booked" value={String(row.booked)} />
            <Figure label="Revenue" value={row.revenue > 0 ? money(row.revenue) : '—'} />
            <Figure label="Spend" value={row.spend === null ? '—' : money(row.spend)} />
            <Figure
              label="Cost / conv."
              value={
                row.costPerConversion === null
                  ? '—'
                  : row.costPerConversion.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                    })
              }
            />
            <Figure label="Work items" value={String(row.workItems)} />
          </div>

          {/* A failure names itself. A spend of "—" because the API was down
              looks exactly like a shop who is not running ads. */}
          {row.adsProblem && (
            <p className="mt-2 text-xs text-amber-800">
              Ads figures missing: {row.adsProblem} — rebuild before sending, or the shop reads it
              as a month with no spend.
            </p>
          )}
          {row.recipients.length === 0 && !row.sentAt && (
            <p className="mt-2 text-xs text-amber-800">
              No portal login for this client, so there is nobody to send it to. Send the portal
              invite from their Overview tab first.
            </p>
          )}
          {row.sendError && (
            <p className="mt-2 text-xs text-red-700">Last send failed: {row.sendError}</p>
          )}

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700">
              What&rsquo;s next — your words, in the email above the findings
            </label>
            <textarea
              value={notes[row.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
              onBlur={() => {
                if ((notes[row.id] ?? '') !== (row.note || '')) void saveNote(row.id)
              }}
              rows={3}
              placeholder="Optional. Left empty, the report carries only the findings the sweeps filed."
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {noteSaved[row.id] ? 'Saved.' : `${row.findings} finding(s) will be listed underneath.`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="font-semibold tabular-nums text-gray-900">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  )
}
