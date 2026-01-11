import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEnhancedConversion } from '@/lib/google-ads'
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

    // GCLID is at root level - filter out unresolved template strings
    let gclid = payload.gclid || null
    if (gclid && (gclid.includes('{{') || gclid.includes('}}'))) {
      gclid = null // Template wasn't resolved, treat as no GCLID
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

    // Custom fields can be at root level OR nested under customFields/customData
    const customFields = payload.customFields || payload.customData || payload.custom_fields || {}

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
      // Custom fields for auto glass - check both root and nested locations
      interested_in: getCustomField('interested_in'),
      vehicle_year: getCustomField('vehicle_year'),
      vehicle_make: getCustomField('vehicle_make'),
      vehicle_model: getCustomField('vehicle_model'),
      vin: getCustomField('vin'),
      radio_3s0t: getCustomField('radio_3s0t'),
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

    // Remove null/undefined values from formData
    Object.keys(formData).forEach(key => {
      if (formData[key] === null || formData[key] === undefined) {
        delete formData[key]
      }
    })

    // HighLevel contact ID for reference
    const highlevelContactId = payload.id || null

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        clientId: client.id,
        email,
        phone,
        firstName: finalFirstName,
        lastName: finalLastName,
        gclid,
        source: 'FORM',
        formData: Object.keys(formData).length > 0 ? (formData as Prisma.InputJsonValue) : undefined,
        formName: workflow.name || campaign.name || null,
        highlevelContactId,
        status: 'NEW',
      },
    })

    console.log(`[HighLevel Webhook] Created lead ${lead.id} for ${client.businessName}`)

    // Send Enhanced Conversion to Google Ads if GCLID is present
    if (gclid && (email || phone)) {
      try {
        // Get client's Google Ads config
        const googleAdsConfig = await prisma.clientGoogleAds.findUnique({
          where: { clientId: client.id },
        })

        if (googleAdsConfig?.isActive && googleAdsConfig.leadConversionActionId) {
          const result = await sendEnhancedConversion({
            customerId: googleAdsConfig.customerId,
            gclid,
            email: email || undefined,
            phone: phone || undefined,
            conversionAction: googleAdsConfig.leadConversionActionId,
            conversionDateTime: new Date(),
          })

          if (result.success) {
            // Mark the lead as having sent enhanced conversion
            await prisma.lead.update({
              where: { id: lead.id },
              data: { enhancedConversionSent: true },
            })
            console.log(`[HighLevel Webhook] Enhanced conversion sent for lead ${lead.id}`)
          } else {
            console.warn(`[HighLevel Webhook] Enhanced conversion failed for lead ${lead.id}:`, result.error)
          }
        }
      } catch (err) {
        // Log but don't fail the webhook
        console.error(`[HighLevel Webhook] Enhanced conversion error for lead ${lead.id}:`, err)
      }
    }

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
