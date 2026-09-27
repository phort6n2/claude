'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Mail } from 'lucide-react'

/**
 * Everything that has arrived at the reports inbox, used or not — see
 * lib/seo-report-inbound.ts. The answer to "did the SEO report come in?", and
 * the place to file one that named a website no client has.
 *
 * The PDF link is for the operator. The client never sees the supplier's
 * document; they see the figures inside our report.
 */
export interface InboxRow {
  id: string
  receivedAt: string
  sender: string
  subject: string
  kind: string
  site: string | null
  label: string | null
  pdfUrl: string | null
  problem: string | null
  clientName: string | null
  assignable: boolean
  /**
   * For a filed report, where it landed: in that month's report, in one
   * already sent, in NO report because the month was sent before it arrived,
   * or waiting because that month has no report built yet.
   */
  destination: 'in-report' | 'sent' | 'sent-without' | 'no-report' | null
}

export default function SeoReportInbox({
  rows,
  clients,
}: {
  rows: InboxRow[]
  clients: Array<{ id: string; businessName: string }>
}) {
  const router = useRouter()
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function assign(id: string) {
    const clientId = choice[id]
    if (!clientId) return
    setBusy(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/seo-reports/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setMessage({ ok: true, text: data.message || 'Assigned.' })
      router.refresh()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <Mail className="h-4 w-4 text-gray-400" />
        Reports inbox
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        SEO reports forwarded to the app. Each one is read into that shop&rsquo;s monthly report —
        the shop sees the figures, never this PDF.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">Nothing has arrived yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 break-words font-medium text-gray-900">{r.subject}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  {new Date(r.receivedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {r.kind === 'gmail-confirmation' ? (
                // The one email nobody else can read: Gmail's code for turning
                // the forward on lands here, in an inbox only a webhook reads.
                <p className="mt-1 break-words text-blue-800">Gmail forwarding — {r.problem}</p>
              ) : r.problem ? (
                <p className="mt-1 break-words text-amber-800">{r.problem}</p>
              ) : r.destination === 'sent-without' ? (
                <p className="mt-1 text-amber-800">
                  Filed under {r.clientName}, but their {r.label} report was already sent without
                  it, so it was left as sent.
                </p>
              ) : r.destination === 'no-report' ? (
                <p className="mt-1 text-gray-700">
                  Filed under {r.clientName} for {r.label}. No report is built for that month yet;
                  it goes in when one is.
                </p>
              ) : (
                <p className="mt-1 text-green-700">
                  In {r.clientName}&rsquo;s {r.label} report{r.destination === 'sent' ? ' (sent)' : ''}.
                </p>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {r.site && <span>{r.site}</span>}
                {r.label && r.problem && <span>{r.label}</span>}
                {r.pdfUrl && (
                  <a
                    href={r.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </a>
                )}
              </div>

              {r.assignable && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={choice[r.id] || ''}
                    onChange={(e) => setChoice((c) => ({ ...c, [r.id]: e.target.value }))}
                    className="min-w-0 max-w-full rounded-md border px-2 py-1.5 text-sm"
                  >
                    <option value="">Assign to a client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => assign(r.id)}
                    disabled={!choice[r.id] || busy === r.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === r.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Assign
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>
      )}
    </section>
  )
}
