import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyNewLead } from '@/lib/push-notifications'
import { kickOffCallAnalysis } from '@/lib/call-analysis/queue'
import {
  findSameDayDuplicateCanonical,
  earliestSameDayContact,
  mergeAttributionIntoCanonical,
} from '@/lib/lead-dedup'
import { createDeliveriesForLead, attemptDelivery } from '@/lib/webhook-forwarding'
// Aliased: push-notifications already exports a notifyNewLead (admin web push).
import { notifyNewLead as notifyLeadRecipients } from '@/lib/lead-notifications'
import { decideOrigin, requestHost } from '@/lib/lead-origin-policy'
import { outcomeUrlFor } from '@/lib/lead-outcome-token'
import { decodeVin, calibrationLabel } from '@/lib/vin-decode'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Who is allowed to post here from a browser, and why the rule is what it is,
 * lives in lead-origin-policy.ts. The short version: pages this app served,
 * plus whatever the admin has explicitly opted in per client.
 *
 * The mechanics on this side are CORS. A landing page submits with a
 * client-side fetch; `Content-Type: application/json` is not a CORS-simple
 * content type, so the browser preflights and refuses to deliver the POST
 * unless the preflight and the response both carry matching headers. That
 * makes the header set and the accept/reject decision the same decision, so
 * they are taken together.
 */
function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  if (!origin || !allowed) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    // The response differs per origin, so it must not be cached under one key.
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * A damage photo URL, but only if we stored it.
 *
 * The alert email renders this as an image. The lead payload is attacker
 * controllable — anyone allowed to post a lead controls every field in it —
 * so an unchecked URL here is a way to put a chosen image, or a tracking
 * pixel, straight into a shop owner's inbox. Only Vercel Blob URLs under our
 * own damage prefix are accepted; anything else is dropped silently, because
 * the lead itself is still worth keeping.
 */
function ourBlobUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return undefined
    if (!url.pathname.startsWith('/damage/')) return undefined

    // Every Vercel Blob store answers on *.blob.vercel-storage.com, so the
    // suffix alone would also accept somebody else's store — enough for
    // whoever posted the lead to choose the image that lands in a shop's
    // inbox. BLOB_STORE_HOST pins it to ours. Without it set, fall back to
    // the suffix rather than dropping every photo: the narrow version of this
    // is still far better than rendering arbitrary URLs, and a missing env
    // var should not silently break the feature.
    const pinned = process.env.BLOB_STORE_HOST
    if (pinned) return url.hostname === pinned ? url.toString() : undefined
    if (!url.hostname.endsWith('.blob.vercel-storage.com')) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

/** CORS preflight. Unknown origins get no headers, so the browser blocks. */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  const clientSlug = new URL(request.url).searchParams.get('client')
  const decision = await decideOrigin(origin, requestHost(request.headers), clientSlug)
  const headers = corsHeaders(origin, decision.allowed)
  return new NextResponse(null, {
    status: decision.allowed ? 204 : 403,
    headers,
  })
}

/**
 * HighLevel Webhook for Lead Capture
 *
 * URL Format: /api/webhooks/highlevel/lead?client=CLIENT_SLUG&key=SECRET_KEY
 *
 * HighLevel sends form submission data in the request body.
 * We extract contact info, GCLID, UTM params, and create a Lead record.
 *
 * Landing pages may also post here directly from the browser, sending the same
 * flat JSON payload — every field is read from the payload root before any
 * HighLevel-specific nesting is consulted, so the two paths converge.
 */
