import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { decrypt, encrypt, isEncryptionConfigured } from '@/lib/encryption'
import { syncSeoArticles } from '@/lib/seo-articles'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/** Enough to recognise a key, never enough to use one. */
function mask(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`
}

/**
 * PATCH — this shop's SEO content settings.
 *
 * The key is stored encrypted and never returned in full. The response
 * carries a mask so the admin can tell at a glance that a key is set and
 * which one it is, which is all anyone needs from a screen they are not
 * about to type it into again.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const data: { seoContentEnabled?: boolean; blgApiKey?: string | null } = {}

  if ('seoContentEnabled' in body) data.seoContentEnabled = !!body.seoContentEnabled

  if ('blgApiKey' in body) {
    const raw = typeof body.blgApiKey === 'string' ? body.blgApiKey.trim() : ''
    if (!raw) {
      data.blgApiKey = null
    } else {
      if (!isEncryptionConfigured()) {
        return NextResponse.json(
          { error: 'Encryption is not configured on this deployment, so a key cannot be stored.' },
          { status: 503 }
        )
      }
      data.blgApiKey = encrypt(raw)
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const client = await prisma.client
    .update({
      where: { id },
      data,
      select: { seoContentEnabled: true, blgApiKey: true },
    })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const plain = client.blgApiKey ? decrypt(client.blgApiKey) : null
  return NextResponse.json({
    success: true,
    seoContentEnabled: client.seoContentEnabled,
    hasKey: !!client.blgApiKey,
    maskedKey: plain ? mask(plain) : null,
  })
}

/**
 * POST — test this shop's key, or pull their articles now.
 *
 * Scoped to one client on purpose: a shop whose key was just entered should
 * be provable on the spot, without pulling every other shop's account.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = body?.action === 'test' ? 'test' : 'sync'

  const client = await prisma.client
    .findUnique({ where: { id }, select: { blgApiKey: true, seoContentEnabled: true } })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const apiKey = client.blgApiKey ? decrypt(client.blgApiKey) : null
  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'No key saved for this shop yet.' })
  }

  if (action === 'test') {
    try {
      const res = await fetch(
        'https://api.babylovegrowth.ai/api/integrations/v1/articles?limit=1&offset=0',
        {
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (!res.ok) {
        return NextResponse.json({
          success: false,
          message:
            res.status === 401
              ? 'Rejected — check the key.'
              : `BabyLoveGrowth returned ${res.status}.`,
        })
      }
      const articles = (await res.json().catch(() => null)) as Array<{
        title?: string
        orgWebsite?: string
      }> | null
      if (!Array.isArray(articles) || articles.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'Connected, but this organisation has no articles yet.',
        })
      }
      return NextResponse.json({
        success: true,
        message: `Connected. Newest article: “${articles[0].title || 'untitled'}”${
          articles[0].orgWebsite ? ` (written for ${articles[0].orgWebsite})` : ''
        }.`,
      })
    } catch {
      return NextResponse.json({ success: false, message: 'Could not reach BabyLoveGrowth.' })
    }
  }

  if (!client.seoContentEnabled) {
    return NextResponse.json({
      success: false,
      message: 'Switch SEO content on for this shop before syncing.',
    })
  }

  const result = await syncSeoArticles(id)
  return NextResponse.json({ success: result.ok, message: result.message })
}
