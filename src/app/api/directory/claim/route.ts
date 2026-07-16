import { NextResponse } from 'next/server'
import { z } from 'zod'

// ============================================
// DIRECTORY — FREE LISTING / CLAIM SUBMISSIONS
// ============================================
// This endpoint receives new-listing and claim requests from the public
// directory. For the JSON-seed MVP it validates the payload and logs it — the
// filesystem is read-only on Vercel, so submissions should be forwarded to a
// durable sink. Wire ONE of these in production:
//   1. Insert into the command-center Postgres DB (a `DirectoryLead` table).
//   2. Email yourself via a transactional provider (Resend/SendGrid).
//   3. Push to a CRM / spreadsheet webhook.
// The shape below is stable, so any of those is a drop-in.

const ClaimSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  contactName: z.string().min(2, 'Your name is required'),
  email: z.string().email('A valid email is required'),
  phone: z.string().min(7, 'A valid phone number is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  website: z.string().url().optional().or(z.literal('')),
  // Present when a visitor is claiming an existing listing.
  existingShopSlug: z.string().optional(),
  // Optional interest in the paid upsell — a warm signal for sales.
  wantsMarketingHelp: z.boolean().optional(),
  message: z.string().max(2000).optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ClaimSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const lead = {
    ...parsed.data,
    type: parsed.data.existingShopSlug ? 'claim' : 'new_listing',
    submittedAt: new Date().toISOString(),
  }

  // TODO: replace this log with a durable sink (DB insert / email / webhook).
  console.log('[directory:lead]', JSON.stringify(lead))

  return NextResponse.json({ ok: true }, { status: 201 })
}