/**
 * A payload field as TEXT, or nothing.
 *
 * `String(value)` on an object returns the literal "[object Object]", and
 * that is what a shop owner saw in a real lead alert: "Notes: [object
 * Object]". HighLevel sends `notes` as a structured object on call-generated
 * contacts, and any of these fields can arrive that way — so the coercion is
 * shared rather than patched at the one field that was caught. Anything that
 * is not already text becomes empty, and an empty field is simply left out of
 * the alert.
 */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const clientSlug = new URL(request.url).searchParams.get('client')
  const decision = await decideOrigin(origin, requestHost(request.headers), clientSlug)

  // Refused before the lead is written, not just left without CORS headers.
  // Missing headers only make the browser hide the response — the lead would
  // still land, still alert the shop, still be forwarded. The point of the
  // rule is that it does not land at all.
  if (!decision.allowed) {
    console.warn(
      `[HighLevel Webhook] Rejected lead from ${origin} for client=${clientSlug ?? 'none'} — not a page this app served, and not in that client's allowed origins`
    )
    return NextResponse.json(
      {
        error: 'This site is not authorised to submit leads for this client.',
        origin,
      },
      { status: 403 }
    )
  }

  const response = await handleLeadPost(request)
  // Attach CORS headers to whatever the handler returned. Without them a
  // browser-initiated POST succeeds server-side but the fetch() still rejects,
  // which would look to the page like a failed submission.
  for (const [key, value] of Object.entries(corsHeaders(origin, true))) {
    response.headers.set(key, value)
  }
  return response
}

