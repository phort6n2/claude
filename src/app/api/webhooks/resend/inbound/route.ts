import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { secretSetting } from '@/lib/secret-settings'
import { processInboundEmail } from '@/lib/seo-report-inbound'

// ============================================
// RESEND → THE REPORTS INBOX
// ============================================
// Resend POSTs `email.received` here for mail sent to the inbound address
// (reports@…). Set up in Resend: Webhooks → add this URL, event
// `email.received`; put its signing secret in RESEND_INBOUND_SECRET
// (Settings → API keys, or the environment). See lib/seo-report-inbound.ts.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Fetching the email, downloading the PDF and reading it is a few seconds;
// the default leaves no margin on a slow attachment.
export const maxDuration = 60

export async function POST(request: Request) {
  // Raw, not request.json(): the signature is over these exact bytes.
  const raw = await request.text()

  const secret = await secretSetting('RESEND_INBOUND_SECRET')
  if (!secret) {
    // 503, not 401 — "no secret here yet" and "wrong secret" are fixed in
    // different places. Same split as the directory-signals receiver.
    return NextResponse.json(
      { error: 'RESEND_INBOUND_SECRET is not set, so no delivery can be verified.' },
      { status: 503 }
    )
  }

  let event: { type?: string; data?: { email_id?: string } }
  try {
    // verify() checks the Svix signature locally; the key is only needed to
    // construct the client, and a placeholder makes no request.
    const resend = new Resend((await secretSetting('RESEND_API_KEY')) || 're_placeholder')
    event = resend.webhooks.verify({
      payload: raw,
      // Resend has signed with both spellings of these headers — the Svix
      // names and the Standard Webhooks names — so either is read.
      headers: {
        id: header(request, 'id'),
        timestamp: header(request, 'timestamp'),
        signature: header(request, 'signature'),
      },
      webhookSecret: secret,
    }) as typeof event
  } catch {
    return NextResponse.json({ error: 'Signature did not verify.' }, { status: 401 })
  }

  // Any other event type is acknowledged and ignored, so a webhook subscribed
  // to more than it needs does not retry forever.
  if (event.type !== 'email.received' || !event.data?.email_id) {
    return new Response(null, { status: 204 })
  }

  try {
    const result = await processInboundEmail(event.data.email_id)
    console.log('[Reports inbox]', event.data.email_id, JSON.stringify(result))
    return NextResponse.json(result)
  } catch (err) {
    // Only a failure to FETCH lands here — Resend unreachable, a key that
    // cannot read received mail. 500 so Resend retries; everything that can be
    // decided about the email itself was stored with its reason and answered 200.
    const message = err instanceof Error ? err.message : 'failed'
    console.error('[Reports inbox] could not process', event.data.email_id, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function header(request: Request, name: 'id' | 'timestamp' | 'signature'): string {
  return request.headers.get(`svix-${name}`) || request.headers.get(`webhook-${name}`) || ''
}
