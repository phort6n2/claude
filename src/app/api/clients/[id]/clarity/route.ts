import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { decrypt, encrypt, isEncryptionConfigured } from '@/lib/encryption'
import { extractClarityProjectId, fetchClarityInsights, summarise } from '@/lib/clarity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

function mask(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`
}

/**
 * PATCH — this shop's Clarity project id and export token.
 *
 * The two are treated differently on purpose. The PROJECT ID ships in the
 * page source of every landing page — that is how the collector identifies
 * itself — so encrypting it would be theatre. The EXPORT TOKEN reads the data
 * back out and is a real credential.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const data: { clarityProjectId?: string | null; clarityApiToken?: string | null } = {}

  if ('clarityProjectId' in body) {
    const raw = typeof body.clarityProjectId === 'string' ? body.clarityProjectId.trim() : ''
    // Paste the whole snippet if you like — the id is dug out of it. Only a
    // string with no id anywhere in it is refused, because putting a broken
    // loader on a live site is worse than a rejected save.
    const extracted = raw ? extractClarityProjectId(raw) : null
    if (raw && !extracted) {
      return NextResponse.json(
        {
          error:
            'No Clarity project id in that. Paste the whole tracking snippet, the tag URL, or just the short code itself.',
        },
        { status: 400 }
      )
    }
    data.clarityProjectId = extracted
  }

  if ('clarityApiToken' in body) {
    const raw = typeof body.clarityApiToken === 'string' ? body.clarityApiToken.trim() : ''
    if (!raw) {
      data.clarityApiToken = null
    } else {
      if (!isEncryptionConfigured()) {
        return NextResponse.json(
          { error: 'Encryption is not configured on this deployment, so a token cannot be stored.' },
          { status: 503 }
        )
      }
      data.clarityApiToken = encrypt(raw)
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const client = await prisma.client
    .update({
      where: { id },
      data,
      select: { clarityProjectId: true, clarityApiToken: true },
    })
    .catch(() => null)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const plain = client.clarityApiToken ? decrypt(client.clarityApiToken) : null
  return NextResponse.json({
    success: true,
    clarityProjectId: client.clarityProjectId,
    maskedToken: plain ? mask(plain) : null,
    message: 'Saved. The tag goes live on their pages within the hour.',
  })
}

/**
 * POST — read this shop's aggregates.
 *
 * Rate limited hard at their end (a handful of calls per project per day), so
 * this is a button rather than anything scheduled.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const days = Number(body?.days) || 1

  const result = await fetchClarityInsights(id, { days, dimensions: ['URL', 'Device'] })
  return NextResponse.json({
    success: result.ok,
    message: result.message,
    summary: summarise(result.metrics),
    metrics: result.metrics,
  })
}
