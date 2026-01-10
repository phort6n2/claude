import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

    // Find the client
    const client = await prisma.client.findUnique({
      where: { slug: clientSlug },
      select: { id: true, businessName: true },
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

    // HighLevel webhook structure varies, but commonly includes:
    // - contact: { email, phone, firstName, lastName, ... }
    // - customFields: { ... }
    // - form: { id, name }
    // - location: { id, name }
    // - attributionSource: { url, utmSource, utmMedium, ... }

    // Extract contact info (handle different HighLevel payload structures)
    const contact = payload.contact || payload
    const customFields = payload.customFields || contact.customFields || {}
    const attributionSource = payload.attributionSource || contact.attributionSource || {}
    const formInfo = payload.form || {}

    // Get contact details
    const email = contact.email || contact.Email || null
    const phone = contact.phone || contact.Phone || contact.phoneNumber || null
    const firstName = contact.firstName || contact.first_name || contact.FirstName || null
    const lastName = contact.lastName || contact.last_name || contact.LastName || null

    // Extract GCLID from multiple possible sources:
    // 1. Custom field named 'gclid'
    // 2. Attribution source
    // 3. URL parameter in landing page URL
    let gclid = customFields.gclid ||
                customFields.GCLID ||
                attributionSource.gclid ||
                null

    // If no GCLID in custom fields, try to extract from landing page URL
    const landingPageUrl = attributionSource.url ||
                           contact.source ||
                           customFields.landing_page_url ||
                           null

    if (!gclid && landingPageUrl) {
      try {
        const url = new URL(landingPageUrl)
        gclid = url.searchParams.get('gclid')
      } catch {
        // Invalid URL, skip
      }
    }

    // Extract UTM parameters
    const utmSource = attributionSource.utmSource ||
                      attributionSource.utm_source ||
                      customFields.utm_source ||
                      null
    const utmMedium = attributionSource.utmMedium ||
                      attributionSource.utm_medium ||
                      customFields.utm_medium ||
                      null
    const utmCampaign = attributionSource.utmCampaign ||
                        attributionSource.utm_campaign ||
                        customFields.utm_campaign ||
                        null
    const utmContent = attributionSource.utmContent ||
                       attributionSource.utm_content ||
                       customFields.utm_content ||
                       null
    const utmKeyword = attributionSource.utmKeyword ||
                       attributionSource.utm_keyword ||
                       customFields.utm_keyword ||
                       null
    const utmMatchtype = customFields.utm_matchtype || null

    // Google Ads IDs from UTM params
    const campaignId = customFields.campaign_id || null
    const adGroupId = customFields.ad_group_id || null
    const adId = customFields.ad_id || null

    // iOS/Web attribution
    const gbraid = customFields.gbraid || null
    const wbraid = customFields.wbraid || null

    // Build form data JSON (all extra fields)
    const formData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(customFields)) {
      // Exclude fields we're storing in dedicated columns
      if (!['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign',
            'utm_content', 'utm_keyword', 'utm_matchtype', 'campaign_id', 'ad_group_id',
            'ad_id', 'landing_page_url'].includes(key.toLowerCase())) {
        formData[key] = value
      }
    }

    // HighLevel contact ID for reference
    const highlevelContactId = contact.id || contact.contactId || null

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        clientId: client.id,
        email,
        phone,
        firstName,
        lastName,
        gclid,
        gbraid,
        wbraid,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmKeyword,
        utmMatchtype,
        campaignId,
        adGroupId,
        adId,
        source: 'FORM',
        landingPageUrl,
        formData: Object.keys(formData).length > 0 ? formData : null,
        formName: formInfo.name || null,
        highlevelContactId,
        status: 'NEW',
      },
    })

    console.log(`[HighLevel Webhook] Created lead ${lead.id} for ${client.businessName}`)

    // TODO: Trigger Enhanced Conversions to Google Ads (Phase 3)
    // if (email || phone) {
    //   await sendEnhancedConversion(client.id, lead.id, { email, phone })
    // }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      message: 'Lead captured successfully',
    })

  } catch (error) {
    console.error('[HighLevel Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
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
