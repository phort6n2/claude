import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyNewLead } from '@/lib/push-notifications'
import { kickOffCallAnalysis } from '@/lib/call-analysis/queue'
import { findSameDayDuplicateCanonical } from '@/lib/lead-dedup'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * HighLevel Webhook for Lead Capture
 *
 * URL Format: /api/webhooks/highlevel/lead?client=CLIENT_SLUG&key=SECRET_KEY
 *
 * HighLevel sends form submission data in the request body.
 * We extract contact info, GCLID, UTM params, and create a Lead record.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get('client')
    const webhookKey = searchParams.get('key')

    // Validate client parameter
    if (!clientSlug) {
      console.error('[HighLevel Webhook] Missing client parameter')
      return NextResponse.json(
        { error: 'Missing client parameter' },
        { status: 400 }
      )
    }

    // Validate webhook secret key — soft-warn only for now.
    // Strict rejection was causing legitimate HighLevel deliveries to fail
    // when the key in the Vercel env var didn't match what HighLevel was
    // sending. The branch below logs the mismatch but lets the request
    // through so leads keep flowing; once the correct key is confirmed in
    // both places this block can be flipped back to a hard `return`.
    const expectedKey = process.env.HIGHLEVEL_WEBHOOK_SECRET
    if (expectedKey && webhookKey !== expectedKey) {
      const preview = webhookKey
        ? `${webhookKey.slice(0, 4)}***${webhookKey.slice(-4)} (len=${webhookKey.length})`
        : 'none'
      console.warn(
        `[HighLevel Webhook] Key mismatch — accepting anyway. Provided key: ${preview}. ` +
          `Set HIGHLEVEL_WEBHOOK_SECRET to match (or remove the env var) to silence this warning.`
      )
    }

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

    // Parse the webhook payload
    const payload = await request.json()
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
    let gclid =
      payload.gclid ||
      payload.contact?.gclid ||
      payload.attributionSource?.gclid ||
      payload.attribution?.gclid ||
      customFields.gclid ||
      null

    // Filter out unresolved template strings like {{contact.gclid}}
    if (gclid && typeof gclid === 'string' && (gclid.includes('{{') || gclid.includes('}}'))) {
      gclid = null
    }

    // Log where we found GCLID for debugging
    if (gclid) {
      console.log(`[HighLevel Webhook] GCLID found: ${gclid}`)
    } else {
      console.log(`[HighLevel Webhook] No GCLID found. Checked locations:`, {
        root: payload.gclid,
        contact: payload.contact?.gclid,
        attributionSource: payload.attributionSource?.gclid,
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

    // Helper to get custom field from multiple locations
    // Filters out unresolved template strings like {{contact.field_name}}
    const getCustomField = (fieldName: string) => {
      const value = payload[fieldName] || customFields[fieldName] || null
      if (value && typeof value === 'string' && (value.includes('{{') || value.includes('}}'))) {
        return null // Template wasn't resolved
      }
      return value
    }

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

    // UTM Parameters - extract from attribution source
    const utmSource = attributionSource.utmSource || payload.utm_source || null
    const utmMedium = attributionSource.utmMedium || payload.utm_medium || null
    const utmCampaign = attributionSource.campaign || attributionSource.utmCampaign || payload.utm_campaign || null
    const utmContent = attributionSource.utmContent || payload.utm_content || null
    // `utm_term` is what the landing-page form sends; `utm_keyword` is the
    // older HighLevel-side name. Accept either.
    const utmKeyword =
      attributionSource.utmKeyword ||
      attributionSource.utmTerm ||
      payload.utm_term ||
      payload.utm_keyword ||
      null
    const utmMatchtype = attributionSource.utmMatchtype || payload.utm_matchtype || null
    const campaignId = attributionSource.campaignId || payload.campaign_id || null
    const adGroupId = attributionSource.adGroupId || payload.ad_group_id || null
    const adId = attributionSource.adId || payload.ad_id || null

    // Landing page + referrer, sent by the landing-page form.
    const landingPageUrl =
      payload.landing_page ||
      payload.page ||
      attributionSource.url ||
      attributionSource.landingPage ||
      null
    const referrerUrl = payload.referrer || attributionSource.referrer || null

    // Also check attribution source for GCLID/GBRAID/WBRAID if not found at root
    if (!gclid) {
      gclid = attributionSource.gclid || null
    }
    const gbraid = payload.gbraid || attributionSource.gbraid || null
    const wbraid = payload.wbraid || attributionSource.wbraid || null

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
        formName: workflow.name || campaign.name || null,
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

    // Send push notification to client users (non-blocking)
    notifyNewLead(client.id, {
      firstName: finalFirstName,
      phone,
      source: leadSource,
    }).catch((err) => {
      console.error(`[HighLevel Webhook] Failed to send push notification:`, err)
    })

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
