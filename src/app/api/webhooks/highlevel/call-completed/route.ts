import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * HighLevel Webhook for Call Completed
 *
 * URL Format: /api/webhooks/highlevel/call-completed?client=CLIENT_SLUG
 *
 * This webhook is triggered when a phone call is completed in HighLevel.
 * It updates the corresponding lead with the call recording URL and duration.
 *
 * HighLevel sends call data including:
 * - contact_id or id: The HighLevel contact ID
 * - phone: The caller's phone number
 * - recording_url or recordingUrl: URL to the call recording
 * - duration: Call duration in seconds
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get('client')

    // Validate client parameter
    if (!clientSlug) {
      console.error('[Call Completed Webhook] Missing client parameter')
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
      console.error(`[Call Completed Webhook] Client not found: ${clientSlug}`)
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    // Parse the webhook payload
    const payload = await request.json()
    console.log(`[Call Completed Webhook] Received for ${client.businessName}:`, JSON.stringify(payload, null, 2))

    // Extract recording URL from various possible locations
    const recordingUrl =
      payload.recordingUrl ||
      payload.recording_url ||
      payload.call?.recordingUrl ||
      payload.call?.recording_url ||
      payload.message?.recording ||
      payload.audioUrl ||
      payload.audio_url ||
      null

    // Extract call duration
    const duration =
      payload.duration ||
      payload.call_duration ||
      payload.call?.duration ||
      null

    // Extract identifiers to match the lead
    const contactId =
      payload.contact_id ||
      payload.contactId ||
      payload.id ||
      payload.contact?.id ||
      null

    const phone =
      payload.phone ||
      payload.caller_phone ||
      payload.from_number ||
      payload.contact?.phone ||
      null

    console.log(`[Call Completed Webhook] Extracted data:`, {
      contactId,
      phone,
      recordingUrl,
      duration,
    })

    if (!recordingUrl) {
      console.log(`[Call Completed Webhook] No recording URL found in payload`)
      return NextResponse.json({
        success: true,
        message: 'Webhook received but no recording URL found',
        updated: false,
      })
    }

    // Try to find the lead to update
    // First try by HighLevel contact ID, then by phone
    let lead = null

    if (contactId) {
      lead = await prisma.lead.findFirst({
        where: {
          clientId: client.id,
          highlevelContactId: contactId,
          source: 'PHONE',
        },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!lead && phone) {
      // Normalize phone number for matching
      const normalizedPhone = phone.replace(/\D/g, '')
      const phoneVariants = [
        phone,
        normalizedPhone,
        `+${normalizedPhone}`,
        `+1${normalizedPhone}`,
        normalizedPhone.slice(-10), // Last 10 digits
      ]

      lead = await prisma.lead.findFirst({
        where: {
          clientId: client.id,
          phone: { in: phoneVariants },
          source: 'PHONE',
        },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!lead) {
      console.log(`[Call Completed Webhook] No matching lead found for contact ${contactId} or phone ${phone}`)
      return NextResponse.json({
        success: true,
        message: 'Webhook received but no matching lead found',
        updated: false,
        searchedFor: { contactId, phone },
      })
    }

    // Update the lead with recording info
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        callRecordingUrl: recordingUrl,
        callDuration: duration ? parseInt(duration, 10) : null,
      },
    })

    console.log(`[Call Completed Webhook] Updated lead ${lead.id} with recording URL`)

    return NextResponse.json({
      success: true,
      message: 'Lead updated with call recording',
      leadId: lead.id,
      updated: true,
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Call Completed Webhook] Error:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
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
      message: 'HighLevel call-completed webhook endpoint. Add ?client=YOUR_CLIENT_SLUG to configure.',
      usage: 'Configure HighLevel workflow to POST to this URL when a call completes',
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
    message: `Call-completed webhook configured for: ${client.businessName}`,
    client: client.businessName,
  })
}
