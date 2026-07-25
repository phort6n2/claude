import { unsubscribeSlug } from '@/lib/directory/campaign'

// One-click unsubscribe for the lifecycle drip. Linked from every email footer
// and the List-Unsubscribe header. The token is an HMAC of the slug, so the
// link can't be forged or enumerated. GET renders a confirmation page; POST
// (RFC 8058 one-click) does the same silently for mail clients.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
  <body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:480px;margin:64px auto;padding:0 20px;text-align:center">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:36px 28px">
        <h1 style="margin:0 0 10px;font-size:20px;color:#111827">${title}</h1>
        <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6">${message}</p>
      </div>
    </div>
  </body></html>`
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const slug = (url.searchParams.get('slug') || '').trim()
  const token = (url.searchParams.get('t') || '').trim()
  if (!slug || !token) {
    return page('Invalid link', 'This unsubscribe link is missing information.', 400)
  }
  const ok = await unsubscribeSlug(slug, token)
  if (!ok) {
    return page(
      'Link expired',
      "We couldn't verify this unsubscribe link. Reply to any of our emails and we'll take you off the list.",
      400
    )
  }
  return page(
    "You're unsubscribed",
    "You won't get any more marketing tips from Windshield Repair HQ. Your listing stays exactly as it is.",
    200
  )
}

export async function GET(request: Request) {
  return handle(request)
}
export async function POST(request: Request) {
  return handle(request)
}
