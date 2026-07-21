'use client'

import { useState } from 'react'
import { Send, Loader2, CheckCircle2, MessageSquareQuote } from 'lucide-react'
import { serviceMeta } from '@/lib/directory/data'
import type { ServiceKey } from '@/lib/directory/types'

interface Props {
  shopSlug: string
  shopName: string
  services: ServiceKey[]
}

export function QuoteForm({ shopSlug, shopName, services }: Props) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    setError('')
    const form = e.currentTarget
    const data = new FormData(form)
    const payload = {
      shopSlug,
      shopName,
      name: String(data.get('name') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      vehicle: String(data.get('vehicle') ?? '').trim(),
      service: String(data.get('service') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      // Honeypot — real users leave this empty.
      company: String(data.get('company') ?? '').trim(),
    }
    try {
      const res = await fetch('/api/directory/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Something went wrong')
      setStatus('sent')
      form.reset()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const field =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <CheckCircle2 width={40} height={40} className="mx-auto text-green-600" />
        <p className="mt-3 font-semibold text-green-900">Quote request sent</p>
        <p className="mt-1 text-sm text-green-800">
          {shopName} will reach out with your estimate. For faster service, call them directly.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-4 text-sm font-medium text-green-700 underline hover:text-green-900"
        >
          Send another request
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
        <MessageSquareQuote width={18} height={18} className="text-blue-600" /> Get a free quote
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Tell {shopName} what you need — they&apos;ll get back to you with a price.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        {/* Honeypot: hidden from users, catches bots. */}
        <div className="absolute left-[-9999px]" aria-hidden="true">
          <label>
            Company
            <input name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" required placeholder="Your name" className={field} autoComplete="name" />
          <input
            name="phone"
            required
            type="tel"
            placeholder="Phone"
            className={field}
            autoComplete="tel"
          />
        </div>
        <input
          name="email"
          type="email"
          placeholder="Email (optional)"
          className={field}
          autoComplete="email"
        />
        <input name="vehicle" placeholder="Vehicle (e.g. 2019 Honda Civic)" className={field} />
        <select name="service" className={field} defaultValue="">
          <option value="" disabled>
            What do you need?
          </option>
          {services.map((key) => (
            <option key={key} value={key}>
              {serviceMeta(key).label}
            </option>
          ))}
          <option value="other">Something else</option>
        </select>
        <textarea
          name="message"
          rows={3}
          placeholder="Anything else? (damage size, insurance, timing…)"
          className={field}
        />

        {status === 'error' && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {status === 'sending' ? (
            <Loader2 className="animate-spin" width={18} height={18} />
          ) : (
            <Send width={18} height={18} />
          )}
          Request my quote
        </button>
        <p className="text-center text-xs text-gray-400">
          Free &amp; no obligation. Your details go straight to the shop.
        </p>
      </form>
    </div>
  )
}
