import { after } from 'next/server'
import { prisma } from '@/lib/db'
import { twilioParams, verifyTwilioSignature, publicUrl } from '@/lib/twilio-voice'
import { mediaFromParams, storeSmsMedia, isOptOut } from '@/lib/twilio-sms'
import { recordInboundSms } from '@/lib/sms-lead'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 204 with no body — the same rule the other three Twilio routes follow.
 *
 * A 204 Response must have a null body; passing even an empty string makes
 * the constructor throw, which reaches Twilio as a 500. Twilio retries a 500,
 * so a callback that had already done its work would be replayed.
 *
 * 204 rather than TwiML on purpose: an empty <Response/> is also valid and
 * sends nothing, but 204 cannot be misread as "reply with this", and there is
 * deliberately no auto-reply here. See the note below.
 */
function noContent(): Response {
  return new Response(null, { status: 204 })
}

/**
 * POST /api/webhooks/twilio/sms
 *
 * Somebody texted a tracking number. The hosted sites tell them to — "text a
 * photo of the damage, it is the fastest way to a firm price" — and until now
 * that text went nowhere: the numbers were bought with a VoiceUrl and nothing
 * else, so Twilio had no instruction for a message and the photo was
 * swallowed. The customer believed they had sent it.
 *
 * WHAT THIS DOES NOT DO: reply. An automated answer from the shop's number
 * would be this platform speaking as the shop to their customer, and the only
 * honest thing it could say is a timing promise §2 forbids. The shop gets an
 * urgent alert with the photo in it instead, and answers as themselves. That
 * is a decision rather than an omission — if it changes, it needs a per-shop
 * flag and copy that promises nothing.
 */
export async function POST(request: Request) {
  const url = publicUrl(request)
  const params = await twilioParams(request)

  const check = await verifyTwilioSignature(request, url, params)
  if (!check.ok) {
    console.error(`[Twilio SMS] Rejected unsigned request: ${check.reason}`)
    return new Response('Forbidden', { status: 403 })
  }

  const messageSid = params.MessageSid || params.SmsSid || ''
  const from = params.From || ''
  const to = params.To || ''
  const body = (params.Body || '').trim()

  if (!messageSid || !from || !to) {
    console.error('[Twilio SMS] Missing MessageSid, From or To')
    return noContent()
  }

  /* AN OPT-OUT IS NOT AN ENQUIRY. A lead row and an urgent alert for somebody
     typing STOP is noise at best; logged so it is not simply invisible. */
  if (isOptOut(body)) {
    console.log(`[Twilio SMS] Opt-out from ${from} to ${to} — no lead created`)
    return noContent()
  }

  // Answer Twilio immediately. Copying two or three photos out of their CDN
  // takes longer than a webhook should hold a connection open, and a slow
  // answer is a retry — which the MessageSid guard survives, but there is no
  // reason to provoke one.
  after(async () => {
    try {
      const number = await prisma.trackingNumber.findUnique({
        where: { phoneNumber: to },
        include: {
          client: { select: { id: true, slug: true, businessName: true, timezone: true } },
        },
      })
      if (!number) {
        // A number in the Twilio account that this app does not know about.
        // Named in the log with both ends, because the fix is either to add
        // the number here or to point it somewhere else in Twilio.
        console.error(`[Twilio SMS] No tracking number on file for ${to} (text from ${from})`)
        return
      }

      /* THE PHOTOS, COPIED BEFORE ANYTHING ELSE READS THEM. Twilio's media
         URLs need Basic auth and do not outlive the message, so an email that
         linked one would render a broken image within days. A copy that fails
         costs the photo, never the message or the alert. */
      const media = mediaFromParams(params)
      const stored: string[] = []
      const types: string[] = []
      for (let i = 0; i < media.length; i++) {
        const url = await storeSmsMedia(media[i], number.client.slug, messageSid, i)
        if (url) {
          stored.push(url)
          types.push(media[i].contentType)
        }
      }
      if (media.length && !stored.length) {
        console.error(
          `[Twilio SMS] ${messageSid} carried ${media.length} media item(s) and none could be copied`
        )
      }

      const result = await recordInboundSms(number, {
        messageSid,
        from,
        to,
        body,
        mediaUrls: stored,
        mediaTypes: types,
        raw: params,
      })

      /* A RETRY SAYS SO. The first version of this line reported every
         outcome the same way, so a Twilio replay logged as "attached to
         today's lead, no second alert" — indistinguishable from a real second
         text that was correctly not alerted twice. */
      if (!result.stored) {
        console.log(`[Twilio SMS] ${messageSid} was a retry of an already-recorded message`)
      } else {
        console.log(
          `[Twilio SMS] ${messageSid} → lead ${result.leadId}` +
            ` (${result.createdLead ? 'new lead' : 'attached to today’s lead'},` +
            ` ${stored.length} photo(s), ${result.alerted ? 'alerted' : 'no second alert'})`
        )
      }
    } catch (error) {
      console.error('[Twilio SMS] Failed:', error)
    }
  })

  return noContent()
}
