import { after } from 'next/server'
import { prisma } from '@/lib/db'
import {
  twilioParams,
  verifyTwilioSignature,
  publicUrl,
  storeRecording,
} from '@/lib/twilio-voice'
import { recordCall } from '@/lib/call-lead'
import { kickOffCallAnalysis } from '@/lib/call-analysis/queue'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 204 with no body.
 *
 * A 204 Response must have a null body — passing even an empty string makes
 * the constructor throw, which surfaces to Twilio as a 500. Twilio retries a
 * 500, so a callback that had in fact done all its work would be replayed,
 * and every recording would start a second analysis run. Caught by a local
 * simulation of the callback; nothing about the logs suggested it.
 */
function noContent(): Response {
  return new Response(null, { status: 204 })
}

/**
 * POST /api/webhooks/twilio/recording
 *
 * Twilio has finished processing the recording, a minute or two after the
 * call. Nobody is waiting on this, which is what makes it the right place to
 * do the slow work: fetch the audio, copy it somewhere the transcriber and
 * the browser can both read, and start the coaching run.
 *
 * Usually the status callback has already created the lead. Usually — not
 * always, since Twilio retries and the two callbacks are independent. So this
 * goes through the same CallSid-keyed path, and creates the lead itself if it
 * arrives first.
 */
export async function POST(request: Request) {
  const url = publicUrl(request)
  const params = await twilioParams(request)

  const check = await verifyTwilioSignature(request, url, params)
  if (!check.ok) {
    console.error(`[Twilio Recording] Rejected unsigned request: ${check.reason}`)
    return new Response('Forbidden', { status: 403 })
  }

  const callSid = params.CallSid || ''
  const recordingUrl = params.RecordingUrl || ''
  const duration = params.RecordingDuration ? parseInt(params.RecordingDuration, 10) : null
  // The recording callback reports the leg it recorded, so To/From can be the
  // forwarding leg rather than the original call. The lead is found by
  // CallSid; To is only a fallback for the unusual case of arriving first.
  const to = params.To || ''

  if (!callSid || !recordingUrl) {
    console.error('[Twilio Recording] Missing CallSid or RecordingUrl')
    return noContent()
  }

  // Answer Twilio immediately; the fetch, the copy and the transcription
  // kick-off all take longer than a webhook should hold a connection open.
  after(async () => {
    try {
      let lead = await prisma.lead.findUnique({
        where: { twilioCallSid: callSid },
        select: { id: true, clientId: true, client: { select: { slug: true, callCoachingEnabled: true } } },
      })

      if (!lead) {
        // Arrived before the status callback. Build the row from what we have.
        const number = await prisma.trackingNumber.findUnique({
          where: { phoneNumber: to },
          include: {
            client: { select: { id: true, slug: true, businessName: true, timezone: true } },
          },
        })
        if (!number) {
          console.error(`[Twilio Recording] No lead and no tracking number for ${callSid} / ${to}`)
          return
        }
        const leadId = await recordCall(number, {
          callSid,
          from: params.From || '',
          to,
          durationSeconds: duration,
        })
        lead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { id: true, clientId: true, client: { select: { slug: true, callCoachingEnabled: true } } },
        })
        if (!lead) return
      }

      const stored = await storeRecording(recordingUrl, lead.client.slug, callSid)
      if (!stored) {
        console.error(`[Twilio Recording] Could not store recording for ${callSid}`)
        return
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: { callRecordingUrl: stored, callDurationSecs: duration ?? undefined },
      })

      if (!lead.client.callCoachingEnabled) {
        console.log(`[Twilio Recording] Stored ${callSid}; coaching is off for this client`)
        return
      }

      const analysis = await prisma.callAnalysis.create({
        data: {
          clientId: lead.clientId,
          leadId: lead.id,
          recordingUrl: stored,
          callerPhone: params.From || null,
          callDirection: 'inbound',
          status: 'PENDING',
        },
      })
      kickOffCallAnalysis(request, analysis.id)
      console.log(`[Twilio Recording] Stored ${callSid}, started analysis ${analysis.id}`)
    } catch (error) {
      console.error('[Twilio Recording] Failed:', error)
    }
  })

  return noContent()
}
