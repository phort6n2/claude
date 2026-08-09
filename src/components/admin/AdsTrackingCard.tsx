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
  bingUetTagId: string
  bingLeadEventAction: string
}

/** The action name pushed to Microsoft when none is configured. */
const DEFAULT_BING_ACTION = 'submit_lead_form'

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

export default function AdsTrackingCard({
  clientId,
  clientPhone,
}: {
  clientId: string
  /** Shown in the calls instructions so the number to enter is unambiguous. */
  clientPhone?: string
}) {
  const [current, setCurrent] = useState<Parsed | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [leadSnippet, setLeadSnippet] = useState('')
  const [callSnippet, setCallSnippet] = useState('')
  const [enhanced, setEnhanced] = useState(true)
  const [bingTagId, setBingTagId] = useState('')
  const [bingAction, setBingAction] = useState('')
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
          setBingTagId(data.tracking.bingUetTagId || '')
          setBingAction(data.tracking.bingLeadEventAction || '')
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
        body: JSON.stringify({
          leadSnippet,
          callSnippet,
          enhancedConversions: enhanced,
          bingUetTagId: bingTagId,
          bingLeadEventAction: bingAction,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setCurrent({ ...(data.parsed || {}), enhancedConversions: enhanced })
      if (data.parsed?.bingLeadEventAction) setBingAction(data.parsed.bingLeadEventAction)
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
  const bingLive = !!current?.bingUetTagId

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

      {/* ---- Recommended: calls from ads ---- */}
      <Steps title="Recommended: also turn on “Calls from ads” (no tag needed)">
        <p>
          This one is separate from everything above and needs nothing installed — Google reports
          it itself. It counts calls placed straight from the ad, before anyone reaches the site,
          which is a large share of the calls this trade gets on mobile.
        </p>
        <ol className="list-decimal ml-5 space-y-1.5">
          <li>
            In the campaign, add a <strong>Call asset</strong> (Assets → Calls) with the main
            number{clientPhone ? <> — <code className="font-mono text-xs">{clientPhone}</code></> : null}.
          </li>
          <li>
            Turn on <strong>call reporting</strong> on the asset. Google then shows a forwarding
            number in the ad and can measure the call.
          </li>
          <li>
            Goals → Conversions → <strong>+ New conversion action</strong> →{' '}
            <strong>Phone calls</strong> → <strong>Calls from ads</strong>.
          </li>
          <li>Set the minimum call length that counts — 60 seconds pairs well with the website one.</li>
          <li>
            Create it. There is no snippet and nothing to paste here: the ad does the reporting.
          </li>
        </ol>
        <p className="rounded border border-gray-300 bg-white p-2">
          Worth knowing: the number on a call asset must appear on the website too, and Google
          verifies that by looking for it. Keep it visible and unswapped — which is exactly why
          the site&apos;s footer prints one plain, un-rewritten copy of the main number.
        </p>
      </Steps>

      {/* ---- Microsoft Advertising ---- */}
      <div className="space-y-2 border-t border-gray-200 pt-5">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900">Microsoft Advertising (Bing)</h3>
          {bingLive && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
              Live
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Microsoft installs one tag per advertiser (UET) and then counts conversions as{' '}
          <em>event goals</em> matched by action name. Two fields, and the order matters: create
          the tag, then the goal.
        </p>
        <Steps title="How to set it up in Microsoft Advertising" defaultOpen={!bingLive}>
          <p className="font-medium text-gray-900">1. Create the UET tag</p>
          <ol className="list-decimal ml-5 space-y-1.5">
            <li>
              In Microsoft Advertising, hover <strong>Conversions</strong> in the left menu and
              select <strong>UET tag</strong>.
            </li>
            <li>
              <strong>Create</strong>, name it (the client&apos;s business name is fine), and set{' '}
              <strong>Industry</strong> to <strong>Autos</strong>.
            </li>
            <li>
              <strong>Save</strong>. In <em>View UET tag tracking code</em>, copy the code — or
              just the tag ID, which is the 8–9 digit number in it.
            </li>
            <li>Paste either one below. There is no need to install it anywhere: this app does that.</li>
          </ol>
          <p className="font-medium text-gray-900 mt-3">2. Create the conversion goal</p>
          <ol className="list-decimal ml-5 space-y-1.5">
            <li>
              <strong>Conversions → Conversion goals → Create</strong>.
            </li>
            <li>
              Kind: <strong>Website</strong>. Category: <strong>Submit lead form</strong>. Goal
              type: <strong>Event</strong>.
            </li>
            <li>
              Turn on <strong>Enhanced conversions</strong> while you are in this screen if you
              want the improved matching — it can only be enabled here, not later from the tag.
            </li>
            <li>
              In the event details, set <strong>Action</strong> to exactly{' '}
              <code className="font-mono text-xs">{bingAction.trim() || DEFAULT_BING_ACTION}</code>
              . Leave Category, Label and Value empty. This has to match character for character —
              Microsoft matches the goal to the event by string, so a stray capital means the goal
              never fires.
            </li>
            <li>Set the goal to count <strong>one</strong> conversion per interaction, then save.</li>
          </ol>
          <p className="rounded border border-gray-300 bg-white p-2 mt-2">
            Microsoft has no equivalent of Google&apos;s &ldquo;calls from a website&rdquo; number
            swap. To measure calls on Bing, add a <strong>Call extension</strong> to the campaign
            with call reporting on — the same idea as Google&apos;s calls-from-ads, reported by
            Microsoft with nothing to install.
          </p>
        </Steps>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              UET tag ID or tracking code
            </label>
            <textarea
              value={bingTagId}
              onChange={(e) => setBingTagId(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="12345678 — or paste the whole UET tracking code"
              className="w-full px-3 py-2 border rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Event action name
            </label>
            <input
              type="text"
              value={bingAction}
              onChange={(e) => setBingAction(e.target.value)}
              placeholder={DEFAULT_BING_ACTION}
              className="w-full px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Must match the goal&apos;s Action exactly. Leave blank to use{' '}
              <code className="font-mono">{DEFAULT_BING_ACTION}</code>.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
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
