'use client'

import { useState } from 'react'
import { AlertCircle, Check, KeyRound, Loader2, Send } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * The door to the portal, opened by hand.
 *
 * Approval deliberately sends nothing to the shop; this card is where the
 * operator decides the setup is worth a first look and lets them in. It
 * leans on the readiness count as the prompt — "checklist clear, good time"
 * versus "N required items still open" — but never blocks the send: the
 * checklist advises, the operator decides.
 */
export default function PortalInviteCard({
  clientId,
  defaultEmail,
  defaultName,
  invited,
  invitedEmail,
  lastLoginAt,
  requiredOpen,
}: {
  clientId: string
  defaultEmail: string
  defaultName: string
  /** A portal user already exists for this client. */
  invited: boolean
  invitedEmail: string | null
  lastLoginAt: string | null
  requiredOpen: number
}) {
  const [email, setEmail] = useState(invitedEmail || defaultEmail)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function send() {
    setSending(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: defaultName }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'The invite did not send'))
      const data = await res.json()
      setMessage({ ok: true, text: `Invite sent to ${data.to}.` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className={`h-8 w-8 rounded-lg flex items-center justify-center ${
            lastLoginAt
              ? 'text-green-600 bg-green-50'
              : invited
                ? 'text-blue-600 bg-blue-50'
                : 'text-amber-600 bg-amber-50'
          }`}
        >
          <KeyRound className="h-4 w-4" />
        </span>
        <h2 className="font-semibold text-gray-900 text-sm">Portal invite</h2>
      </div>

      <div className="text-sm text-gray-600 flex-1 space-y-2">
        {invited ? (
          <p>
            <span className="font-medium text-gray-900">{invitedEmail}</span> has been invited
            {lastLoginAt
              ? ` and signed in ${new Date(lastLoginAt).toLocaleDateString()}.`
              : ', but has not signed in yet — re-send for a fresh link.'}
          </p>
        ) : (
          <p>
            The shop can&apos;t get in yet — approval doesn&apos;t email them. Send this when the
            setup is worth their first look.
          </p>
        )}

        {requiredOpen > 0 ? (
          <p className="flex items-start gap-1.5 text-amber-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {requiredOpen} required setup item{requiredOpen === 1 ? '' : 's'} still open — check the
            readiness list before inviting.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-green-700">
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
            Setup checklist is clear — good time to invite.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@theshop.com"
            className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !email.trim()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {invited ? 'Send again' : 'Send the invite'}
          </button>
        </div>

        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
