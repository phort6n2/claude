import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** GET — the client's Ads conversion settings, or empty defaults. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  try {
    const row = await prisma.clientAdsTracking.findUnique({ where: { clientId: id } })
    return NextResponse.json({
      tracking: {
        conversionId: row?.conversionId || '',
        leadConversionLabel: row?.leadConversionLabel || '',
        callConversionLabel: row?.callConversionLabel || '',
        enhancedConversions: row?.enhancedConversions ?? true,
      },
    })
  } catch {
    // Table not created yet — same shape, all empty.
    return NextResponse.json({
      tracking: {
        conversionId: '',
        leadConversionLabel: '',
        callConversionLabel: '',
        enhancedConversions: true,
      },
    })
  }
}

/**
 * PUT — save the settings.
 *
 * The conversion ID is validated rather than trusted. A malformed ID means a
 * tag that loads and reports nothing, which looks identical to "no leads yet"
 * for however long it takes someone to check — far worse than being told now.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const conversionId = str(body.conversionId)
  const leadConversionLabel = str(body.leadConversionLabel)
  const callConversionLabel = str(body.callConversionLabel)
  const enhancedConversions = body.enhancedConversions !== false

  if (conversionId && !/^AW-[0-9]+$/.test(conversionId)) {
    return NextResponse.json(
      { error: 'Conversion ID must look like AW-123456789.' },
      { status: 400 }
    )
  }
  // A label without an ID has nowhere to send; an ID with no label reports
  // nothing. Both are almost certainly a half-finished paste.
  if (!conversionId && (leadConversionLabel || callConversionLabel)) {
    return NextResponse.json(
      { error: 'Add the conversion ID (AW-…) as well as the label.' },
      { status: 400 }
    )
  }
  if (conversionId && !leadConversionLabel && !callConversionLabel) {
    return NextResponse.json(
      { error: 'Add at least one conversion label, otherwise the tag has nothing to report.' },
      { status: 400 }
    )
  }

  const data = {
    conversionId: conversionId || null,
    leadConversionLabel: leadConversionLabel || null,
    callConversionLabel: callConversionLabel || null,
    enhancedConversions,
  }

  try {
    await prisma.clientAdsTracking.upsert({
      where: { clientId: id },
      update: data,
      create: { clientId: id, ...data },
    })
  } catch (error) {
    console.error('Failed to save ads tracking:', error)
    return NextResponse.json(
      {
        error:
          'Could not save. If this is a fresh deploy, docs/db-setup-ads-tracking.sql has not been run against this database yet.',
      },
      { status: 503 }
    )
  }

  // The tag is rendered server-side on every page of the site.
  revalidatePath(`/sites/${client.slug}`, 'layout')
  return NextResponse.json({ ok: true })
}
