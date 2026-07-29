'use client'

import { useState } from 'react'
import { Mail, Loader2, Check } from 'lucide-react'

// A friendly, instant-save opt-in for the upsell email drip. Reflects the
// owner's current choice and flips it in one tap — no full-form save needed.
export function MarketingOptIn({ initial, city }: { initial: boolean; city?: string }) {
  const [optIn, setOptIn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    const next = !optIn
    setBusy(true)
    setError('')
    setSaved(false)
    // optimistic
    setOptIn(next)
    try {
      const res = await fetch('/api/directory/owner/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optIn: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setOptIn(!next) // revert
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-lg">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Mail width={18} height={18} className="text-blue-600" /> Growth tips &amp; offers
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Get occasional emails on how to win more customers — where you rank, ways to reach the
            top of {city || 'your city'}, and offers to grow. A few emails, no spam, unsubscribe
            anytime.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {saved && !error && (
            <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-green-700">
              <Check width={14} height={14} /> Saved
            </p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          onClick={toggle}
          disabled={busy}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            optIn ? 'bg-brand-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
              optIn ? 'translate-x-6' : 'translate-x-1'
            }`}
          >
            {busy && <Loader2 className="animate-spin text-blue-600" width={12} height={12} />}
          </span>
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        {optIn
          ? "You're subscribed. We'll only reach out with things that help your shop grow."
          : "You're not subscribed. Turn this on to get growth tips and offers."}
      </p>
    </section>
  )
}
