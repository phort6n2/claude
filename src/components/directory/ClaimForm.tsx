'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck, ShieldAlert, Truck } from 'lucide-react'
import { GbpPicker, type GbpDetails } from './GbpPicker'

interface ClaimFormProps {
  existingShopSlug?: string
  existingShopName?: string
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

const EMPTY_GBP = {
  placeId: '',
  category: '',
  stateFull: '',
  street: '',
  zip: '',
  serviceAreaOnly: false,
  verdict: '',
}

export function ClaimForm({ existingShopSlug, existingShopName }: ClaimFormProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Prefillable fields (the GBP picker sets these; also the manual fallback).
  const [businessName, setBusinessName] = useState(existingShopName ?? '')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [gbp, setGbp] = useState(EMPTY_GBP)

  function onPick(d: GbpDetails) {
    setBusinessName(d.name || businessName)
    setCity(d.city || city)
    setStateCode((d.state || stateCode).toUpperCase())
    setPhone(d.phone || phone)
    setWebsite(d.website || website)
    setGbp({
      placeId: d.placeId || '',
      category: d.category || '',
      stateFull: d.stateFull || '',
      street: d.street || '',
      zip: d.zip || '',
      serviceAreaOnly: !!d.serviceAreaOnly,
      verdict: d.verify?.verdict || '',
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    const data = new FormData(e.currentTarget)
    const payload = {
      businessName,
      email: String(data.get('email') ?? ''),
      city,
      state: stateCode,
      phone,
      website,
      contactName: String(data.get('contactName') ?? ''),
      message: String(data.get('message') ?? ''),
      wantsMarketingHelp: data.get('wantsMarketingHelp') === 'on',
      company: String(data.get('company') ?? ''), // honeypot
      existingShopSlug,
      // GBP metadata (present when the picker was used).
      placeId: gbp.placeId || undefined,
      googleCategory: gbp.category || undefined,
      verifyVerdict: gbp.verdict || undefined,
      serviceAreaOnly: gbp.serviceAreaOnly || undefined,
      stateFull: gbp.stateFull || undefined,
      street: gbp.street || undefined,
      zip: gbp.zip || undefined,
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
          Thanks! We&apos;ll review your listing and get it live shortly. If you asked about SEO or
          ads help, we&apos;ll reach out with details.
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
          You&apos;re claiming <strong>{existingShopName}</strong>. Confirm your details below and
          we&apos;ll verify ownership.
        </div>
      )}

      {/* Honeypot */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {/* Google Business Profile picker — autofills the fields below */}
      <GbpPicker onSelect={onPick} />

      {/* Confirmation of what Google returned + spam verdict */}
      {gbp.placeId && (
        <div
          className={
            'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ' +
            (gbp.verdict === 'auto_glass'
              ? 'border-green-200 bg-green-50 text-green-800'
              : gbp.verdict === 'off_category'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-800')
          }
        >
          {gbp.verdict === 'auto_glass' ? (
            <ShieldCheck width={16} height={16} className="mt-0.5 shrink-0" />
          ) : (
            <ShieldAlert width={16} height={16} className="mt-0.5 shrink-0" />
          )}
          <span>
            {gbp.verdict === 'auto_glass'
              ? 'Verified as an auto glass business on Google.'
              : gbp.verdict === 'off_category'
                ? `Google lists this as “${gbp.category}”. Make sure this is the right business — we may need to confirm it.`
                : `Found on Google${gbp.category ? ` (“${gbp.category}”)` : ''}. We'll confirm the details.`}
            {gbp.serviceAreaOnly && (
              <span className="mt-1 flex items-center gap-1 text-xs">
                <Truck width={12} height={12} /> Service-area business — no storefront address, that&apos;s fine.
              </span>
            )}
          </span>
        </div>
      )}

      {/* Details (prefilled from the picker, or fill in manually) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="businessName">
            Business name *
          </label>
          <input
            id="businessName"
            required
            className={input}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="email">
            Email *
          </label>
          <input id="email" name="email" type="email" required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="city">
            City *
          </label>
          <input
            id="city"
            required
            className={input}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="state">
            State
          </label>
          <input
            id="state"
            placeholder="e.g. TX"
            className={input}
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            className={input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="website">
            Website
          </label>
          <input
            id="website"
            type="url"
            placeholder="https://"
            className={input}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      <details className="group rounded-lg border border-gray-200 bg-gray-50/60">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700 marker:content-none">
          <span className="inline-flex items-center gap-2">
            <span className="text-blue-600 transition-transform group-open:rotate-90">›</span>
            Add more details (optional)
          </span>
        </summary>
        <div className="space-y-4 border-t border-gray-200 p-4">
          <div>
            <label className={label} htmlFor="contactName">
              Your name
            </label>
            <input id="contactName" name="contactName" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="message">
              Anything else? (services, service area, hours)
            </label>
            <textarea id="message" name="message" rows={3} className={input} />
          </div>
        </div>
      </details>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3.5 text-sm text-gray-700 transition-colors hover:bg-gray-100">
        <input
          type="checkbox"
          name="wantsMarketingHelp"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        />
        <span>
          I&apos;d like a free assessment of my current SEO and Google Ads, and info about your
          done-for-you marketing.
        </span>
      </label>

      {status === 'error' && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm outline-none transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {status === 'submitting' && <Loader2 className="animate-spin" width={18} height={18} />}
          {status === 'submitting' ? 'Submitting…' : existingShopSlug ? 'Submit claim' : 'Add my free listing'}
        </button>
        <p className="text-xs text-gray-500">
          Free forever · No credit card · Most listings live within 24 hours.
        </p>
      </div>
    </form>
  )
}
