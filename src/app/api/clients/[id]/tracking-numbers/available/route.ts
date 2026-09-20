import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-guard'
import { twilioCreds } from '@/lib/twilio-voice'
import { twilioCountryFor, countryName } from '@/lib/phone-country'

export const dynamic = 'force-dynamic'

/**
 * GET /api/clients/[id]/tracking-numbers/available?areaCode=604
 *
 * Numbers Twilio has for sale in an area code, so a tracking number can be
 * bought without leaving the client's page. Search is free; nothing here
 * spends money — purchasing happens in the main route, deliberately as a
 * separate, explicit call.
 *
 * Local numbers only. A shop's tracking number should look like a neighbour
 * calling, and a toll-free number on a local ad reads as a call centre.
 *
 * THE COUNTRY IS IN THE PATH, AND IT WAS HARDCODED `US`. The route takes a
 * client id and never read it, so a British Columbian shop's 604 was searched
 * against the US inventory — a valid request that answers HTTP 200 with an
 * empty list, because the two countries share +1 and the same area-code plan.
 * Indistinguishable from "Twilio has none left in 805". The operator pressed
 * it, nothing appeared, and there was nothing anywhere to read. See
 * lib/phone-country.ts.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const areaCode = (new URL(request.url).searchParams.get('areaCode') || '').replace(/\D/g, '')
  if (areaCode.length !== 3) {
    return NextResponse.json({ error: 'Enter a three-digit area code.' }, { status: 400 })
  }

  const client = await prisma.client.findUnique({
    where: { id },
    select: { country: true, state: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const creds = await twilioCreds()
  if (!creds) {
    return NextResponse.json({ error: 'No Twilio credentials saved.' }, { status: 400 })
  }

  const { country, reason } = twilioCountryFor(client)
  const where = countryName(country)

  try {
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/AvailablePhoneNumbers/${country}/Local.json?AreaCode=${areaCode}&VoiceEnabled=true&PageSize=10`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) }
    )
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      /* TWILIO'S OWN WORDS, not the status code. A refusal here is usually
         about the ACCOUNT rather than the request — a country not enabled on
         it, or a regulatory requirement for that country's local numbers —
         and Twilio says which in `message`, with a `code` that can be looked
         up. "Twilio returned HTTP 400" is the one sentence that cannot be
         acted on, and it was all this route ever said. */
      const message = typeof data?.message === 'string' ? data.message : ''
      const code = data?.code ? ` (Twilio code ${data.code})` : ''
      return NextResponse.json(
        {
          error: message
            ? `Twilio refused the search in ${where}${code}: ${message}`
            : `Twilio returned HTTP ${res.status} searching ${where}.`,
          country,
        },
        { status: 400 }
      )
    }

    const numbers = ((data?.available_phone_numbers || []) as Array<{
      phone_number?: string
      friendly_name?: string
      locality?: string
      region?: string
    }>).map((n) => ({
      phoneNumber: String(n.phone_number || ''),
      friendlyName: String(n.friendly_name || ''),
      locality: String(n.locality || ''),
      region: String(n.region || ''),
    }))

    return NextResponse.json({
      numbers,
      country,
      countryName: where,
      /* AN EMPTY LIST IS AN ANSWER AND HAS TO READ AS ONE. The two reasons it
         can be empty — wrong country, or genuinely none for sale — look
         identical from here, so the note names the country that was searched
         and why, and the operator can tell them apart at a glance. */
      note:
        numbers.length === 0
          ? `No numbers for sale in ${areaCode} in ${where} right now. This searched ${where} because ${reason} — if that is the wrong country, fix the client's country or province on the Business tab. Otherwise try a neighbouring area code.`
          : null,
      searchedBecause: reason,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}
