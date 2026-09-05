import { prisma } from '@/lib/db'
import { toE164 } from '@/lib/contact-links'
import { notifyNewLead, type NotifyResult } from '@/lib/lead-notifications'

/**
 * The test alert, buildable from two places.
 *
 * The admin card has always had a "send test" button; the portal walkthrough
 * now has one too, because the person who must prove the whitelist worked is
 * the shop, on their own phone. Both buttons MUST send the same message, so
 * the message is built here once — a portal test that differs from the admin
 * test is two chances for "the alerts are broken" to mean "the test was
 * incomplete".
 *
 * The test is a faithful replica of a real alert — every button, every row.
 * A test that omits pieces is how missing pieces go unnoticed, and ALSO how
 * present pieces get reported as broken: a test email without the Call/Text/
 * booked buttons reads as "the alerts are broken", when the only thing
 * missing was in the test.
 */
export async function sendTestAlert(
  clientId: string,
  kind: 'form' | 'call' = 'form'
): Promise<{ ok: boolean; result: NotifyResult } | { ok: false; error: string }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true, phone: true, timezone: true },
  })
  if (!client) return { ok: false, error: 'Client not found' }

  const isCall = kind === 'call'
  // Formatted here, in the shop's own zone, exactly as the intake does it for
  // a real call — the whole point of the line is that it reads as the local
  // time the customer rang, not the time where this server happens to run.
  const calledAtLabel = isCall
    ? (() => {
        try {
          return new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
            timeZone: client.timezone || 'America/Denver',
          }).format(new Date())
        } catch {
          return undefined
        }
      })()
    : undefined

  // Call/Text dial the CUSTOMER on a real alert; here the shop's own number
  // plays the customer, which doubles as a nice self-check — unless that
  // number does not parse (fictional clients, short numbers), in which case a
  // reserved fictional number stands in so the buttons still render.
  const phone = toE164(client.phone) ? client.phone : '(800) 555-0199'

  // The booked/didn't-book buttons need a lead to point at. Use the client's
  // most recent one so the whole flow is clickable end to end; a brand-new
  // client with no leads yet gets a note instead of silently missing buttons.
  const latestLead = await prisma.lead
    .findFirst({ where: { clientId }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    .catch(() => null)
  const { outcomeUrlFor } = await import('@/lib/lead-outcome-token')
  const outcomeUrl = latestLead ? outcomeUrlFor(latestLead.id) : null

  const result = await notifyNewLead(clientId, client.businessName, {
    isCall,
    calledAtLabel,
    name: isCall ? 'Test Caller' : 'Test Lead',
    phone,
    email: 'webhook-test@glassleads.app',
    service: 'Windshield Replacement',
    vehicle: '2020 Hyundai Santa Fe',
    postalCode: '97132',
    message: outcomeUrl
      ? 'This is a test alert from glassleads.app. Safe to ignore. The booked buttons below point at this client’s most recent lead.'
      : 'This is a test alert from glassleads.app. Safe to ignore. Real alerts also carry one-tap “We booked it” buttons — they appear once this client has a lead to point them at.',
    source: isCall ? 'Test — inbound call' : 'Test alert',
    leadUrl: null,
    vin: '5NMS3CAD4LH123456',
    insurance: 'Filing through insurance',
    carrier: 'State Farm',
    landingPage: 'https://glassleads.app (test)',
    // The Google Ads badge is part of a real alert, so it is part of the test
    // one — the faithful-replica rule at the top of this file. The message
    // body says plainly that this is a test, so nobody reads the badge as a
    // claim about a lead that does not exist; leaving it out would mean the
    // first time anybody saw it was on a live lead.
    attribution: { gclid: 'TEST-CLICK-ID', utmCampaign: 'Windshield — Search' },
    outcomeUrl,
  })

  return { ok: result.errors.length === 0, result }
}
