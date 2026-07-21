import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { saveQuote, listAllQuotes, type Quote } from '@/lib/directory/quotes'
import { notifyNewQuote } from '@/lib/directory/notify'
import { getShopBySlug } from '@/lib/directory/data'

// Public consumer lead capture + secret-gated agency inbox.
//   POST { shopSlug, name, phone, ... }  → store a quote request (public)
//   GET  (x-upload-secret)               → list all quote requests (agency)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuoteInput = z.object({
  shopSlug: z.string().min(1).max(120),
  shopName: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  phone: z.string().min(5).max(40),
  email: z.string().email().max(200).optional().or(z.literal('')),
  vehicle: z.string().max(120).optional(),
  service: z.string().max(80).optional(),
  message: z.string().max(2000).optional(),
  // Honeypot — must be empty. Bots fill every field.
  company: z.string().max(0).optional(),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = QuoteInput.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please fill in your name and phone number.' }, { status: 400 })
  }
  const input = parsed.data

  // Silently accept-and-drop obvious bots so they don't retry.
  if (input.company) return NextResponse.json({ ok: true })

  // Only accept quotes for shops that actually exist in the directory.
  const shop = getShopBySlug(input.shopSlug)
  if (!shop) {
    return NextResponse.json({ error: 'Unknown shop.' }, { status: 400 })
  }

  const quote: Quote = {
    id: randomUUID(),
    shopSlug: input.shopSlug,
    shopName: shop.name,
    name: input.name,
    phone: input.phone,
    email: input.email || undefined,
    vehicle: input.vehicle || undefined,
    service: input.service || undefined,
    message: input.message || undefined,
    createdAt: new Date().toISOString(),
  }

  const stored = await saveQuote(quote)
  // Email the owner + agency (best-effort, no-op until email is configured).
  await notifyNewQuote(quote, shop)
  // Even if storage isn't configured we return ok — the lead is logged
  // server-side and we never want to show the consumer an error.
  return NextResponse.json({ ok: true, stored })
}

function authed(request: Request): boolean {
  const secret = process.env.DIRECTORY_UPLOAD_SECRET
  return !!secret && request.headers.get('x-upload-secret') === secret
}

export async function GET(request: Request) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const quotes = await listAllQuotes()
  return NextResponse.json({ quotes })
}
