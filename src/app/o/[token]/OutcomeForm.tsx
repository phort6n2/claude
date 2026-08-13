'use client'

import { useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'

/**
 * Two buttons and, if the answer is yes, one number.
 *
 * Sized for a thumb, on a phone, in a workshop. Nothing here is clever
 * because every extra decision is a chance to close the tab, and a lead whose
 * outcome is never recorded is worth nothing to anyone downstream.
 *
 * The amount is optional and says so. "We booked it" on its own is the fact
 * that matters; the number is a bonus that can be corrected later from the
 * portal.
 */
export function OutcomeForm({
  token,
  initialStatus,
  initialAmount,
}: {
  token: string
  initialStatus: string
  initialAmount: number | null
}) {
  const settled = initialStatus === 'SOLD' ? 'won' : initialStatus === 'LOST' ? 'lost' : null
  const [choice, setChoice] = useState<'won' | 'lost' | null>(settled)
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<null | 'won' | 'lost'>(settled)
  const [error, setError] = useState<string | null>(null)

  async function send(outcome: 'won' | 'lost', withAmount: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/lead-outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, outcome, amount: withAmount ? amount : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setSaved(outcome)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className="text-center">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
            saved === 'won' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {saved === 'won' ? <Check className="h-7 w-7" /> : <X className="h-7 w-7" />}
        </div>
        <p className="text-lg font-semibold text-gray-900">
          {saved === 'won' ? 'Marked as booked' : 'Marked as not booked'}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {saved === 'won' && amount
            ? `Recorded at $${Number(String(amount).replace(/[^0-9.]/g, '')).toLocaleString()}. `
            : ''}
          You can change this any time from your leads.
        </p>
        <button
          type="button"
          onClick={() => {
            setSaved(null)
            setChoice(null)
          }}
          className="mt-5 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Change it
        </button>
      </div>
    )
  }

  if (choice === 'won') {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What was the job worth? <span className="font-normal text-gray-400">— optional</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-400">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="450"
            className="w-full rounded-2xl border-2 border-gray-300 py-4 pl-9 pr-4 text-xl focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => send('won', true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 text-lg font-bold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-5 w-5 animate-spin" />}
          Save
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => send('won', false)}
          className="mt-2 w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          Skip the amount
        </button>
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setChoice('won')}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-5 text-lg font-bold text-white hover:bg-green-700"
      >
        <Check className="h-5 w-5" />
        We booked it
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => send('lost', false)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-300 bg-white py-5 text-lg font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-5 w-5" />}
        Didn&apos;t book
      </button>
      {error && <p className="text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
