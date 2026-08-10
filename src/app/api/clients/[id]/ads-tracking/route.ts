import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { parseCallSnippet, parseLeadSnippet } from '@/lib/ads-snippet'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** GET — what is configured now, in the shape the card renders. */
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
        leadValue: row?.leadValue ?? null,
        leadCurrency: row?.leadCurrency || '',
        callConversionLabel: row?.callConversionLabel || '',
        callPhoneNumber: row?.callPhoneNumber || '',
        enhancedConversions: row?.enhancedConversions ?? true,
        bingUetTagId: row?.bingUetTagId || '',
        bingLeadEventAction: row?.bingLeadEventAction || '',
        googleAdsCustomerId: row?.googleAdsCustomerId || '',
      },
    })
  } catch {
    // Table not created yet — same shape, all empty.
    return NextResponse.json({ tracking: null, unavailable: true })
  }
}

/**
 * PUT — save from the snippets Google Ads produced.
 *
 * The operator pastes blocks of JavaScript; this pulls the conversion out of
 * them. Nothing is inferred: a snippet that doesn't contain a conversion is
 * rejected with what was wrong, because a tag that loads and silently reports
 * nothing is indistinguishable from "no leads yet" until somebody thinks to
 * check.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { slug: true } })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const leadInput = str(body.leadSnippet)
  const callInput = str(body.callSnippet)
  const enhancedConversions = body.enhancedConversions !== false

  // Microsoft: accept the whole UET tracking code or just the id. The id is
  // the `ti` field in the snippet, and pasting the block is easier than
  // finding the number inside it.
  const bingRaw = str(body.bingUetTagId)
  const bingUetTagId = bingRaw
    ? (bingRaw.match(/ti\s*:\s*["']?(\d{6,12})["']?/)?.[1] ?? bingRaw.match(/^\d{6,12}$/)?.[0] ?? null)
    : null
  if (bingRaw && !bingUetTagId) {
    return NextResponse.json(
      {
        error:
          'No UET tag ID found. Paste the whole tracking code, or just the 8–9 digit tag ID from Microsoft Advertising.',
      },
      { status: 400 }
    )
  }
  const bingLeadEventAction = bingUetTagId ? str(body.bingLeadEventAction) || 'submit_lead_form' : null

  // Which Ads account to interrogate when checking whether conversions are
  // actually recording. Digits only; an empty pick clears it.
  const googleAdsCustomerId = str(body.googleAdsCustomerId).replace(/\D/g, '') || null

  const data: {
    conversionId: string | null
    leadConversionLabel: string | null
    leadValue: number | null
    leadCurrency: string | null
    callConversionLabel: string | null
    callPhoneNumber: string | null
    enhancedConversions: boolean
    bingUetTagId: string | null
    bingLeadEventAction: string | null
    googleAdsCustomerId: string | null
  } = {
    conversionId: null,
    leadConversionLabel: null,
    leadValue: null,
    leadCurrency: null,
    callConversionLabel: null,
    callPhoneNumber: null,
    enhancedConversions,
    bingUetTagId,
    bingLeadEventAction,
    googleAdsCustomerId,
  }

  if (leadInput) {
    const parsed = parseLeadSnippet(leadInput)
    if (!parsed.ok || !parsed.value) {
      return NextResponse.json({ error: `Lead snippet: ${parsed.error}` }, { status: 400 })
    }
    data.conversionId = parsed.value.conversionId
    data.leadConversionLabel = parsed.value.leadConversionLabel
    data.leadValue = parsed.value.value
    data.leadCurrency = parsed.value.currency
  }

  if (callInput) {
    const parsed = parseCallSnippet(callInput)
    if (!parsed.ok || !parsed.value) {
      return NextResponse.json({ error: `Call snippet: ${parsed.error}` }, { status: 400 })
    }
    // Both actions live in one Ads account. Two different accounts in one
    // site's tag would mean one of them silently never receives anything.
    if (data.conversionId && data.conversionId !== parsed.value.conversionId) {
      return NextResponse.json(
        {
          error: `Those snippets are from two different Ads accounts (${data.conversionId} and ${parsed.value.conversionId}). Both conversions have to come from the same account.`,
        },
        { status: 400 }
      )
    }
    data.conversionId = parsed.value.conversionId
    data.callConversionLabel = parsed.value.callConversionLabel
    data.callPhoneNumber = parsed.value.phoneNumber
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

  return NextResponse.json({
    ok: true,
    parsed: {
      conversionId: data.conversionId,
      leadConversionLabel: data.leadConversionLabel,
      leadValue: data.leadValue,
      leadCurrency: data.leadCurrency,
      callConversionLabel: data.callConversionLabel,
      callPhoneNumber: data.callPhoneNumber,
      bingUetTagId: data.bingUetTagId,
      bingLeadEventAction: data.bingLeadEventAction,
      googleAdsCustomerId: data.googleAdsCustomerId,
    },
  })
}
