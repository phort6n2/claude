'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Link2, Loader2, XCircle } from 'lucide-react'

/**
 * Meta (Facebook / Instagram) for one shop: the Pixel, the Conversions API,
 * the ?v=meta landing page, and California privacy choices.
 *
 * Saves through /api/clients/[id]/meta-tracking, never the Google route, so a
 * save here cannot touch a Google conversion. The Conversions API token goes
 * one way: typed in, encrypted on the server, shown back only masked. The box
 * is cleared after a save, and an empty box on a later save leaves the stored
 * token alone.
 */

interface MetaState {
  metaPixelId: string
  hasToken: boolean
  tokenUnreadable: boolean
  tokenMasked: string | null
  metaTestEventCode: string
  metaVariantOffer: string
  metaVariantExcludedServices: string[]
  privacyChoices: boolean
}

interface RecentEvent {
  eventName: string
  eventId: string
  status: string
  attempts: number
  lastError: string | null
  testEventCode: string | null
  createdAt: string
}

export function MetaPanel({
  clientId,
  siteLink,
  onConfiguredChange,
}: {
  clientId: string
  /** The site's address, for the variant URL shown to the operator. */
  siteLink: string
  onConfiguredChange?: (live: boolean) => void
}) {
  const [meta, setMeta] = useState<MetaState | null>(null)
  const [services, setServices] = useState<string[]>([])
  const [recent, setRecent] = useState<RecentEvent[]>([])
  const [pixel, setPixel] = useState('')
  const [token, setToken] = useState('')
  const [testCode, setTestCode] = useState('')
  const [offer, setOffer] = useState('')
  const [excluded, setExcluded] = useState<string[]>([])
  const [privacy, setPrivacy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [testLink, setTestLink] = useState<string | null>(null)

  const apply = useCallback(
    (m: MetaState) => {
      setMeta(m)
      setPixel(m.metaPixelId)
      setTestCode(m.metaTestEventCode)
      setOffer(m.metaVariantOffer)
      setExcluded(m.metaVariantExcludedServices)
      setPrivacy(m.privacyChoices)
      onConfiguredChange?.(!!m.metaPixelId)
    },
    [onConfiguredChange]
  )

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/meta-tracking`)).json()
      if (data.meta) apply(data.meta)
      setServices(data.services || [])
      setRecent(data.recent || [])
    } catch {
      setMessage({ ok: false, text: 'Could not load the Meta settings.' })
    }
  }, [clientId, apply])

  useEffect(() => {
    load()
  }, [load])

  async function save(extra: Record<string, unknown> = {}) {
    setSaving(true)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        metaPixelId: pixel,
        metaTestEventCode: testCode,
        metaVariantOffer: offer,
        metaVariantExcludedServices: excluded,
        privacyChoices: privacy,
        ...extra,
      }
      if (token.trim()) body.metaCapiToken = token.trim()
      const res = await fetch(`/api/clients/${clientId}/meta-tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setToken('')
      apply(data.meta)
      setMessage({ ok: true, text: 'Saved. The site picks it up on the next page load.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSaving(false)
    }
  }

  async function mintTestLink() {
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-tracking`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not make a link')
      setTestLink(data.url)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    }
  }

  if (!meta) {
    return (
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </div>
    )
  }

  const variantUrl = `${siteLink.replace(/\/$/, '')}/?v=meta`
  const privacyForced = !!pixel.trim()

  return (
    <div className="space-y-5 text-sm">
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-200">
        <div className="flex items-start gap-2 p-3">
          {meta.metaPixelId ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <XCircle size={16} className="mt-0.5 shrink-0 text-gray-300" />
          )}
          <div>
            <div className="font-medium text-gray-900">Meta Pixel</div>
            <div className="text-gray-600">
              {meta.metaPixelId
                ? `${meta.metaPixelId} — PageView on every page, Lead on a quote, Contact on a call tap.`
                : 'Not set. No Meta script loads on the site.'}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3">
          {meta.hasToken && !meta.tokenUnreadable ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <XCircle size={16} className={`mt-0.5 shrink-0 ${meta.tokenUnreadable ? 'text-red-500' : 'text-gray-300'}`} />
          )}
          <div>
            <div className="font-medium text-gray-900">Conversions API</div>
            <div className="text-gray-600">
              {meta.tokenUnreadable
                ? 'A token is stored but cannot be decrypted (the server key changed). Paste it again.'
                : meta.hasToken
                  ? `Token ${meta.tokenMasked} — every quote is also sent server-side with the same event id, so Meta keeps one.`
                  : 'No token. Leads are reported by the browser Pixel only.'}
            </div>
          </div>
        </div>
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2" open={!meta.metaPixelId}>
        <summary className="cursor-pointer font-medium text-gray-800">How to set it up in Meta</summary>
        <div className="mt-2 space-y-2 text-gray-700">
          <p className="font-medium text-gray-900">1. The Pixel and the token</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>
              Events Manager → <strong>Connect data</strong> → Web → create a dataset (Pixel) for this
              shop. Copy its ID into the box below. Nothing to install: this app loads it.
            </li>
            <li>
              In that dataset: <strong>Settings → Conversions API → Generate access token</strong>. Paste it
              below. It is stored encrypted and never reaches the browser.
            </li>
          </ol>
          <p className="font-medium text-gray-900">2. The events — nothing to create</p>
          <p>
            Meta&apos;s standard events arrive on their own once the Pixel is saved:{' '}
            <strong>Lead</strong> for a quote form (sent from the browser and the server with one event id,
            so Meta keeps one) and <strong>Contact</strong> for a tap on a call link. Optimise lead
            campaigns for <strong>Lead</strong>. Contact is kept separate on purpose: Meta credits
            view-through, so a call tap from somebody who once scrolled past an ad would otherwise inflate
            the number Meta bids on.
          </p>
          <p className="font-medium text-gray-900">3. Calls</p>
          <p>
            Meta has no forwarding numbers and cannot hear a phone call. Buy a{' '}
            <strong>Meta tracking number</strong> (Lead delivery → Call tracking → &ldquo;Show instead to:
            Meta Ads visitors&rdquo;): visitors from a Meta ad see it on every page, and every call or text
            to it lands here as a Meta lead, recorded and scored. Use the same number on any Call-button
            ad.
          </p>
          <p className="font-medium text-gray-900">4. The ad</p>
          <p>
            Website URL: the Meta landing page below. URL parameters:{' '}
            <code className="font-mono text-xs break-all">
              utm_source={'{{site_source_name}}'}&amp;utm_medium=paid&amp;utm_campaign={'{{campaign.name}}'}&amp;utm_content={'{{ad.name}}'}&amp;utm_term={'{{adset.name}}'}
            </code>{' '}
            — <code className="font-mono text-xs">utm_medium=paid</code> is what tells a Meta ad visitor
            apart from somebody clicking an ordinary post.
          </p>
        </div>
      </details>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Pixel ID or base code</span>
          <textarea
            value={pixel}
            onChange={(e) => setPixel(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder="123456789012345 — or paste the whole Pixel base code"
            className="w-full px-3 py-2 border rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500"
          />
          <span className="block text-xs text-gray-500 mt-1">Events Manager → Data sources → your Pixel.</span>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">
            Conversions API access token {meta.hasToken && <span className="font-normal text-gray-400">(stored)</span>}
          </span>
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={meta.hasToken ? 'Leave empty to keep the stored token' : 'Paste the token'}
            className="w-full px-3 py-2 border rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500"
          />
          <span className="block text-xs text-gray-500 mt-1">
            Events Manager → your Pixel → Settings → Conversions API → Generate access token. Stored
            encrypted; never sent to the browser.
            {meta.hasToken && (
              <>
                {' '}
                <button type="button" className="underline text-red-600" onClick={() => save({ clearToken: true })}>
                  Remove token
                </button>
              </>
            )}
          </span>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">
            Test Events code <span className="font-normal text-gray-400">(only while testing)</span>
          </span>
          <input
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            placeholder="TEST12345"
            className="w-full px-3 py-2 border rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500"
          />
          <span className="block text-xs text-amber-700 mt-1">
            While set, server events go to Events Manager → Test Events instead of the live data. Clear it
            when you are done.
          </span>
        </label>
        <div>
          <span className="block font-medium text-gray-700 mb-1">California privacy choices</span>
          <label className="flex items-start gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={privacy || privacyForced}
              disabled={privacyForced}
              onChange={(e) => setPrivacy(e.target.checked)}
              className="mt-1"
            />
            <span>
              Honor Global Privacy Control and show &ldquo;Your Privacy Choices&rdquo; in the footer
              <span className="block text-xs text-gray-500">
                An opted-out visitor gets no Meta Pixel, no Microsoft UET, no Conversions API event, and
                Google in restricted data processing. The privacy policy lists each tag the site runs.
                {privacyForced && ' Always on while a Meta Pixel is set.'}
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <div>
          <div className="font-medium text-gray-900">Meta landing page</div>
          <p className="text-gray-600">
            A shorter version of the same site for Meta ads: headline, the quote form, a big call button,
            three reviews, the service area. Same content, same lead flow, not indexed by search engines.
            It works on any page — add <code className="font-mono">?v=meta</code> to a service page to use
            that service.
          </p>
          <p className="mt-1">
            <a href={variantUrl} target="_blank" rel="noopener" className="font-mono text-blue-700 underline">
              {variantUrl}
            </a>
          </p>
        </div>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">
            Offer line <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            maxLength={140}
            placeholder="Leave empty — only an offer this shop actually makes"
            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
          />
          <span className="block text-xs text-gray-500 mt-1">
            Shown under the headline. Never a timing promise or a deductible offer.
          </span>
        </label>
        <div>
          <span className="block font-medium text-gray-700 mb-1">Leave off the Meta home page</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {services.map((name) => (
              <label key={name} className="flex items-center gap-1.5 text-gray-700">
                <input
                  type="checkbox"
                  checked={excluded.includes(name)}
                  onChange={(e) =>
                    setExcluded((prev) => (e.target.checked ? [...prev, name] : prev.filter((s) => s !== name)))
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <span className="block text-xs text-gray-500 mt-1">
            Removed from the variant&apos;s copy and its form options. A service page with ?v=meta still
            offers its own service.
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save Meta settings
        </button>
        <button
          type="button"
          onClick={mintTestLink}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50"
        >
          <Link2 size={14} /> Make a dry-run link
        </button>
        {message && <span className={message.ok ? 'text-green-700' : 'text-red-600'}>{message.text}</span>}
      </div>
      {testLink && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <p className="m-0">
            For the next two hours, a quote submitted from this link is checked and answered but{' '}
            <strong>not stored, alerted or forwarded</strong>, and no Google or Microsoft conversion fires.
            The Meta event goes to Test Events only, and only while a Test Events code is set. Add{' '}
            <code className="font-mono">&amp;v=meta</code>, <code className="font-mono">&amp;fbclid=test</code>{' '}
            or <code className="font-mono">&amp;msclkid=test</code> to try a source.
          </p>
          <p className="mt-1 mb-0 break-all font-mono text-xs">{testLink}</p>
        </div>
      )}

      {recent.length > 0 && (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-200">
          <div className="px-3 py-2 text-xs text-gray-500">Last server events sent to Meta</div>
          {recent.map((e) => (
            <div key={`${e.eventId}-${e.eventName}`} className="px-3 py-2 text-xs flex flex-wrap gap-x-3">
              <span className="font-medium">{e.eventName}</span>
              <span className={e.status === 'SUCCESS' ? 'text-green-700' : e.status === 'FAILED' ? 'text-red-600' : 'text-gray-500'}>
                {e.status === 'SUCCESS' ? 'received' : e.status.toLowerCase()}
                {e.attempts > 1 ? ` after ${e.attempts} tries` : ''}
              </span>
              {e.testEventCode && <span className="text-amber-700">test</span>}
              <span className="text-gray-500">{new Date(e.createdAt).toLocaleString()}</span>
              {e.lastError && <span className="text-red-600 w-full">{e.lastError}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The UET call-tap action, on the Microsoft panel. Its own small save,
 * through the Meta route, so it cannot disturb the Google snippets that the
 * Microsoft panel's main Save rebuilds.
 */
export function UetCallActionField({ clientId, enabled }: { clientId: string; enabled: boolean }) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/clients/${clientId}/meta-tracking`)
      .then((r) => r.json())
      .then((d) => {
        const v = d?.meta?.bingCallEventAction || ''
        setValue(v)
        setSaved(v)
      })
      .catch(() => {})
  }, [clientId])

  async function commit() {
    if (value.trim() === saved) return
    setStatus('Saving…')
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bingCallEventAction: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')
      setSaved(value.trim())
      setStatus(value.trim() ? 'Saved — call taps now fire this event.' : 'Saved — no call event.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Call tap event action <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <input
        type="text"
        value={value}
        disabled={!enabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="click_to_call"
        className="w-full px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
      />
      <p className="text-xs text-gray-500 mt-1">
        {enabled
          ? 'Create a goal in Microsoft with this Action, then type it here. Empty = no call event. Saves on its own.'
          : 'Save a UET tag first.'}
        {status && <span className="block text-gray-700">{status}</span>}
      </p>
    </div>
  )
}
