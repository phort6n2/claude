'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Loader2, Mail, Send, Trash2, TriangleAlert } from 'lucide-react'

/**
 * Invites out, drafts back.
 *
 * Two kinds of invite from one card, because they are the same job from the
 * admin's side — pick a shop that already exists, or type the name and email
 * of one that does not.
 */

interface Intake {
  id: string
  businessName: string
  email: string
  kind: string
  seo: boolean
  status: string
  clientId: string | null
  sentAt: string | null
  submittedAt: string | null
  approvedAt: string | null
  url: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  SENT: { label: 'Sent', cls: 'text-gray-600 bg-gray-50 border-gray-200' },
  STARTED: { label: 'Started', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  SUBMITTED: { label: 'Waiting on you', cls: 'text-amber-800 bg-amber-50 border-amber-300' },
  APPROVED: { label: 'Approved', cls: 'text-green-700 bg-green-50 border-green-200' },
}

export default function IntakesManager({
  clients,
}: {
  clients: Array<{ id: string; businessName: string; email: string; seoClient: boolean }>
}) {
  const [intakes, setIntakes] = useState<Intake[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [clientId, setClientId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [seo, setSeo] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch('/api/admin/intakes')).json()
      setIntakes(data.intakes || [])
      if (data.unavailable) setUnavailable(true)
    } catch {
      setIntakes([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function send() {
    setSending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/intakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'existing' ? { clientId } : { businessName, email, seo }
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send it.')
      setMessage({
        ok: true,
        text: data.emailed
          ? 'Invite sent.'
          : `Invite created, but the email did not send${data.emailError ? ` (${data.emailError})` : ''}. Copy the link below and send it yourself.`,
      })
      setClientId('')
      setBusinessName('')
      setEmail('')
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSending(false)
    }
  }

  async function remove(intake: Intake) {
    // The confirm names what actually happens, because the two cases feel
    // opposite: pre-approval it revokes a live invite link; post-approval it
    // only clears the row and the client is untouched.
    const warning =
      intake.status === 'APPROVED'
        ? `Remove ${intake.businessName} from this list? The client stays — only the intake record goes.`
        : `Delete the invite for ${intake.businessName}? Their link stops working immediately.`
    if (!window.confirm(warning)) return
    setDeleting(intake.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/intakes/${intake.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not delete it.')
      }
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setDeleting(null)
    }
  }

  const ready = mode === 'existing' ? !!clientId : !!businessName.trim() && !!email.trim()

  return (
    <div className="p-6 pt-4 space-y-5">
      {unavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          The intake table does not exist yet. Run <code className="font-mono">/api/admin/setup-db</code>.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex gap-2">
          {(['existing', 'new'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                mode === option
                  ? 'bg-blue-50 border-blue-300 text-blue-900'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {option === 'existing' ? 'A client already in the app' : 'A brand new shop'}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">Choose a client…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.businessName} — {client.email}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">
              Their form arrives prefilled with everything we already hold, so the ask is
              &ldquo;check this and tell us where your leads go&rdquo; rather than a blank page.
              Approving applies whatever they corrected.
            </p>
          </>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Shop name"
                className="px-3 py-2 border rounded-md text-sm"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@theshop.com"
                className="px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={seo} onChange={(e) => setSeo(e.target.checked)} />
              Done-for-you SEO plan (asks the extra questions)
            </label>
            <p className="text-xs text-gray-500">
              No client is created yet. Approving their answers is what creates one.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={send}
          disabled={sending || !ready}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send the welcome email
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
        )}
      </div>

      <div className="space-y-2">
        {intakes?.length === 0 && (
          <p className="text-sm text-gray-500">No invites yet.</p>
        )}
        {(intakes || []).map((intake) => {
          const style = STATUS[intake.status] || STATUS.SENT
          return (
            <div
              key={intake.id}
              className="rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{intake.businessName}</span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${style.cls}`}
                  >
                    {style.label}
                  </span>
                  {intake.seo && (
                    <span className="text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border text-purple-700 bg-purple-50 border-purple-200">
                      SEO
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {intake.kind === 'EXISTING' ? 'existing client' : 'new shop'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Mail size={12} /> {intake.email}
                </p>
              </div>

              {intake.url && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(intake.url as string)
                    setCopied(intake.id)
                    setTimeout(() => setCopied(null), 2000)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                >
                  {copied === intake.id ? <Check size={14} /> : <Copy size={14} />}
                  {copied === intake.id ? 'Copied' : 'Copy link'}
                </button>
              )}

              {intake.status === 'APPROVED' && intake.clientId ? (
                <Link
                  href={`/admin/clients/${intake.clientId}`}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                >
                  Open client
                </Link>
              ) : (
                <Link
                  href={`/admin/intakes/${intake.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    intake.status === 'SUBMITTED'
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {intake.status === 'SUBMITTED' ? 'Review' : 'Open'}
                </Link>
              )}

              <button
                type="button"
                onClick={() => remove(intake)}
                disabled={deleting !== null}
                title={
                  intake.status === 'APPROVED'
                    ? 'Remove from this list (the client stays)'
                    : 'Delete the invite — the link stops working'
                }
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting === intake.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Trash2 size={15} />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
