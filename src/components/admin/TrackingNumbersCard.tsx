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
  useOnSite: boolean
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
  const [stats, setStats] = useState<Record<string, { calls: number; missed: number; minutes: number }>>({})
  const [usage, setUsage] = useState<
    { month: string; records: Array<{ category: string; usage: number; usageUnit: string; price: number }> } | null
  >(null)
  const [unavailable, setUnavailable] = useState(false)
  const [draft, setDraft] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [areaCode, setAreaCode] = useState('')
  const [candidates, setCandidates] = useState<
    Array<{ phoneNumber: string; friendlyName: string; locality: string; region: string }> | null
  >(null)
  const [searching, setSearching] = useState(false)
  const [buying, setBuying] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/tracking-numbers`)).json()
      if (data.unavailable) setUnavailable(true)
      setNumbers(data.numbers || [])
      setStats(data.stats || {})
      // The platform's Twilio bill for the month. Best-effort — a failed
      // lookup hides the line rather than degrading the card.
      fetch('/api/admin/twilio/usage')
        .then((r) => (r.ok ? r.json() : null))
        .then((u) => u && setUsage(u))
        .catch(() => {})
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

  async function search() {
    setSearching(true)
    setMessage(null)
    setCandidates(null)
    try {
      const res = await fetch(
        `/api/clients/${clientId}/tracking-numbers/available?areaCode=${encodeURIComponent(areaCode)}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setCandidates(data.numbers || [])
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSearching(false)
    }
  }

  async function buy(phoneNumber: string) {
    if (!draft.forwardTo) {
      setMessage({ ok: false, text: 'Fill in "Rings this number" above first — a bought number has to forward somewhere from the moment it exists.' })
      return
    }
    if (!confirm(`Buy ${phoneNumber} from Twilio?\n\nTwilio bills its standard monthly rate for a US local number (about $1.15/mo) until you release it.`)) return
    setBuying(phoneNumber)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/tracking-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, phoneNumber, purchase: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not buy')
      setCandidates(null)
      setAreaCode('')
      setDraft({ ...BLANK })
      await load()
      setMessage({ ok: true, text: `Bought ${phoneNumber}. It rings ${draft.forwardTo} and tracking is live — no other setup needed.` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBuying(null)
    }
  }

  /**
   * Autosave for existing numbers. Every control on a saved row writes the
   * moment it changes — a settings card with an invisible save button is a
   * card whose settings silently do not apply, which is how this started.
   */
  async function patchNumber(
    numberId: string,
    patch: Record<string, unknown>,
    savedText = 'Saved. Applies from the next call.'
  ) {
    setMessage(null)
    // Flip the control immediately — a checkbox that answers after a round
    // trip reads as broken. load() reconciles with the truth either way.
    setNumbers((prev) =>
      prev
        ? prev.map((x) => {
            if (x.id === numberId) return { ...x, ...patch }
            // Only one number may front the site, so claiming it releases it
            // everywhere else, locally as well as on the server.
            if (patch.useOnSite === true && x.useOnSite) return { ...x, useOnSite: false }
            return x
          })
        : prev
    )
    try {
      const res = await fetch(`/api/clients/${clientId}/tracking-numbers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberId, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update')
      await load()
      setMessage({ ok: true, text: savedText })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
      await load()
    }
  }

  async function setSiteNumber(numberId: string, useOnSite: boolean) {
    await patchNumber(
      numberId,
      { useOnSite },
      useOnSite
        ? 'The hosted site now shows this number everywhere a visitor sees a phone. Live within about five minutes.'
        : 'The site is back to showing the shop\u2019s real line.'
    )
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
                  {!n.active && <span className="text-amber-600 font-normal"> · paused</span>}
                </p>
                <label className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                  Rings
                  <input
                    key={`${n.id}-fwd-${n.forwardTo}`}
                    defaultValue={n.forwardTo}
                    onBlur={(e) => {
                      const value = e.target.value.trim()
                      if (value && value !== n.forwardTo) patchNumber(n.id, { forwardTo: value })
                    }}
                    className="w-36 px-2 py-1 border rounded text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={n.recordCalls}
                      onChange={(e) => patchNumber(n.id, { recordCalls: e.target.checked })}
                    />
                    Record calls
                  </label>
                  {n.recordCalls && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={n.announceRecording}
                        onChange={(e) => patchNumber(n.id, { announceRecording: e.target.checked })}
                      />
                      Tell the caller it may be recorded
                    </label>
                  )}
                </div>
                <label className="mt-1.5 flex items-center gap-2 text-xs text-gray-600">
                  Whisper
                  <input
                    key={`${n.id}-wh-${n.whisper ?? ''}`}
                    defaultValue={n.whisper ?? ''}
                    placeholder="none"
                    onBlur={(e) => {
                      const value = e.target.value.trim()
                      if (value !== (n.whisper ?? '')) patchNumber(n.id, { whisper: value })
                    }}
                    className="w-44 px-2 py-1 border rounded text-xs focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSiteNumber(n.id, !n.useOnSite)}
                  className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                    n.useOnSite
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-700'
                  }`}
                >
                  {n.useOnSite ? '\u2713 Shown on the hosted site' : 'Show on the hosted site'}
                </button>
                {stats[n.phoneNumber] && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    Last 30 days: <strong>{stats[n.phoneNumber].calls}</strong>{' '}
                    {stats[n.phoneNumber].calls === 1 ? 'call' : 'calls'}
                    {stats[n.phoneNumber].missed > 0 && (
                      <span className="text-amber-700"> · {stats[n.phoneNumber].missed} missed</span>
                    )}
                    {' '}· {stats[n.phoneNumber].minutes} min
                  </p>
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

        <div className="border-t border-gray-200 pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-900">
            No spare number? Buy one
            <span className="block text-xs font-normal text-gray-500">
              Bought numbers arrive already pointed here — nothing to move, nothing taken from
              anywhere else. Twilio bills about $1.15/mo per US local number. Fill in
              &ldquo;Rings this number&rdquo; above before buying.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              placeholder="Area code, e.g. 805"
              inputMode="numeric"
              maxLength={3}
              className="w-40 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={search}
              disabled={searching || areaCode.replace(/\D/g, '').length !== 3}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {searching && <Loader2 size={14} className="animate-spin" />}
              Search
            </button>
          </div>
          {candidates && candidates.length === 0 && (
            <p className="text-sm text-gray-500">Nothing for sale in that area code right now.</p>
          )}
          {candidates && candidates.length > 0 && (
            <ul className="space-y-1.5">
              {candidates.map((c) => (
                <li
                  key={c.phoneNumber}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <span className="text-sm font-medium text-gray-900">{c.friendlyName || c.phoneNumber}</span>
                  <span className="text-xs text-gray-400">
                    {[c.locality, c.region].filter(Boolean).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => buy(c.phoneNumber)}
                    disabled={!!buying}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {buying === c.phoneNumber && <Loader2 size={12} className="animate-spin" />}
                    Buy
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {usage && usage.records.length > 0 && (
        <p className="text-xs text-gray-500 border-t border-gray-200 pt-3">
          Twilio this month ({usage.month}):{' '}
          {(() => {
            const total = usage.records.find((r) => r.category === 'totalprice')
            const parts = usage.records
              .filter((r) => r.category !== 'totalprice' && r.price > 0)
              .map((r) => `${r.category} $${r.price.toFixed(2)}`)
            return `${total ? `$${total.price.toFixed(2)}` : '—'}${parts.length ? ` (${parts.join(' · ')})` : ''}`
          })()}
          <span className="block text-gray-400">
            Whole account, all clients — not just this shop&apos;s numbers.
          </span>
        </p>
      )}

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
