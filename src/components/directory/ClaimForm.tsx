'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

interface ClaimFormProps {
  existingShopSlug?: string
  existingShopName?: string
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function ClaimForm({ existingShopSlug, existingShopName }: ClaimFormProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')

    const form = e.currentTarget
    const data = new FormData(form)
    const payload = {
      businessName: String(data.get('businessName') ?? ''),
      contactName: String(data.get('contactName') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      city: String(data.get('city') ?? ''),
      state: String(data.get('state') ?? ''),
      website: String(data.get('website') ?? ''),
      message: String(data.get('message') ?? ''),
      wantsMarketingHelp: data.get('wantsMarketingHelp') === 'on',
      existingShopSlug,
    }

    try {
      const res = await fetch('/api/directory/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Something went wrong. Please try again.')
      }
      setStatus('success')
      form.reset()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto text-green-600" width={40} height={40} />
        <h2 className="mt-3 text-xl font-bold text-green-900">Submission received</h2>
        <p className="mx-auto mt-2 max-w-md text-green-800">
          Thanks! We&apos;ll review your listing and get it live shortly. If you
          asked about SEO or ads help, we&apos;ll reach out with details.
        </p>
      </div>
    )
  }

  const input =
    'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
  const label = 'mb-1 block text-sm font-medium text-gray-700'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {existingShopName && (
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You&apos;re claiming <strong>{existingShopName}</strong>. Confirm your
          details below and we&apos;ll verify ownership.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="businessName">
            Business name *
          </label>
          <input id="businessName" name="businessName" required className={input}
            defaultValue={existingShopName ?? ''} />
        </div>
        <div>
          <label className={label} htmlFor="contactName">
            Your name *
          </label>
          <input id="contactName" name="contactName" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="email">
            Email *
          </label>
          <input id="email" name="email" type="email" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="phone">
            Phone *
          </label>
          <input id="phone" name="phone" type="tel" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="city">
            City *
          </label>
          <input id="city" name="city" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="state">
            State *
          </label>
          <input id="state" name="state" required placeholder="e.g. TX" className={input} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="website">
          Website
        </label>
        <input id="website" name="website" type="url" placeholder="https://" className={input} />
      </div>

      <div>
        <label className={label} htmlFor="message">
          Anything else? (services, service area, hours)
        </label>
        <textarea id="message" name="message" rows={4} className={input} />
      </div>

      <label className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
        <input type="checkbox" name="wantsMarketingHelp" className="mt-0.5 h-4 w-4 rounded border-gray-300" />
        <span>
          I&apos;d like a free assessment of my current SEO and Google Ads, and info
          about your done-for-you marketing.
        </span>
      </label>

      {status === 'error' && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {status === 'submitting' && <Loader2 className="animate-spin" width={18} height={18} />}
        {existingShopSlug ? 'Submit claim' : 'Add my free listing'}
      </button>
    </form>
  )
}
