'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail, MessageSquare, Phone, Send, TriangleAlert } from 'lucide-react'
import { RecipientList } from '@/components/admin/RecipientList'

/**
 * Who gets told when a lead arrives.
 *
 * Alerts send from the platform's own Resend account and Twilio number — a
 * client never signs up for anything, so switching them on is a toggle rather
 * than an onboarding. Email is included with every plan; SMS is the $15/mo
 * add-on, which is why it is admin-only and stamps an activation date.
 *
 * Recipients are per client and not derived from the client's own email
 * address: the person who should be woken by a lead is rarely the person the
 * business is registered to. It is the dispatcher, or two techs' mobiles.
 */

interface State {
  emailEnabled: boolean
  emailTo: string[]
  emailCallLeads: boolean
  smsEnabled: boolean
  smsTo: string[]
  smsActivatedAt: string | null
  smsComplimentary: boolean
  smsNote: string
  lastSentAt: string | null
  lastError: string | null
}

export default function LeadNotificationsCard({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [providers, setProviders] = useState({ email: false, sms: false })
  const [unavailable, setUnavailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/notifications`)).json()
      if (data.unavailable) setUnavailable(true)
      setProviders(data.providers || { email: false, sms: false })
      setState(
        data.notification || {
          emailEnabled: false,
          emailTo: [],
          emailCallLeads: true,
          smsEnabled: false,
          smsTo: [],
          smsActivatedAt: null,
          smsComplimentary: false,
          smsNote: '',
          lastSentAt: null,
          lastError: null,
        }
      )
    } catch {
      setState({
        emailEnabled: false,
        emailTo: [],
        emailCallLeads: true,
        smsEnabled: false,
        smsTo: [],
        smsActivatedAt: null,
        smsComplimentary: false,
        smsNote: '',
        lastSentAt: null,
        lastError: null,
      })
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  const set = <K extends keyof State>(key: K, value: State[K]) => {
    setState((prev) => (prev ? { ...prev, [key]: value } : prev))
    setMessage(null)
  }

  async function save() {
    if (!state) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      await load()
      setMessage({ ok: true, text: 'Saved.' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  async function sendTest(kind: 'form' | 'call' = 'form') {
    setTesting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json()
      const bits = [
        data.emailSent ? `${data.emailSent} email` : null,
        data.smsSent ? `${data.smsSent} SMS` : null,
      ].filter(Boolean)
      setMessage({
        ok: data.ok && bits.length > 0,
        text: bits.length
          ? `Sent ${bits.join(' and ')}.${data.errors?.length ? ` Problems: ${data.errors.join(' · ')}` : ''}`
          : data.errors?.join(' · ') ||
            (kind === 'call' && !state?.emailCallLeads && state?.emailEnabled
              ? 'Nothing was sent — phone-call emails are switched off for this client, which is what that switch does.'
              : 'Nothing was sent — no recipients saved.'),
      })
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setTesting(false)
    }
  }

  if (!state) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading notifications…
      </div>
    )
  }

  return (
    <div className="p-6 pt-4 space-y-5">
      {unavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            The notifications table doesn&apos;t exist yet. Run{' '}
            <code className="font-mono">/api/admin/setup-db</code>.
          </span>
        </div>
      )}

      {/* ---- Email: included ---- */}
      <div className="space-y-2">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={state.emailEnabled}
            onChange={(e) => set('emailEnabled', e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900 flex items-center gap-1.5">
              <Mail size={14} /> Email alerts
              <span className="text-[11px] font-bold uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                Included
              </span>
            </span>
            <span className="block text-xs text-gray-500">
              Sent the moment the form is submitted, with a one-tap call button. Replies go to the
              customer, not to us.
            </span>
          </span>
        </label>
        <RecipientList
          kind="email"
          values={state.emailTo}
          onChange={(next) => set('emailTo', next)}
          placeholder="dispatch@theshop.com"
          addLabel="Add another email address"
        />
        {/* Under the recipients, because it narrows what THEY get rather than
            being a second channel. Nested and only shown when email is on, so
            it cannot read as a setting that does something on its own. */}
        {state.emailEnabled && (
          <label className="flex items-start gap-2 ml-6">
            <input
              type="checkbox"
              checked={state.emailCallLeads}
              onChange={(e) => set('emailCallLeads', e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Email phone calls too</span>
              <span className="block text-xs text-gray-500">
                On: every tracked call emails the same alert a form does. Off: only form
                submissions email, and calls are left to the Call Coaching tab. A shop whose
                phone is always answered gets nothing from an email saying it rang. SMS alerts
                are unaffected either way.
              </span>
            </span>
          </label>
        )}
        {!providers.email && (
          <p className="text-xs text-amber-700">
            No Resend key saved yet — add it under Settings → API keys or these won&apos;t send.
          </p>
        )}
      </div>

      {/* ---- SMS: the paid add-on ---- */}
      <div className="space-y-2 border-t border-gray-200 pt-4">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={state.smsEnabled}
            onChange={(e) => set('smsEnabled', e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900 flex items-center gap-1.5">
              <MessageSquare size={14} /> SMS alerts
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                $15/mo add-on
              </span>
            </span>
            <span className="block text-xs text-gray-500">
              Texts from your Twilio number — the client sets nothing up. Switching this on
              doesn&apos;t charge anyone; it is your call, so an existing client can be given it
              for nothing.
            </span>
          </span>
        </label>
        <RecipientList
          kind="phone"
          values={state.smsTo}
          onChange={(next) => set('smsTo', next)}
          placeholder="(503) 555-0100"
          addLabel="Add another mobile number"
        />
        {state.smsEnabled && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.smsComplimentary}
                onChange={(e) => set('smsComplimentary', e.target.checked)}
                className="mt-1"
              />
              <span>
                Complimentary — don&apos;t invoice
                <span className="block text-xs text-gray-500">
                  For clients who were here before the add-on existed, or anyone you want to
                  comp. It changes nothing about how the texts send; it just means this one
                  won&apos;t show up as billable.
                </span>
              </span>
            </label>
            <input
              type="text"
              value={state.smsNote}
              onChange={(e) => set('smsNote', e.target.value)}
              placeholder="Why — e.g. grandfathered, trial through March"
              className="w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            {state.smsActivatedAt && (
              <p className="text-xs text-gray-500">
                {state.smsComplimentary ? 'Comped' : 'Billable'} since{' '}
                {new Date(state.smsActivatedAt).toLocaleDateString()}.
              </p>
            )}
          </div>
        )}
        {!providers.sms && (
          <p className="text-xs text-amber-700">
            No Twilio credentials saved yet — add them under Settings → API keys.
          </p>
        )}
      </div>

      {(state.lastSentAt || state.lastError) && (
        <p className="text-xs text-gray-500 border-t border-gray-200 pt-3">
          Last attempt {state.lastSentAt ? new Date(state.lastSentAt).toLocaleString() : '—'}
          {state.lastError && <span className="block text-red-600">{state.lastError}</span>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save notifications
        </button>
        <button
          type="button"
          onClick={() => sendTest('form')}
          disabled={testing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Send test
        </button>
        {/* The call variant is a different message, and the only one the
            phone-call switch above touches — so it is testable rather than
            something you find out about on a real call. */}
        <button
          type="button"
          onClick={() => sendTest('call')}
          disabled={testing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-60"
        >
          <Phone size={14} />
          Send test call alert
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
