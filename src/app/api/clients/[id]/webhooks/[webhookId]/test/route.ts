import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { postToDestination } from '@/lib/webhook-forwarding'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string; webhookId: string }>
}

/**
 * Send a clearly-marked test payload to a destination, synchronously, and
 * report the result.
 *
 * The payload carries EVERY field a real submission carries. That is the
 * whole point of the button: HighLevel builds its field mapping from the
 * sample it receives, so a test containing only name/email/phone produces a
 * workflow that silently drops the vehicle, the service, the ZIP, and all of
 * the ad attribution the moment a real lead arrives. Fields the real form can
 * leave blank are sent as empty strings rather than omitted, so they still
 * appear in the mapping UI.
 *
 * Keep this in sync with the widget's submission payload in
 * src/app/widget.js/route.ts — that is the contract this imitates.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, webhookId } = await params

    const destination = await prisma.webhookDestination.findFirst({
      where: { id: webhookId, clientId: id },
      include: { client: { select: { businessName: true, slug: true, siteSubdomain: true } } },
    })
    if (!destination) {
      return NextResponse.json({ error: 'Destination not found' }, { status: 404 })
    }

    const site = `https://${destination.client.siteSubdomain || destination.client.slug}.glassleads.app`
    const testPayload = {
      _test: true,

      // Contact
      first_name: 'Test',
      last_name: 'Lead',
      full_name: 'Test Lead',
      phone: '+15555550100',
      email: 'webhook-test@glassleads.app',

      // The job — the fields a shop actually dispatches on. A workflow mapped
      // without these looks fine on the test and loses the job on real leads.
      service: 'windshield-replacement',
      vehicle: '2020 Hyundai Santa Fe',
      postal_code: '97132',
      vin: '',
      insurance: 'not-sure',
      insurance_carrier: '',
      message: `Test delivery from glassleads.app for ${destination.client.businessName}. Safe to ignore or delete.`,

      // Origin
      form_name: 'glassleads-widget',
      contact_source: 'glassleads.app webhook test',
      page: `${site}/`,
      landing_page: `${site}/`,
      referrer: '',

      // Ad attribution. Sent empty rather than omitted so every one of them
      // shows up as a mappable field — a real paid lead fills these in, and
      // by then it is too late to add them to the mapping.
      gclid: '',
      gbraid: '',
      wbraid: '',
      msclkid: '',
      fbclid: '',
      ttclid: '',
      li_fat_id: '',
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_content: '',
      utm_term: '',

      sent_at: new Date().toISOString(),
    }

    const result = await postToDestination(destination.url, testPayload)

    return NextResponse.json({
      success: result.ok,
      responseStatus: result.status,
      error: result.error,
    })
  } catch (error) {
    console.error('Failed to send test delivery:', error)
    return NextResponse.json(
      { error: 'Failed to send test delivery' },
      { status: 500 }
    )
  }
}
