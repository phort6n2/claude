import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import {
  listUploadActions,
  findUploadCandidates,
  uploadBookedJobs,
} from '@/lib/google-ads-offline'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * Offline conversion upload for one client — admin only, deliberately.
 *
 * This writes revenue figures into a Google Ads account and changes how it
 * bids. It is the user's own MCC and the user's own money; a client should
 * not be able to reach it, and neither should anything automatic until it has
 * been dry-run at least once.
 */

async function loadContext(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, businessName: true, adsTracking: true },
  })
  return client
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params

  const client = await loadContext(id).catch(() => null)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const customerId = client.adsTracking?.googleAdsCustomerId || null
  const candidates = await findUploadCandidates(id)

  // Everything the card needs to explain itself, including why it cannot do
  // anything yet — "not configured" with no reason is how a feature quietly
  // never gets switched on.
  const base = {
    customerId,
    actionId: client.adsTracking?.offlineConversionActionId || null,
    pending: candidates.length,
    pendingValue: candidates.reduce((sum, c) => sum + c.value, 0),
    examples: candidates.slice(0, 5).map((c) => ({
      name: c.customerName,
      value: c.value,
      soldAt: c.soldAt.toISOString(),
    })),
  }

  if (!customerId) {
    return NextResponse.json({
      ...base,
      actions: [],
      blocked: 'No Google Ads account is linked to this client yet.',
    })
  }

  const actions = await listUploadActions(customerId)
  return NextResponse.json({
    ...base,
    actions: actions.ok ? actions.actions : [],
    blocked: actions.ok
      ? actions.actions.length === 0
        ? 'This account has no "import from clicks" conversion action. Create one in Google Ads (Goals → Conversions → New → Import → Manual import) and it will appear here.'
        : null
      : actions.error,
  })
}

/** PUT — choose which conversion action booked jobs go to. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const actionId = String(body.actionId || '').trim() || null

  try {
    await prisma.clientAdsTracking.upsert({
      where: { clientId: id },
      update: { offlineConversionActionId: actionId },
      create: { clientId: id, offlineConversionActionId: actionId },
    })
    return NextResponse.json({ ok: true, actionId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      { status: 500 }
    )
  }
}

/** POST — upload. `dryRun` asks Google to validate and record nothing. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const dryRun = body.dryRun !== false

  const client = await loadContext(id).catch(() => null)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const customerId = client.adsTracking?.googleAdsCustomerId
  const actionId = client.adsTracking?.offlineConversionActionId
  if (!customerId) {
    return NextResponse.json({ error: 'No Google Ads account linked.' }, { status: 400 })
  }
  if (!actionId) {
    return NextResponse.json({ error: 'Pick a conversion action first.' }, { status: 400 })
  }

  const outcome = await uploadBookedJobs({
    clientId: id,
    customerId,
    actionId,
    validateOnly: dryRun,
  })
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 400 })
}
