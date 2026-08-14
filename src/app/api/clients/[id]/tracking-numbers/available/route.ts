import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { twilioCreds } from '@/lib/twilio-voice'

export const dynamic = 'force-dynamic'

/**
 * GET /api/clients/[id]/tracking-numbers/available?areaCode=805
 *
 * Numbers Twilio has for sale in an area code, so a tracking number can be
 * bought without leaving the client's page. Search is free; nothing here
 * spends money — purchasing happens in the main route, deliberately as a
 * separate, explicit call.
 *
 * Local numbers only. A shop's tracking number should look like a neighbour
 * calling, and a toll-free number on a local ad reads as a call centre.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const areaCode = (new URL(request.url).searchParams.get('areaCode') || '').replace(/\D/g, '')
  if (areaCode.length !== 3) {
    return NextResponse.json({ error: 'Enter a three-digit area code.' }, { status: 400 })
  }

  const creds = await twilioCreds()
  if (!creds) {
    return NextResponse.json({ error: 'No Twilio credentials saved.' }, { status: 400 })
  }

  try {
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&VoiceEnabled=true&PageSize=10`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) {
      return NextResponse.json({ error: `Twilio returned HTTP ${res.status}.` }, { status: 400 })
    }
    const data = await res.json()
    const numbers = (data.available_phone_numbers || []).map(
      (n: { phone_number?: string; friendly_name?: string; locality?: string; region?: string }) => ({
        phoneNumber: String(n.phone_number || ''),
        friendlyName: String(n.friendly_name || ''),
        locality: String(n.locality || ''),
        region: String(n.region || ''),
      })
    )
    return NextResponse.json({ numbers })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Search failed' },
      { status: 500 }
    )
  }
}
