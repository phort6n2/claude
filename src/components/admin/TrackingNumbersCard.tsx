'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Phone, Trash2, TriangleAlert, CircleCheck } from 'lucide-react'

/**
 * Tracking numbers for a client.
 *
 * The warning about repointing is the important part of this card, not
 * decoration. A phone number sends its calls to exactly one place, so adding
 * one here takes it away from wherever it was answering before — and the
 * before, for these numbers, is a live CRM taking real calls. That is a
 * migration for one number at a time, and it should read like one.
 */

interface TrackingNumber {
  id: string
  phoneNumber: string
  forwardTo: string
  label: string | null
  recordCalls: boolean
  announceRecording: boolean
  whisper: string | null
  active: boolean
}

const BLANK = {
  phoneNumber: '',
  forwardTo: '',
  label: '',
  recordCalls: true,
  announceRecording: true,
  whisper: '',
}

export default function TrackingNumbersCard({ clientId }: { clientId: string }) {
  const [numbers, setNumbers] = useState<TrackingNumber[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [draft, setDraft] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/tracking-numbers`)).json()
      if (data.unavailable) setUnavailable(true)
      setNumbers(data.numbers || [])
    } catch {
      setNumbers([])
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/tracking-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setDraft({ ...BLANK })
      await load()
      setMessage({ ok: true, text: 'Number is live. Calls to it now route through here.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  async function remove(numberId: string, phoneNumber: string) {
    if (!confirm(`Stop routing ${phoneNumber} through this app?\n\nThe number stays in your Twilio account — this only removes it from this client.`)) return
    setMessage(null)
    try {
      const res = await fetch(
        `/api/clients/${clientId}/tracking-numbers?numberId=${encodeURIComponent(numberId)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not remove')
      await load()
      setMessage({ ok: true, text: data.note || 'Removed.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    }
  }

  if (!numbers) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading tracking numbers…
      </div>
    )
  }

  return (
    <div className="p-6 pt-4 space-y-5">
      {unavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            The tracking numbers table doesn&apos;t exist yet. Run{' '}
            <code className="font-mono">/api/admin/setup-db</code>.
          </span>
        </div>
      )}

      {numbers.length > 0 && (
        <ul className="space-y-2">
          {numbers.map((n) => (
            <li
              key={n.id}
              className="flex items-start gap-3 rounded-lg border border-gray-200 p-3"
            >
              <Phone size={16} className="mt-0.5 text-gray-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 text-sm">
                  {n.phoneNumber}
                  {n.label && <span className="text-gray-500 font-normal"> · {n.label}</span>}
                </p>
                <p className="text-xs text-gray-500">
                  Rings {n.forwardTo}
                  {n.recordCalls ? ' · recorded' : ' · not recorded'}
                  {n.recordCalls && n.announceRecording ? ' · caller told' : ''}
                  {!n.active && ' · paused'}
                </p>
                {n.whisper && (
                  <p className="text-xs text-gray-400">Shop hears: “{n.whisper}”</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(n.id, n.phoneNumber)}
                aria-label={`Remove ${n.phoneNumber}`}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <span>
          A phone number can only send its calls to one place. Adding a number here repoints it
          at this app and <strong>takes it out of whatever was answering it before</strong> —
          including HighLevel. Move one number, make a test call, then move the rest.
        </span>
      </div>

      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Tracking number</span>
            <input
              value={draft.phoneNumber}
              onChange={(e) => setDraft({ ...draft, phoneNumber: e.target.value })}
              placeholder="+15035550100"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="block text-xs text-gray-400 mt-1">
              Must be in your own Twilio account.
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Rings this number</span>
            <input
              value={draft.forwardTo}
              onChange={(e) => setDraft({ ...draft, forwardTo: e.target.value })}
              placeholder="The shop's real line"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="block text-xs text-gray-400 mt-1">
              The customer&apos;s caller ID passes through, so callbacks work.
            </span>
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">What this number is for</span>
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Google Ads"
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.recordCalls}
            onChange={(e) => setDraft({ ...draft, recordCalls: e.target.checked })}
            className="mt-1"
          />
          <span>
            Record calls
            <span className="block text-xs text-gray-500">
              Required for call coaching — there is nothing to score without a recording.
            </span>
          </span>
        </label>

        {draft.recordCalls && (
          <label className="flex items-start gap-2 text-sm ml-6">
            <input
              type="checkbox"
              checked={draft.announceRecording}
              onChange={(e) => setDraft({ ...draft, announceRecording: e.target.checked })}
              className="mt-1"
            />
            <span>
              Tell the caller the call may be recorded
              <span className="block text-xs text-gray-500">
                Leave this on. Recording someone without telling them is illegal in a dozen or so
                states, and the announcement costs two seconds.
              </span>
            </span>
          </label>
        )}

        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            Whisper to the shop <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            value={draft.whisper}
            onChange={(e) => setDraft({ ...draft, whisper: e.target.value })}
            placeholder="Google Ads call"
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
          />
          <span className="block text-xs text-gray-400 mt-1">
            Played to whoever picks up, before the customer is connected. The customer hears none
            of it.
          </span>
        </label>

        <button
          type="button"
          onClick={add}
          disabled={saving || !draft.phoneNumber || !draft.forwardTo}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />}
          Add and repoint in Twilio
        </button>
      </div>

      {message && (
        <p
          className={`text-sm flex items-start gap-1.5 ${
            message.ok ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {message.ok ? (
            <CircleCheck size={15} className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          )}
          {message.text}
        </p>
      )}
    </div>
  )
}
