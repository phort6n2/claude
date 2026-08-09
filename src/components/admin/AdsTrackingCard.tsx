'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, TriangleAlert } from 'lucide-react'

/**
 * Google Ads conversion tracking for one client's hosted site.
 *
 * The operator pastes the snippets Google Ads gives them and the app pulls
 * the conversion out. Asking for an "ID" and a "label" separately means
 * asking someone to split AW-123456789/AbC-D_efG at the slash and know which
 * half goes where — a step that adds nothing and gets transposed.
 *
 * Nothing is emitted until something is saved here: a site with no Ads
 * account loads no third-party script.
 */

interface Parsed {
  conversionId: string
  leadConversionLabel: string
  leadValue: number | null
  leadCurrency: string
  callConversionLabel: string
  callPhoneNumber: string
  enhancedConversions: boolean
}

function Steps({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-800 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {title}
      </button>
      {open && <div className="px-4 pb-3 pt-1 text-sm text-gray-700 space-y-2">{children}</div>}
    </div>
  )
}

export default function AdsTrackingCard({ clientId }: { clientId: string }) {
  const [current, setCurrent] = useState<Parsed | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [leadSnippet, setLeadSnippet] = useState('')
  const [callSnippet, setCallSnippet] = useState('')
  const [enhanced, setEnhanced] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/ads-tracking`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.unavailable) setUnavailable(true)
        if (data.tracking) {
          setCurrent(data.tracking)
          setEnhanced(data.tracking.enhancedConversions)
        }
        setLoading(false)
      })
      .catch(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId])

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/ads-tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadSnippet, callSnippet, enhancedConversions: enhanced }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setCurrent({ ...(data.parsed || {}), enhancedConversions: enhanced })
      setLeadSnippet('')
      setCallSnippet('')
      setMessage({ ok: true, text: 'Saved. The tag updates on the site within about 5 minutes.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading tracking…
      </div>
    )
  }

  const leadLive = !!current?.leadConversionLabel
  const callLive = !!current?.callConversionLabel && !!current?.callPhoneNumber

  return (
    <div className="p-6 pt-4 space-y-5">
      {unavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            The tracking table doesn&apos;t exist in this database yet, so nothing can be saved.
            Run <code className="font-mono">docs/db-setup-ads-tracking.sql</code> first.
          </span>
        </div>
      )}

      {/* Current state, in plain terms. */}
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-200 text-sm">
        <div className="flex items-start gap-2 p-3">
          {leadLive ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <span className="mt-1.5 ml-1 mr-1 h-2 w-2 rounded-full bg-gray-300 shrink-0" />
          )}
          <div>
            <div className="font-medium text-gray-900">Form leads</div>
            <div className="text-gray-600">
              {leadLive ? (
                <>
                  Reporting to {current?.conversionId}/{current?.leadConversionLabel}
                  {current?.leadValue != null && (
                    <> · value {current.leadValue} {current.leadCurrency}</>
                  )}
                </>
              ) : (
                'Not reporting. Every quote-form submission is currently invisible to Google Ads.'
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 p-3">
          {callLive ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
          ) : (
            <span className="mt-1.5 ml-1 mr-1 h-2 w-2 rounded-full bg-gray-300 shrink-0" />
          )}
          <div>
            <div className="font-medium text-gray-900">Calls from the website</div>
            <div className="text-gray-600">
              {callLive
                ? `Google is swapping ${current?.callPhoneNumber} on the site and counting the calls.`
                : 'Not reporting from this site. Correct if HighLevel is tracking calls instead.'}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Form leads ---- */}
      <div className="space-y-2">
        <h3 className="font-medium text-gray-900">Form lead conversion</h3>
        <Steps title="How to create it in Google Ads" defaultOpen={!leadLive}>
          <ol className="list-decimal ml-5 space-y-1.5">
            <li>
              Google Ads → <strong>Goals → Conversions → Summary</strong> → <strong>+ New
              conversion action</strong>.
            </li>
            <li>
              Choose <strong>Website</strong>. Enter the site&apos;s domain and scan, or pick{' '}
              <strong>+ Add a conversion action manually</strong> — either is fine, the tag is
              installed by this app, not by the scan.
            </li>
            <li>
              Goal category: <strong>Submit lead form</strong>. Name it something you&apos;ll
              recognise later, e.g. &ldquo;Quote form — landing page&rdquo;.
            </li>
            <li>
              Value: enter your average job value if you know it, otherwise{' '}
              <strong>Don&apos;t use a value</strong>. If you set one, it is picked up
              automatically from the snippet.
            </li>
            <li>
              Count: <strong>One</strong>. A lead is one lead — &ldquo;Every&rdquo; is for
              ecommerce.
            </li>
            <li>Click-through conversion window 30 days, attribution data-driven, is a sane default.</li>
            <li>
              <strong>Create and continue</strong> → <strong>Install the tag yourself</strong>.
            </li>
            <li>
              You&apos;ll see two blocks. Ignore the <strong>Google tag</strong> (the site-wide
              loader) — this app installs that itself. Copy the <strong>event snippet</strong>,
              the one containing <code className="font-mono text-xs">send_to</code>.
            </li>
            <li>
              Where it asks when the event should fire, choose <strong>Page load</strong>, not
              click. The quote form is inside a shadow DOM that Google cannot see into, so this
              app reports the conversion explicitly the moment the form succeeds.
            </li>
            <li>Paste the whole block below and save. The angle brackets and script tags are fine.</li>
          </ol>
        </Steps>
        <textarea
          value={leadSnippet}
          onChange={(e) => setLeadSnippet(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={"<!-- Event snippet -->\n<script>\n  gtag('event', 'conversion', {'send_to': 'AW-123456789/AbC-D_efGh', 'value': 1.0, 'currency': 'USD'});\n</script>"}
          className="w-full px-3 py-2 border rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* ---- Calls ---- */}
      <div className="space-y-2">
        <h3 className="font-medium text-gray-900">
          Calls from the website <span className="font-normal text-gray-400">— optional</span>
        </h3>
        <Steps title="How to create it in Google Ads">
          <ol className="list-decimal ml-5 space-y-1.5">
            <li>
              Google Ads → <strong>Goals → Conversions → Summary</strong> → <strong>+ New
              conversion action</strong> → <strong>Phone calls</strong>.
            </li>
            <li>
              Choose <strong>Calls from a website</strong> (not &ldquo;Calls from ads&rdquo;,
              which needs no tag, and not &ldquo;Clicks on your number&rdquo;, which counts taps
              rather than calls).
            </li>
            <li>
              Enter the phone number <strong>exactly as it appears on the site</strong> — the main
              number shown in the header. If the digits or formatting differ, Google won&apos;t
              find it on the page and nothing will be swapped or counted.
            </li>
            <li>
              Call length to count as a conversion: 60 seconds is a reasonable floor for this
              trade — long enough to exclude misdials, short enough to keep real enquiries.
            </li>
            <li>
              <strong>Create and continue</strong> → <strong>Install the tag yourself</strong>, and
              copy the snippet containing{' '}
              <code className="font-mono text-xs">phone_conversion_number</code>.
            </li>
            <li>Paste it below and save.</li>
          </ol>
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
            <strong>Before you turn this on:</strong> Google works by replacing the number on the
            page with a forwarding number. Don&apos;t run it on a number that HighLevel&apos;s
            Number Pool is also swapping — two systems rewriting one number is a broken phone
            number on the page, not just double-counted data. And a number used as a Google call
            asset has to stay visible and unswapped, or asset verification fails.
          </p>
        </Steps>
        <textarea
          value={callSnippet}
          onChange={(e) => setCallSnippet(e.target.value)}
          rows={3}
          spellCheck={false}
          placeholder={"<script>\n  gtag('config', 'AW-123456789/AbC-D_efGh', {'phone_conversion_number': '(503) 656-3500'});\n</script>"}
          className="w-full px-3 py-2 border rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={enhanced}
          onChange={(e) => setEnhanced(e.target.checked)}
          className="mt-1"
        />
        <span>
          Enhanced conversions
          <span className="block text-xs text-gray-500">
            Sends the lead&apos;s email and phone with the conversion so Google can match it back
            to the click, which recovers conversions that would otherwise go unattributed. Google
            hashes both inside the tag — nothing identifiable is stored here or sent in the clear.
            Turn it on in the Ads account too: Goals → Settings → Enhanced conversions for leads,
            and accept the customer-data terms.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || (!leadSnippet.trim() && !callSnippet.trim() && !current)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save tracking
        </button>
        <span className="text-xs text-gray-500">
          Saving replaces what&apos;s configured. Leave a box empty to clear that conversion.
        </span>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}
