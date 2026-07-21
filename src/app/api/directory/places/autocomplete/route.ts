import { NextResponse } from 'next/server'

// Server-side proxy for Google Places Autocomplete so the API key never reaches
// the browser. Powers the "find your business" picker on the claim page.
// Requires 3+ characters to avoid needless calls.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function apiKey(): string {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
}

export async function POST(request: Request) {
  const key = apiKey()
  const body = await request.json().catch(() => ({}))
  const input = String(body?.input ?? '').trim()
  if (!key || input.length < 3) return NextResponse.json({ predictions: [] })

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input, includedRegionCodes: ['us'] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return NextResponse.json({ predictions: [] })
    const d = await res.json()
    const predictions = (d.suggestions ?? [])
      .map((s: { placePrediction?: unknown }) => s.placePrediction)
      .filter(Boolean)
      .map((p: {
        placeId: string
        text?: { text?: string }
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
      }) => ({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondary: p.structuredFormat?.secondaryText?.text ?? '',
      }))
      .filter((p: { placeId: string; primary: string }) => p.placeId && p.primary)
    return NextResponse.json({ predictions })
  } catch {
    return NextResponse.json({ predictions: [] })
  }
}
