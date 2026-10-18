import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { decrypt, encrypt, isEncryptionConfigured } from '@/lib/encryption'
import { GLASS_SERVICE_PAGES } from '@/lib/site-services'
import { mintTestToken, TEST_TOKEN_PARAM } from '@/lib/lead-test-mode'
import { PRIMARY_DOMAIN_SELECT, siteLinkFor } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Meta (Facebook / Instagram) settings for one shop, its ?v=meta landing
 * page, and California privacy choices.
 *
 * Its own route rather than more fields on PUT /ads-tracking, because that
 * one rebuilds the Google conversions from pasted snippets on every save and
 * has hard-won rules about what an empty box means. Meta has nothing in
 * common with that, and a save here must never be able to touch Google.
 *
 * THE TOKEN. The Pixel id is public — it is in the page source — and stored
 * in the clear. The Conversions API token can send events as this business,
 * so it is encrypted at rest, never returned (only a masked form), and an
 * absent or empty value in a PATCH means "leave it", not "delete it": the
 * card never holds the token, so it cannot send it back on an unrelated save.
 * Clearing is asked for by name.
 */

function mask(key: string): string {
  return key.length <= 10 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

async function view(id: string) {
  const row = await prisma.clientAdsTracking.findUnique({ where: { clientId: id } })
  const token = row?.metaCapiToken ? decrypt(row.metaCapiToken) : null
  return {
    metaPixelId: row?.metaPixelId || '',
    hasToken: !!row?.metaCapiToken,
    // A stored token that will not decrypt is a different problem from none,
    // and it is the one that silently stops every server event.
    tokenUnreadable: !!row?.metaCapiToken && !token,
    tokenMasked: token ? mask(token) : null,
    metaTestEventCode: row?.metaTestEventCode || '',
    metaVariantOffer: row?.metaVariantOffer || '',
    metaVariantExcludedServices: row?.metaVariantExcludedServices || [],
    privacyChoices: row?.privacyChoices ?? false,
    bingCallEventAction: row?.bingCallEventAction || '',
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  try {
    const [meta, recent] = await Promise.all([
      view(id),
      // The last few server events, so "did Meta get it?" is answerable here.
      prisma.metaEventDelivery
        .findMany({
          where: { clientId: id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            eventName: true,
            eventId: true,
            status: true,
            attempts: true,
            lastError: true,
            testEventCode: true,
            createdAt: true,
          },
        })
        .catch(() => []),
    ])
    return NextResponse.json({ meta, recent, services: GLASS_SERVICE_PAGES.map((s) => s.name) })
  } catch {
    return NextResponse.json({ meta: null, unavailable: true })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const data: Record<string, unknown> = {}

  if ('metaPixelId' in body) {
    const raw = str(body.metaPixelId)
    // The whole base code or just the id: the id is the number in fbq('init').
    const id15 = raw.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/)?.[1] ?? raw.match(/^\d{8,20}$/)?.[0] ?? null
    if (raw && !id15) {
      return NextResponse.json(
        { error: 'No Pixel ID in that. Paste the Pixel base code, or just the 15–16 digit Pixel ID from Events Manager.' },
        { status: 400 }
      )
    }
    data.metaPixelId = id15
  }

  if (body.clearToken === true) {
    data.metaCapiToken = null
  } else if (str(body.metaCapiToken)) {
    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        { error: 'ENCRYPTION_KEY is not set on the server, so the token cannot be stored safely. Nothing was saved.' },
        { status: 503 }
      )
    }
    data.metaCapiToken = encrypt(str(body.metaCapiToken))
  }

  if ('metaTestEventCode' in body) {
    const code = str(body.metaTestEventCode)
    if (code && !/^[A-Za-z0-9_-]{3,40}$/.test(code)) {
      return NextResponse.json({ error: 'That does not look like a Test Events code (e.g. TEST12345).' }, { status: 400 })
    }
    data.metaTestEventCode = code || null
  }

  if ('metaVariantOffer' in body) data.metaVariantOffer = str(body.metaVariantOffer).slice(0, 140) || null

  if ('metaVariantExcludedServices' in body) {
    const known = new Set(GLASS_SERVICE_PAGES.map((s) => s.name))
    const list = Array.isArray(body.metaVariantExcludedServices) ? body.metaVariantExcludedServices : []
    data.metaVariantExcludedServices = list.map((s) => String(s)).filter((s) => known.has(s))
  }

  if ('privacyChoices' in body) data.privacyChoices = body.privacyChoices === true

  if ('bingCallEventAction' in body) {
    const action = str(body.bingCallEventAction)
    if (action && !/^[\w .-]{1,60}$/.test(action)) {
      return NextResponse.json({ error: 'Use letters, numbers, spaces, dots, dashes or underscores for the action.' }, { status: 400 })
    }
    data.bingCallEventAction = action || null
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })

  try {
    await prisma.clientAdsTracking.upsert({
      where: { clientId: id },
      update: data,
      create: { clientId: id, ...data },
    })
  } catch (error) {
    console.error('[Meta tracking] save failed:', error)
    return NextResponse.json({ error: 'Could not save — has the database setup run since this deploy?' }, { status: 503 })
  }
  revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true, meta: await view(id) })
}

/**
 * POST — mint a dry-run link (lib/lead-test-mode.ts). The site address with
 * ?gl_test=<token> on it: a submission from that tab is fully processed and
 * answered with what WOULD be stored, and nothing is written, alerted or
 * forwarded. Good for two hours, for this client only.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: { slug: true, siteSubdomain: true, domains: PRIMARY_DOMAIN_SELECT },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const token = mintTestToken(id)
  if (!token) return NextResponse.json({ error: 'No signing key is configured on the server.' }, { status: 503 })
  const base = siteLinkFor(client)
  const sep = base.includes('?') ? '&' : '?'
  return NextResponse.json({
    token,
    url: `${base}${sep}${TEST_TOKEN_PARAM}=${encodeURIComponent(token)}`,
    expiresInMinutes: 120,
  })
}
