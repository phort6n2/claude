import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { twilioCreds } from '@/lib/twilio-voice'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/twilio/usage
 *
 * What Twilio has cost this month, by category. Admin-only, because it is
 * the platform's bill, not any client's — the per-client story is told by
 * the call stats on each tracking number, which come from our own data.
 *
 * Twilio's Usage Records API does the summing server-side; "ThisMonth" is a
 * calendar-month window. Prices come back as negative-margin strings
 * ("-0.0085" style is not a thing here — they are positive decimal strings),
 * so everything is parsed defensively and rounded for display.
 */
const CATEGORIES = ['totalprice', 'calls', 'sms', 'phonenumbers', 'recordings'] as const

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const creds = await twilioCreds()
  if (!creds) {
    return NextResponse.json({ error: 'No Twilio credentials saved.' }, { status: 400 })
  }

  try {
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Usage/Records/ThisMonth.json?PageSize=200`,
      { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) {
      return NextResponse.json({ error: `Twilio returned HTTP ${res.status}.` }, { status: 400 })
    }
    const data = await res.json()
    const wanted = new Set<string>(CATEGORIES)
    const records = (data.usage_records || [])
      .filter((r: { category?: string }) => wanted.has(String(r.category)))
      .map((r: { category?: string; description?: string; usage?: string; usage_unit?: string; price?: string; price_unit?: string }) => ({
        category: String(r.category || ''),
        description: String(r.description || ''),
        usage: Number(r.usage || 0),
        usageUnit: String(r.usage_unit || ''),
        price: Number(r.price || 0),
        priceUnit: String(r.price_unit || 'usd'),
      }))

    return NextResponse.json({ month: new Date().toISOString().slice(0, 7), records })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Usage lookup failed' },
      { status: 500 }
    )
  }
}
