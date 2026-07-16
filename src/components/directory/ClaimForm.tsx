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
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 ring-8 ring-green-50">
          <CheckCircle2 className="text-green-600" width={32} height={32} />
        </span>
        <h2 className="mt-4 text-xl font-bold text-green-900">Submission received</h2>
        <p className="mx-auto mt-2 max-w-md text-green-800">
          Thanks! We&apos;ll review your listing and get it live shortly. If you
          asked about SEO or ads help, we&apos;ll reach out with details.
        </p>
      </div>
    )
  }

  const input =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
  const label = 'mb-1.5 block text-sm font-medium text-gray-700'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {existingShopName && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
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

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3.5 text-sm text-gray-700 transition-colors hover:bg-gray-100">
        <input
          type="checkbox"
          name="wantsMarketingHelp"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        />
        <span>
          I&apos;d like a free assessment of my current SEO and Google Ads, and info
          about your done-for-you marketing.
        </span>
      </label>

      {status === 'error' && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm outline-none transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === 'submitting' && <Loader2 className="animate-spin" width={18} height={18} />}
        {status === 'submitting'
          ? 'Submitting…'
          : existingShopSlug
            ? 'Submit claim'
            : 'Add my free listing'}
      </button>
    </form>
  )
}
