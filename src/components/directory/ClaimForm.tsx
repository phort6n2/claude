'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Truck,
  TrendingUp,
  Star,
  ArrowRight,
  MessageSquare,
} from 'lucide-react'
import { GbpPicker, type GbpDetails } from './GbpPicker'
import {
  featuredCheckoutUrl,
  AGMP_AUDIT_URL,
  AGMP_PHONE_DISPLAY,
  AGMP_PHONE_TEL,
  FEATURED_PRICE_DISPLAY,
} from '@/lib/directory/agmp'

interface ClaimFormProps {
  existingShopSlug?: string
  existingShopName?: string
  /** 'featured' when the shop arrived via a "Featured — $7/mo" CTA. */
  intent?: 'free' | 'featured'
}

type Status = 'idle' | 'submitting' | 'success' | 'error'

interface RankInfo {
  rank: number
  total: number
  city: string
  state: string
}

const EMPTY_GBP = {
  placeId: '',
  category: '',
  stateFull: '',
  street: '',
  zip: '',
  serviceAreaOnly: false,
  verdict: '',
}

const SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'windshield-repair', label: 'Chip / crack repair' },
  { value: 'windshield-replacement', label: 'Windshield replacement' },
  { value: 'adas-calibration', label: 'ADAS calibration' },
  { value: 'rear-window', label: 'Back / door glass' },
  { value: 'mobile-service', label: 'Mobile service' },
  { value: 'window-tint', label: 'Window tint' },
]

const VOLUME_OPTIONS = ['Under 20', '20–50', '50–100', '100–250', '250+']

export function ClaimForm({ existingShopSlug, existingShopName, intent = 'free' }: ClaimFormProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<{ slug?: string; rank?: RankInfo } | null>(null)

  // Prefillable fields (the GBP picker sets these; also the manual fallback).
  const [businessName, setBusinessName] = useState(existingShopName ?? '')
  const [email, setEmail] = useState('')
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
      email,
      city,
      state: stateCode,
      phone,
      website,
      contactName: String(data.get('contactName') ?? ''),
      message: String(data.get('message') ?? ''),
      wantsMarketingHelp: data.get('wantsMarketingHelp') === 'on',
      services: data.getAll('services').map(String),
      monthlyVolume: String(data.get('monthlyVolume') ?? ''),
      frustration: String(data.get('frustration') ?? ''),
      smsConsent: data.get('smsConsent') === 'on',
      intent,
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
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Something went wrong. Please try again.')
      setResult({ slug: j.slug, rank: j.rank })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  if (status === 'success') {
    return <ClaimSuccess result={result} email={email} intent={intent} />
  }

  const input =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
  const label = 'mb-1.5 block text-sm font-medium text-gray-700'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {intent === 'featured' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Featured — {FEATURED_PRICE_DISPLAY}.</strong> Confirm your business details below;
          you&apos;ll go to secure checkout on the next step and jump to the top of your city.
        </div>
      )}
      {existingShopName && intent !== 'featured' && (
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
          <input
            id="email"
            name="email"
            type="email"
            required
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
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
            Cell phone
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

      {/* Services offered */}
      <fieldset>
        <legend className={label}>Services you offer</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SERVICE_OPTIONS.map((s) => (
            <label
              key={s.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name="services"
                value={s.value}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="monthlyVolume">
            Rough monthly job volume
          </label>
          <select id="monthlyVolume" name="monthlyVolume" defaultValue="" className={input}>
            <option value="">Prefer not to say</option>
            {VOLUME_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v} jobs / mo
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="contactName">
            Your name
          </label>
          <input id="contactName" name="contactName" className={input} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="frustration">
          What&apos;s your biggest frustration with getting more jobs right now?
        </label>
        <textarea
          id="frustration"
          name="frustration"
          rows={2}
          placeholder="e.g. slow months, too much price shopping, can't outrank the big chains…"
          className={input}
        />
      </div>

      <details className="group rounded-lg border border-gray-200 bg-gray-50/60">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700 marker:content-none">
          <span className="inline-flex items-center gap-2">
            <span className="text-blue-600 transition-transform group-open:rotate-90">›</span>
            Anything else? (service area, hours)
          </span>
        </summary>
        <div className="space-y-4 border-t border-gray-200 p-4">
          <textarea id="message" name="message" rows={3} className={input} />
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

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3.5 text-sm text-gray-700 transition-colors hover:bg-gray-100">
        <input
          type="checkbox"
          name="smsConsent"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        />
        <span>
          It&apos;s OK to text me about my listing and growth options. Message/data rates may apply;
          reply STOP to opt out.
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
          {status === 'submitting'
            ? 'Submitting…'
            : intent === 'featured'
              ? 'Continue to checkout →'
              : existingShopSlug
                ? 'Submit claim'
                : 'Add my free listing'}
        </button>
        <p className="text-xs text-gray-500">
          {intent === 'featured'
            ? `Featured is ${FEATURED_PRICE_DISPLAY}, cancel anytime. Your free listing stays free.`
            : 'Free forever · No credit card · Most listings live within 24 hours.'}
        </p>
      </div>
    </form>
  )
}

// ---- Success / rank-reveal upsell -----------------------------------------

function ClaimSuccess({
  result,
  email,
  intent,
}: {
  result: { slug?: string; rank?: RankInfo } | null
  email: string
  intent: 'free' | 'featured'
}) {
  const rank = result?.rank
  const slug = result?.slug
  const checkout = slug ? featuredCheckoutUrl(slug, email) : null
  const featuredCta = checkout ? (
    <a
      href={checkout}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto"
    >
      <Star width={18} height={18} /> Jump to the top — {FEATURED_PRICE_DISPLAY}
    </a>
  ) : (
    <a
      href={`sms:${AGMP_PHONE_TEL}`}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto"
    >
      <MessageSquare width={18} height={18} /> Text Matt to go Featured — {FEATURED_PRICE_DISPLAY}
    </a>
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 ring-8 ring-green-50">
        <CheckCircle2 className="text-green-600" width={32} height={32} />
      </span>
      <h2 className="mt-4 text-xl font-bold text-gray-900">
        {slug ? 'Your listing is claimed' : 'Submission received'}
      </h2>
      <p className="mt-2 text-gray-600">
        {slug
          ? "Thanks! We'll verify ownership shortly. In the meantime — here's where you stand."
          : "Thanks! We'll review your listing and get it live shortly."}
      </p>

      {rank && (
        <div className="mt-6 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <TrendingUp width={16} height={16} /> Your ranking in {rank.city}
          </p>
          <p className="mt-1 text-3xl font-extrabold text-gray-900">
            #{rank.rank}{' '}
            <span className="text-lg font-semibold text-gray-500">
              of {rank.total} auto glass shops
            </span>
          </p>
          <p className="mt-2 text-sm text-gray-600">
            In local search, the top few listings capture the large majority of the clicks — the rest
            split what&apos;s left. Featured jumps you to the top of {rank.city} on Windshield Repair
            HQ.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            {featuredCta}
            <a
              href={AGMP_AUDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              Or run my free 60-second audit <ArrowRight width={15} height={15} />
            </a>
          </div>
        </div>
      )}

      {!rank && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {featuredCta}
          <a
            href={AGMP_AUDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Run my free 60-second audit <ArrowRight width={15} height={15} />
          </a>
        </div>
      )}

      {intent === 'featured' && !checkout && (
        <p className="mt-4 text-xs text-gray-500">
          Online checkout is being set up — text {AGMP_PHONE_DISPLAY} and we&apos;ll get you Featured
          right away.
        </p>
      )}
    </div>
  )
}