async function handleLeadPost(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get('client')

    // Validate client parameter
    if (!clientSlug) {
      console.error('[HighLevel Webhook] Missing client parameter')
      return NextResponse.json(
        { error: 'Missing client parameter' },
        { status: 400 }
      )
    }

    // No secret check. The `key` query parameter is still accepted so existing
    // HighLevel webhook URLs keep working, but it is not verified against
    // anything.
    //
    // This is deliberate rather than an oversight. The check had been
    // soft-warn-only for a long time — it logged a mismatch and let the
    // request through regardless — so the endpoint was already effectively
    // open, while every legitimate delivery wrote a scary warning to the logs.
    // Removing it makes the actual posture honest instead of implied.
    //
    // The consequence: anyone who knows a client slug can post a lead into
    // that client's account. That is tolerable while the URL is only known to
    // HighLevel. It stops being tolerable the moment a public landing page
    // posts here directly, because the URL then appears in page source — at
    // that point this needs a real gate (origin allowlist + rate limiting),
    // not a shared secret, since a browser can't hold one.

    // Find the client
    const client = await prisma.client.findUnique({
      where: { slug: clientSlug },
      select: { id: true, businessName: true, callCoachingEnabled: true, timezone: true },
    })

    if (!client) {
      console.error(`[HighLevel Webhook] Client not found: ${clientSlug}`)
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    // Parse the payload.
    //
    // JSON from HighLevel and from the widget's fetch; FORM-ENCODED from the
    // server-rendered quote form, which is a plain <form method="post"> and
    // therefore the only path that still works with JavaScript off. It goes
    // through THIS handler rather than a route of its own on purpose: dedup,
    // attribution, alerting and forwarding all live here, and a parallel
    // intake is a second copy of that behaviour waiting to drift from this one.
    const isFormPost = (request.headers.get('content-type') || '').includes(
      'application/x-www-form-urlencoded'
    )
    // `any`, because that is what request.json() already returned here and the
    // seven hundred lines below were written against it. Tightening it is a
    // separate job from making the form work without JavaScript.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: Record<string, any>
    if (isFormPost) {
      const form = await request.formData()
      payload = Object.fromEntries(
        [...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : ''])
      )
    } else {
      payload = await request.json()
    }

    /**
     * Where the browser lands after a plain form post.
     *
     * The scheme and the PORT both come from the request. Rebuilding the URL
     * as `https://` + a port-stripped host was wrong twice over: it cannot be
     * followed on a non-https host, and `requestHost()` drops the port on
     * purpose (it exists to compare origins), so the redirect pointed at the
     * wrong place anywhere the app is not on 443.
     *
     * 303 rather than 302 so the follow-up is a GET — a refresh on the
     * confirmation page must not post the lead a second time.
     *
     * `return_to` is honoured only when it is on the host that served the
     * form. Anything else is an open redirect on fifteen live sites.
     */
    const formRedirect = (ok: boolean) => {
      const headers = request.headers
      const proto =
        headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
        new URL(request.url).protocol.replace(':', '') ||
        'https'
      const host = (headers.get('x-forwarded-host') || headers.get('host') || '')
        .split(',')[0]
        .trim()
      const base = `${proto}://${host}`

      /* The same HTML serves a shop's own host AND /sites/{slug} on the app
         host — middleware rewrites, so the page cannot know which one the
         visitor is looking at, and a path baked in at render is wrong for one
         of them. The Referer a form post carries says which, and it is the
         only thing that can: without JavaScript there is nothing to put in a
         hidden field. Falls back to the bare path, which is right on a shop's
         own host — the case that matters. */
      let prefix = ''
      try {
        const referer = headers.get('referer')
        if (referer) {
          const from = new URL(referer)
          const match = from.pathname.match(/^\/sites\/[^/]+/)
          if (from.host === host && match) prefix = match[0]
        }
      } catch {
        /* no usable referer — the bare path is the safe answer */
      }

      return NextResponse.redirect(`${base}${prefix}/quote-sent${ok ? '' : '?problem=1'}`, 303)
    }

    // Honeypot: the embeddable widget includes a visually-hidden field that
    // only bots fill in (sent as `_hp`). Answer with success so the bot moves
    // on, but store nothing.
    if (typeof payload._hp === 'string' && payload._hp.trim() !== '') {
      console.warn(`[HighLevel Webhook] Honeypot tripped for ${client.businessName} — dropping submission`)
      return isFormPost
        ? formRedirect(true)
        : NextResponse.json({ success: true, message: 'Lead captured successfully' })
    }

    console.log(`[HighLevel Webhook] Received for ${client.businessName}:`, JSON.stringify(payload, null, 2))

    // HighLevel sends data at root level with underscores:
    // first_name, last_name, full_name, email, phone, gclid, contact_source, etc.
    // Location data in location object, campaign in campaign object, etc.

    // Get contact details - fields are at root level with underscores
    const email = payload.email || null
    const phone = payload.phone || null
    const firstName = payload.first_name || null
    const lastName = payload.last_name || null
    const fullName = payload.full_name || null

    // Use full_name to parse first/last if not provided separately
    let finalFirstName = firstName
    let finalLastName = lastName
    if (!firstName && !lastName && fullName) {
      const nameParts = fullName.trim().split(' ')
      finalFirstName = nameParts[0] || null
      finalLastName = nameParts.slice(1).join(' ') || null
    }

    // GCLID can be in multiple locations depending on HighLevel setup
    // Check: root level, contact object, attributionSource, customFields, attribution
    const customFields = payload.customFields || payload.customData || payload.custom_fields || {}

    // Helper to get a custom field from any of the places HighLevel puts them.
    //
    // Lookup is normalised (lowercased, non-alphanumerics stripped) because the
    // field name is whatever the person building the HighLevel workflow typed.
    // The same value shows up as "GBRAID", "gbraid", "UTM Campaign",
    // "utm_campaign" or "Li Fat Id" depending on the account, and an exact
    // match silently dropped all but one spelling.
    const normaliseKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')

    const normalisedLookup = new Map<string, unknown>()
    for (const source of [customFields, payload]) {
      if (!source || typeof source !== 'object') continue
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        const norm = normaliseKey(key)
        // First non-empty value for a given normalised key wins.
        const existing = normalisedLookup.get(norm)
        if (existing === undefined || existing === null || existing === '') {
          normalisedLookup.set(norm, value)
        }
      }
    }

    // Filters out unresolved template strings like {{contact.field_name}}
    const usable = (value: unknown) => {
      if (value === undefined || value === null || value === '') return null
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return null
        if (trimmed.includes('{{') || trimmed.includes('}}')) return null // template not resolved
        return trimmed
      }
      return value
    }

    const getCustomField = (fieldName: string) =>
      usable(payload[fieldName]) ??
      usable(customFields[fieldName]) ??
      usable(normalisedLookup.get(normaliseKey(fieldName))) ??
      null

    // String-typed variants for the Lead columns, which are all text.
    const asText = (value: unknown): string | null => {
      const v = usable(value)
      return v === null || v === undefined ? null : String(v)
    }
    const getText = (fieldName: string): string | null => asText(getCustomField(fieldName))

    // GCLID can arrive at the root, nested in the contact/attribution objects,
    // or as a mapped custom field under any spelling. getCustomField covers the
    // root, customFields and the normalised names, so only the nested objects
    // need naming explicitly here.
    const gclid =
      getText('gclid') ??
      asText(payload.contact?.gclid) ??
      asText(payload.attributionSource?.gclid) ??
      asText(payload.contact?.attributionSource?.gclid) ??
      asText(payload.contact?.lastAttributionSource?.gclid) ??
      asText(payload.attribution?.gclid) ??
      null

    if (gclid) {
      console.log(`[HighLevel Webhook] GCLID found: ${gclid}`)
    } else {
      console.log(`[HighLevel Webhook] No GCLID found. Checked locations:`, {
        root: payload.gclid,
        contact: payload.contact?.gclid,
        attributionSource: payload.attributionSource?.gclid,
        contactAttributionSource: payload.contact?.attributionSource?.gclid,
        attribution: payload.attribution?.gclid,
        customFields: customFields.gclid,
      })
    }

    // Source information
    const contactSource = payload.contact_source || payload.source || null

    // Location data
    const location = payload.location || {}

    // Campaign data
    const campaign = payload.campaign || {}

    // Workflow data
    const workflow = payload.workflow || {}

    // Address info
    const address = payload.address1 || null
    const city = payload.city || location.city || null
    const state = payload.state || location.state || null
    const postalCode = payload.postal_code || location.postalCode || null


    // Build form data JSON (store all extra fields for reference)
    const formData: Record<string, unknown> = {
      full_name: fullName,
      company_name: payload.company_name,
      website: payload.website,
      address1: payload.address1,
      city: payload.city,
      state: payload.state,
      country: payload.country,
      postal_code: payload.postal_code,
      timezone: payload.timezone,
      contact_source: contactSource,
      contact_type: payload.contact_type,
      tags: payload.tags,
      date_of_birth: payload.date_of_birth,
      // Custom fields for auto glass - check multiple key formats HighLevel uses.
      // `service` / `vehicle` / `carrier` come from the collisionglass.co landing
      // page form, which sends a single combined vehicle string rather than
      // separate year/make/model fields.
      interested_in: getCustomField('interested_in') ||
                     getCustomField('Interested In:') ||
                     getCustomField('Interested In') ||
                     getCustomField('interested in') ||
                     getCustomField('service'),
      vehicle: getCustomField('vehicle') || getCustomField('Vehicle'),
      insurance_carrier: getCustomField('carrier') ||
                         getCustomField('insurance_carrier') ||
                         getCustomField('Carrier'),
      vehicle_year: getCustomField('vehicle_year') ||
                    getCustomField('Vehicle Year') ||
                    getCustomField('vehicleYear'),
      vehicle_make: getCustomField('vehicle_make') ||
                    getCustomField('Vehicle Make') ||
                    getCustomField('vehicleMake'),
      vehicle_model: getCustomField('vehicle_model') ||
                     getCustomField('Vehicle Model') ||
                     getCustomField('vehicleModel'),
      vin: getCustomField('vin') ||
           getCustomField('VIN') ||
           getCustomField('Vin'),
      // Validated on the way in for the same reason the alert validates it:
      // this ends up rendered as an image in the admin and the portal.
      damage_photo_url: ourBlobUrl(getCustomField('damage_photo_url')) || null,
      glass_type: getCustomField('glass_type') ||
                  getCustomField('What type of glass do you need help with?') ||
                  getCustomField('Glass Type'),
      work_description: getCustomField('work_description') ||
                        getCustomField('Description of Work Needed') ||
                        getCustomField('description'),
      insurance_help: getCustomField('insurance_help') ||
                      getCustomField('Would You Like Us To Help Navigate Your Insurance Claim For You?') ||
                      getCustomField('insurance'),
      radio_3s0t: getCustomField('radio_3s0t'),
      // Call details HighLevel sends on inbound-call contacts. Previously
      // dropped entirely, which left phone leads looking empty next to form
      // leads. Whether a call was answered or missed is the most actionable
      // thing on the record, so it's captured first.
      call_status:
        payload.call_status ||
        payload.callStatus ||
        payload.call?.status ||
        payload.status ||
        null,
      call_duration:
        payload.call_duration ||
        payload.callDuration ||
        payload.duration ||
        payload.call?.duration ||
        null,
      call_direction:
        payload.call_direction ||
        payload.callDirection ||
        payload.direction ||
        payload.call?.direction ||
        null,
      caller_number: payload.from || payload.caller_phone || payload.callerPhone || null,
      called_number: payload.to || payload.rep_phone || payload.repPhone || null,
      assigned_to:
        payload.assigned_to ||
        payload.assignedTo ||
        payload.user?.name ||
        payload.user?.email ||
        null,
      message: payload.message || payload.body || null,
      // Non-Google click identifiers. There are no dedicated Lead columns for
      // these, so keep them with the form data for attribution reference.
      msclkid: getCustomField('msclkid'),
      fbclid: getCustomField('fbclid'),
      ttclid: getCustomField('ttclid'),
      li_fat_id: getCustomField('li_fat_id'),
      gclsrc: getCustomField('gclsrc'),
    }

    // Also merge any other custom fields that came through
    if (Object.keys(customFields).length > 0) {
      for (const [key, value] of Object.entries(customFields)) {
        if (!(key in formData)) {
          formData[key] = value
        }
      }
    }

    // Add location info
    if (location.id) {
      formData.location = location
    }

    // Add campaign info
    if (campaign.id) {
      formData.campaign = campaign
    }

    // Add workflow info
    if (workflow.id) {
      formData.workflow = workflow
    }

    // Store raw payload for debugging (excluding sensitive data).
    // `headers` is dropped: HighLevel forwards ~1KB of Cloudflare/Istio proxy
    // metadata per lead that has no diagnostic value and bloats the JSON column.
    const { headers: _proxyHeaders, ...payloadWithoutHeaders } = payload
    void _proxyHeaders
    formData._rawPayload = {
      ...payloadWithoutHeaders,
      // Redact any potential sensitive fields
      password: payload.password ? '[REDACTED]' : undefined,
      token: payload.token ? '[REDACTED]' : undefined,
    }

    // Remove null/undefined values from formData
    Object.keys(formData).forEach(key => {
      if (formData[key] === null || formData[key] === undefined) {
        delete formData[key]
      }
    })

    // HighLevel contact ID for reference
    const highlevelContactId = payload.id || null

    // Extract attribution source from contact object (where HighLevel stores it)
    const attributionSource =
      payload.contact?.attributionSource ||
      payload.contact?.lastAttributionSource ||
      payload.attributionSource ||
      {}

    // UTM parameters. HighLevel's own attributionSource wins when present (it
    // reflects the real browser session); otherwise fall back to whatever the
    // workflow mapped through, under any spelling.
    const utmSource = asText(attributionSource.utmSource) ?? getText('utm_source')
    const utmMedium = asText(attributionSource.utmMedium) ?? getText('utm_medium')
    const utmCampaign =
      asText(attributionSource.campaign) ??
      asText(attributionSource.utmCampaign) ??
      getText('utm_campaign')
    const utmContent = asText(attributionSource.utmContent) ?? getText('utm_content')
    // `utm_term` is what the landing-page form sends; `utm_keyword` is the
    // older HighLevel-side name. Accept either.
    const utmKeyword =
      asText(attributionSource.utmKeyword) ??
      asText(attributionSource.utmTerm) ??
      getText('utm_term') ??
      getText('utm_keyword')
    const utmMatchtype =
      asText(attributionSource.utmMatchtype) ?? getText('utm_matchtype')
    const campaignId = asText(attributionSource.campaignId) ?? getText('campaign_id')
    const adGroupId = asText(attributionSource.adGroupId) ?? getText('ad_group_id')
    const adId = asText(attributionSource.adId) ?? getText('ad_id')

    // Landing page + referrer.
    const landingPageUrl =
      getText('landing_page') ??
      getText('page') ??
      asText(attributionSource.url) ??
      asText(attributionSource.landingPage) ??
      null
    const referrerUrl = getText('referrer') ?? asText(attributionSource.referrer) ?? null

    // iOS click identifiers, same lookup treatment as gclid.
    const gbraid = getText('gbraid') ?? asText(attributionSource.gbraid) ?? null
    const wbraid = getText('wbraid') ?? asText(attributionSource.wbraid) ?? null

    // Log attribution data for debugging
    console.log(`[HighLevel Webhook] Attribution data:`, {
      gclid,
      gbraid,
      wbraid,
      utmSource,
      utmMedium,
      utmCampaign,
      utmKeyword,
      campaignId,
      adGroupId,
    })

    // Determine lead source - check for phone call indicators
    const sourceStr = (contactSource || '').toLowerCase()
    const contactType = (payload.contact_type || '').toLowerCase()
    const attributionMedium = (attributionSource.medium || '').toLowerCase()
    const isPhoneCall =
      sourceStr.includes('phone') ||
      sourceStr.includes('call') ||
      sourceStr.includes('inbound') ||
      sourceStr.includes('(number pool)') || // HighLevel number pool tracking
      attributionMedium === 'conversation' || // HighLevel call attribution
      contactType === 'phone' ||
      contactType === 'call' ||
      payload.call !== undefined ||
      payload.phone_call !== undefined

    const leadSource = isPhoneCall ? 'PHONE' : 'FORM'

    // Extract call recording URL from various possible locations in the payload
    const callRecordingUrl =
      payload.recordingUrl ||
      payload.recording_url ||
      payload.customData?.recordingUrl ||
      payload.customData?.recording_url ||
      payload.audioUrl ||
      payload.audio_url ||
      payload.callRecording ||
      payload.call_recording ||
      payload.call?.recordingUrl ||
      payload.call?.recording_url ||
      payload.message?.attachments ||
      null

    // Log phone call data for debugging
    if (isPhoneCall) {
      console.log(`[HighLevel Webhook] PHONE LEAD - Recording URL: ${callRecordingUrl || 'not found'}`)
    }

    // Same-day dedup: if this customer already contacted us today, the new
    // row is created normally but linked back to the canonical so counts
    // aren't inflated. Status/saleValue still live on the canonical.
    let duplicateOfLeadId: string | null = null
    try {
      const canonical = await findSameDayDuplicateCanonical({
        clientId: client.id,
        phone,
        email,
        highlevelContactId,
        timezone: client.timezone ?? undefined,
      })
      if (canonical) {
        duplicateOfLeadId = canonical.id
        console.log(
          `[HighLevel Webhook] Same-day duplicate detected — linking to canonical ${canonical.id}`
        )
      }
    } catch (err) {
      // Dedup lookup is best-effort; never fail the webhook on it.
      console.warn('[HighLevel Webhook] Dedup lookup failed:', err)
    }

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        clientId: client.id,
        email,
        phone,
        firstName: finalFirstName,
        lastName: finalLastName,
        gclid,
        gbraid,
        wbraid,
        // UTM Parameters
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmKeyword,
        utmMatchtype,
        campaignId,
        adGroupId,
        adId,
        landingPageUrl,
        referrerUrl,
        // Other fields
        source: leadSource,
        formData: Object.keys(formData).length > 0 ? (formData as Prisma.InputJsonValue) : undefined,
        formName: workflow.name || campaign.name || asText(payload.form_name) || null,
        highlevelContactId,
        callRecordingUrl,
        status: 'NEW',
        duplicateOfLeadId,
      },
    })

    console.log(
      `[HighLevel Webhook] Created lead ${lead.id} for ${client.businessName}${
        duplicateOfLeadId ? ` (duplicate of ${duplicateOfLeadId})` : ''
      }`
    )

    // Forward the original payload to the client's configured outbound
    // webhooks (e.g. their HighLevel inbound webhook). The lead is already
    // saved, so this is strictly additive: delivery rows are created now
    // (fast insert), the actual POSTs run after the response is sent, and
    // anything that fails is retried by the cron sweep. A client with no
    // destinations configured skips all of this.
    try {
      const deliveryIds = await createDeliveriesForLead(
        client.id,
        lead.id,
        payloadWithoutHeaders
      )
      if (deliveryIds.length > 0) {
        console.log(
          `[HighLevel Webhook] Queued ${deliveryIds.length} outbound deliveries for lead ${lead.id}`
        )
        after(async () => {
          for (const id of deliveryIds) {
            await attemptDelivery(id)
          }
        })
      }
    } catch (err) {
      console.error('[HighLevel Webhook] Failed to queue outbound deliveries:', err)
    }

    // Tell whoever the shop nominated. Runs AFTER the response is sent, for
    // the same reason the deliveries do: a captured lead is worth far more
    // than an alert about it, and a slow Resend or Twilio call must never
    // delay — or fail — the webhook that captured it.
    //
    // NOT for same-day duplicates. One customer contacting once is one
    // enquiry, however many rows it arrives as. Alerting per row turns a form
    // submitted twice — or a webhook redelivered on retry, or a page that
    // posts to us and to a CRM that forwards its copy back — into two
    // identical emails and two texts about a customer the shop has already
    // been told about.
    after(async () => {
      // Asked now rather than trusted from insert time. Two copies of one
      // enquiry can be in flight together — the page posts to us and to the
      // CRM, and the CRM forwards its copy back — and neither insert sees the
      // other. Both rows exist by the time this runs, and both agree on which
      // one is the earliest, so exactly one alerts.
      let alertAllowed = !duplicateOfLeadId
      let survivorId = duplicateOfLeadId
      try {
        const earliest = await earliestSameDayContact({
          clientId: client.id,
          leadId: lead.id,
          phone,
          email,
          timezone: client.timezone ?? undefined,
        })
        alertAllowed = earliest.isEarliest
        survivorId = earliest.isEarliest ? null : earliest.earliestId
      } catch (err) {
        // Never swallow an alert because a dedup query failed. Fall back to
        // the insert-time answer: a possible double beats a silent miss.
        console.warn('[HighLevel Webhook] Alert dedup check failed, using insert-time flag:', err)
      }

      if (!alertAllowed) {
        console.log(
          `[HighLevel Webhook] Skipping alerts for lead ${lead.id} — same-day duplicate${
            survivorId ? ` of ${survivorId}` : ''
          }`
        )
        // The copy being suppressed may be the only one carrying the click
        // IDs — that is the usual shape, since a CRM workflow strips them on
        // the way through. Move them onto the row that survives, which is the
        // one the earliest check picked, not necessarily the one the
        // insert-time dedup guessed.
        if (survivorId) {
          try {
            const filled = await mergeAttributionIntoCanonical(survivorId, {
              gclid, gbraid, wbraid,
              utmSource, utmMedium, utmCampaign, utmContent, utmKeyword, utmMatchtype,
              campaignId, adGroupId, adId,
              landingPageUrl, referrerUrl,
            })
            if (filled.length) {
              console.log(
                `[HighLevel Webhook] Backfilled ${filled.join(', ')} onto canonical ${survivorId} from ${lead.id}`
              )
            }
          } catch (err) {
            console.error('[HighLevel Webhook] Attribution merge failed:', err)
          }
        }
        return
      }

      // Decode the VIN before alerting rather than after. It is one bounded
      // request and the alert is markedly more useful with it — knowing there
      // is a camera behind the glass changes what the shop quotes. A failure
      // or a slow vPIC costs the extra lines, never the alert.
      let decoded: Awaited<ReturnType<typeof decodeVin>> = null
      const vinForDecode = String(payload.vin || '').trim()
      if (vinForDecode) {
        try {
          decoded = await decodeVin(vinForDecode)
          if (decoded && !decoded.error) {
            // Kept on the lead so the admin and the portal show the same
            // answer later without asking vPIC again.
            await prisma.lead
              .update({
                where: { id: lead.id },
                data: {
                  formData: {
                    ...(formData as Record<string, unknown>),
                    vin_decoded: decoded.headline,
                    vin_calibration: decoded.calibration,
                    vin_camera_systems: decoded.cameraSystems,
                  } as Prisma.InputJsonValue,
                },
              })
              .catch(() => {})
          }
        } catch (err) {
          console.warn('[HighLevel Webhook] VIN decode failed:', err)
        }
      }

      // One decision governs the email, the SMS and the push. They used to be
      // guarded separately, which is how they drift apart.
      notifyNewLead(client.id, {
        firstName: finalFirstName,
        phone,
        source: leadSource,
      }).catch((err) => {
        console.error(`[HighLevel Webhook] Failed to send push notification:`, err)
      })

      try {
        const result = await notifyLeadRecipients(client.id, client.businessName, {
          name: text(payload.full_name) || text(payload.first_name),
          phone: text(payload.phone) || text(payload.phone_formatted),
          email: text(payload.email),
          service: text(payload.service_label) || text(payload.service),
          vehicle: text(payload.vehicle),
          postalCode: text(payload.postal_code),
          message: text(payload.notes) || text(payload.message),
          source: text(payload.source_label) || text(payload.contact_source),
          vin: text(payload.vin),
          insurance: text(payload.insurance_label) || text(payload.insurance),
          carrier: text(payload.carrier) || text(payload.insurance_carrier),
          landingPage: text(payload.landing_page) || text(payload.page),
          // Only ever our own storage. The alert renders this as an <img>, so
          // an arbitrary URL in the payload would let anyone who can post a
          // lead put an image of their choosing into a shop's inbox.
          damagePhotoUrl: ourBlobUrl(payload.damage_photo_url),
          leadUrl: `${process.env.APP_URL || 'https://glassleads.app'}/admin/leads/${lead.id}`,
          outcomeUrl: outcomeUrlFor(lead.id),
          decodedVehicle: decoded && !decoded.error ? decoded.headline : undefined,
          calibration: decoded ? calibrationLabel(decoded.calibration) ?? undefined : undefined,
        })
        if (result.emailSent || result.smsSent) {
          console.log(
            `[HighLevel Webhook] Notified ${result.emailSent} email / ${result.smsSent} SMS for lead ${lead.id}`
          )
        }
        if (result.errors.length) {
          console.error('[HighLevel Webhook] Notification errors:', result.errors.join(' | '))
        }
      } catch (err) {
        console.error('[HighLevel Webhook] Notification failed:', err)
      }
    })

    // If this is a phone lead with a recording URL, kick off call coaching
    // analysis (only when the client has the feature enabled). Stays a
    // fire-and-forget — the recovery cron will pick it up if the kick-off
    // didn't reach the worker.
    if (
      client.callCoachingEnabled &&
      leadSource === 'PHONE' &&
      typeof callRecordingUrl === 'string' &&
      callRecordingUrl.startsWith('http')
    ) {
      try {
        const callAnalysis = await prisma.callAnalysis.create({
          data: {
            clientId: client.id,
            leadId: lead.id,
            highlevelContactId,
            recordingUrl: callRecordingUrl,
            callerPhone: phone,
            callDirection: 'inbound',
            status: 'PENDING',
          },
        })
        kickOffCallAnalysis(request, callAnalysis.id)
        console.log(
          `[HighLevel Webhook] Started call analysis ${callAnalysis.id} for lead ${lead.id}`
        )
      } catch (err) {
        console.error('[HighLevel Webhook] Failed to start call analysis:', err)
      }
    }

    if (isFormPost) return formRedirect(true)

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      message: 'Lead captured successfully',
    })

  } catch (error) {
    // Enhanced error logging with context
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('[HighLevel Webhook] Error processing webhook:', {
      error: errorMessage,
      stack: errorStack,
      url: request.url,
    })

    // A browser that posted a form gets a page, not a JSON error body it
    // would render as plain text. `isFormPost` is scoped to the try block, so
    // the header is read again rather than hoisted — the failure path must not
    // depend on how far the successful path got.
    if ((request.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
      const proto =
        request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
        new URL(request.url).protocol.replace(':', '') ||
        'https'
      const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
        .split(',')[0]
        .trim()
      return NextResponse.redirect(`${proto}://${host}/quote-sent?problem=1`, 303)
    }

    return NextResponse.json(
      { error: 'Failed to process webhook', details: errorMessage },
      { status: 500 }
    )
  }
}

// GET endpoint to verify webhook is configured correctly
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientSlug = searchParams.get('client')

  if (!clientSlug) {
    return NextResponse.json({
      status: 'ok',
      message: 'HighLevel webhook endpoint. Add ?client=YOUR_CLIENT_SLUG to configure.',
    })
  }

  const client = await prisma.client.findUnique({
    where: { slug: clientSlug },
    select: { id: true, businessName: true },
  })

  if (!client) {
    return NextResponse.json({
      status: 'error',
      message: `Client not found: ${clientSlug}`,
    }, { status: 404 })
  }

  return NextResponse.json({
    status: 'ok',
    message: `Webhook configured for: ${client.businessName}`,
    client: client.businessName,
  })
}
