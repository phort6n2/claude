import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { kickOffCallAnalysis } from '@/lib/call-analysis/queue'

export const dynamic = 'force-dynamic'

/**
 * HighLevel Webhook: call recording ready
 *
 * URL: /api/webhooks/highlevel/call-recording?client=CLIENT_SLUG&key=SECRET_KEY
 *
 * Receives the recording URL, creates a CallAnalysis row in PENDING status,
 * and fires the analysis pipeline as a fire-and-forget worker call.
 *
 * Always returns 200 (unless the body is malformed) so HighLevel never retries
 * — failures land in the row's errorMessage and are picked up by the recovery
 * cron.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get('client')
    const webhookKey = searchParams.get('key')

    if (!clientSlug) {
      console.error('[CallRecording Webhook] Missing client parameter')
      return NextResponse.json(
        { error: 'Missing client parameter' },
        { status: 400 }
      )
    }

    // Soft-warn on key mismatch (matches the lead webhook's lenient behavior so
    // legitimate HighLevel deliveries keep flowing if the secret drifts).
    const expectedKey = process.env.HIGHLEVEL_WEBHOOK_SECRET
    if (expectedKey && webhookKey !== expectedKey) {
      console.warn(
        '[CallRecording Webhook] Webhook key mismatch — accepting anyway.'
      )
    }

    const client = await prisma.client.findUnique({
      where: { slug: clientSlug },
      select: { id: true, businessName: true, callCoachingEnabled: true },
    })

    if (!client) {
      // Spec: never retry on missing client. Log and return 200.
      console.error(`[CallRecording Webhook] Client not found: ${clientSlug}`)
      return NextResponse.json({ status: 'ignored', reason: 'client_not_found' })
    }

    if (!client.callCoachingEnabled) {
      console.log(
        `[CallRecording Webhook] Coaching disabled for ${client.businessName}; skipping`
      )
      return NextResponse.json({
        status: 'ignored',
        reason: 'call_coaching_disabled',
      })
    }

    const payload = await request.json().catch(() => ({}))
    console.log(
      `[CallRecording Webhook] Received for ${client.businessName}:`,
      JSON.stringify(payload).slice(0, 2000)
    )

    // Recording URL can arrive in various places depending on the HighLevel
    // workflow trigger that fires it.
    const recordingUrl: string | null =
      payload.recordingUrl ||
      payload.recording_url ||
      payload.audioUrl ||
      payload.audio_url ||
      payload.callRecording ||
      payload.call_recording ||
      payload.call?.recordingUrl ||
      payload.call?.recording_url ||
      payload.customData?.recordingUrl ||
      payload.customData?.recording_url ||
      null

    if (!recordingUrl) {
      console.warn('[CallRecording Webhook] No recording URL found in payload')
      return NextResponse.json({ status: 'ignored', reason: 'no_recording_url' })
    }

    // Reference IDs — used to dedupe and to attach to an existing Lead row when
    // possible.
    const highlevelCallId: string | null =
      payload.callId || payload.call_id || payload.call?.id || null
    const highlevelContactId: string | null =
      payload.contactId ||
      payload.contact_id ||
      payload.contact?.id ||
      payload.id ||
      null

    const callDirection: string | null =
      payload.direction || payload.call?.direction || null
    const callerPhone: string | null =
      payload.from || payload.callerPhone || payload.caller_phone || payload.contact?.phone || null
    const repPhone: string | null = payload.to || payload.repPhone || payload.rep_phone || null

    // De-duplicate — HighLevel sometimes redelivers.
    if (highlevelCallId) {
      const existing = await prisma.callAnalysis.findFirst({
        where: { clientId: client.id, highlevelCallId },
        select: { id: true },
      })
      if (existing) {
        console.log(
          `[CallRecording Webhook] Already have analysis ${existing.id} for call ${highlevelCallId}; skipping`
        )
        return NextResponse.json({ status: 'duplicate', callAnalysisId: existing.id })
      }
    }

    // Try to attach to the matching Lead so the report can render under the
    // existing lead detail view.
    let leadId: string | null = null
    if (highlevelContactId) {
      const lead = await prisma.lead.findFirst({
        where: { clientId: client.id, highlevelContactId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (lead) leadId = lead.id
    }

    const callAnalysis = await prisma.callAnalysis.create({
      data: {
        clientId: client.id,
        leadId,
        highlevelCallId,
        highlevelContactId,
        recordingUrl,
        callDirection,
        callerPhone,
        repPhone,
        status: 'PENDING',
      },
    })

    // Mirror the recording URL onto the lead so the existing portal player
    // (which reads from Lead.callRecordingUrl) shows it even when the lead
    // webhook fired without a recording attached.
    if (leadId) {
      await prisma.lead
        .update({
          where: { id: leadId },
          data: { callRecordingUrl: recordingUrl },
        })
        .catch((err) => {
          console.warn('[CallRecording Webhook] Failed to mirror URL to lead:', err)
        })
    }

    console.log(
      `[CallRecording Webhook] Created CallAnalysis ${callAnalysis.id} for ${client.businessName}`
    )

    // Fire-and-forget the pipeline.
    kickOffCallAnalysis(request, callAnalysis.id)

    return NextResponse.json({
      success: true,
      callAnalysisId: callAnalysis.id,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[CallRecording Webhook] Error processing webhook:', {
      error: errorMessage,
      url: request.url,
    })
    // Still return 200 so HighLevel doesn't retry into the same failure.
    return NextResponse.json({ status: 'error', error: errorMessage })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientSlug = searchParams.get('client')

  if (!clientSlug) {
    return NextResponse.json({
      status: 'ok',
      message:
        'HighLevel call-recording webhook endpoint. Add ?client=YOUR_CLIENT_SLUG&key=SECRET to configure.',
    })
  }

  const client = await prisma.client.findUnique({
    where: { slug: clientSlug },
    select: { id: true, businessName: true },
  })

  if (!client) {
    return NextResponse.json(
      { status: 'error', message: `Client not found: ${clientSlug}` },
      { status: 404 }
    )
  }

  return NextResponse.json({
    status: 'ok',
    message: `Call-recording webhook configured for: ${client.businessName}`,
  })
}
