import { NextResponse } from 'next/server'
import {
  verifySignature,
  signalsEnabled,
  recordSignal,
  emailNewSignals,
  type IncomingEvent,
} from '@/lib/directory-signals'

// ============================================
// WINDSHIELD REPAIR HQ → SHOP SIGNALS
// ============================================
// The directory POSTs here whenever a shop does something that says they are
// in the market. Set AGMP_WEBHOOK_URL over there to this address, and
// AGMP_WEBHOOK_SECRET to the same value as WRHQ_EVENT_SECRET here.
//
// Accepts one event or an array of them, because a backfill of everything
// that happened before this endpoint existed is a natural thing to want and a
// second route for it would be a second copy of the same handling.
//
// SHOP DATA ONLY. The directory's promise is that a consumer quote request
// belongs to the one shop it was sent to and is never handed to the agency as
// a prospect list. Nothing in this payload carries one — do not add a reader
// here that expects otherwise.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Raw, not request.json(): the signature is over these exact bytes, and
  // re-serialising a parsed object changes them.
  const raw = await request.text()

  if (!(await signalsEnabled())) {
    // 503, not 401. The difference matters to whoever is setting this up: one
    // says "you have the wrong secret", the other says "there is no secret
    // here yet", and they are fixed in different places.
    return NextResponse.json(
      { error: 'WRHQ_EVENT_SECRET is not set, so no event can be verified.' },
      { status: 503 }
    )
  }
  if (!(await verifySignature(raw, request.headers.get('x-wrhq-signature')))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const events: IncomingEvent[] = Array.isArray(body)
    ? (body as IncomingEvent[])
    : [body as IncomingEvent]
  if (events.length > 200) {
    return NextResponse.json({ error: 'Too many events in one post' }, { status: 413 })
  }

  const stored: string[] = []
  let duplicates = 0
  const errors: string[] = []
  for (const event of events) {
    const res = await recordSignal(event)
    if (res.stored && res.id) stored.push(res.id)
    else if (res.duplicate) duplicates++
    else if (res.error) errors.push(res.error)
  }

  /* The email is awaited but its failure is NOT the endpoint's failure.
     Answering non-2xx would make the directory retry an event that is already
     stored, and the retry would dedupe to nothing — so the signal would be in
     the list, the email would never arrive, and the logs would show a webhook
     failing repeatedly over something that actually worked. */
  const notified = stored.length ? await emailNewSignals(stored) : { sent: false }

  return NextResponse.json({
    ok: errors.length === 0,
    received: events.length,
    stored: stored.length,
    duplicates,
    emailed: notified.sent,
    ...(notified.error ? { emailError: notified.error } : {}),
    ...(errors.length ? { errors } : {}),
  })
}

/** Lets whoever is wiring this up confirm the address is right before signing. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'wrhq-events',
    configured: await signalsEnabled(),
  })
}
