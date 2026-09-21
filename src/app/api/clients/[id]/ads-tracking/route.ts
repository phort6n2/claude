import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { parseCallSnippet, parseLeadSnippet, isAccountMove } from '@/lib/ads-snippet'

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
        ga4MeasurementId: row?.ga4MeasurementId || '',
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

  // An EMPTY snippet box means "leave this conversion alone", not "delete
  // it". It used to mean delete, and that lost live conversions: the card
  // blanks both boxes after a successful save, so coming back later to pick
  // an Ads account, change the Bing tag or untick enhanced conversions
  // submitted two empty snippets and wiped the form-lead and call
  // conversions the card was still reporting as configured. No error, no
  // warning, and nothing to notice until booked jobs stopped reaching Google
  // — which is the one loop this product is built around. Clearing is now
  // something you ask for by name.
  const existing = await prisma.clientAdsTracking
    .findUnique({ where: { clientId: id } })
    .catch(() => null)

  /* MOVING TO A DIFFERENT ADS ACCOUNT CLEARS THE CONVERSIONS — a blank slate
     is the only honest state once the account changes. The rule, and the
     three neighbouring cases that must NOT clear, live in `isAccountMove`
     with the incident that produced them. */
  const existingAccount = existing?.googleAdsCustomerId || ''
  const accountMoved = isAccountMove(existingAccount, googleAdsCustomerId)

  const keepLead = !accountMoved && !leadInput && body.clearLead !== true && !!existing
  const keepCall = !accountMoved && !callInput && body.clearCall !== true && !!existing

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
    ga4MeasurementId: string | null
  } = {
    // Both conversions live in one Ads account, so the account id survives as
    // long as either of them does.
    conversionId: keepLead || keepCall ? (existing?.conversionId ?? null) : null,
    leadConversionLabel: keepLead ? (existing?.leadConversionLabel ?? null) : null,
    leadValue: keepLead ? (existing?.leadValue ?? null) : null,
    leadCurrency: keepLead ? (existing?.leadCurrency ?? null) : null,
    callConversionLabel: keepCall ? (existing?.callConversionLabel ?? null) : null,
    callPhoneNumber: keepCall ? (existing?.callPhoneNumber ?? null) : null,
    enhancedConversions,
    bingUetTagId,
    bingLeadEventAction,
    googleAdsCustomerId,
    // Analytics is not a conversion. It survives clearing the Ads snippets,
    // because a shop that stops advertising has not stopped wanting to know
    // what their site does — and it is only rewritten when the key is
    // actually present, so a save from the ads panel cannot blank it.
    ga4MeasurementId: Object.prototype.hasOwnProperty.call(body, 'ga4MeasurementId')
      ? str(body.ga4MeasurementId) || null
      : (existing?.ga4MeasurementId ?? null),
  }

  if (leadInput) {
    const parsed = parseLeadSnippet(leadInput)
    if (!parsed.ok || !parsed.value) {
      return NextResponse.json({ error: `Lead snippet: ${parsed.error}` }, { status: 400 })
    }
    /* The same one-account rule the call branch enforces, in the other
       direction: a new lead snippet must not orphan a call conversion that is
       being kept from a different account.

       THIS REFUSAL IS ALMOST ALWAYS AN ACCOUNT MOVE IN PROGRESS. A shop whose
       Ads account is replaced — a suspension, a billing mess, an agency
       handover — gets the new account picked on the card, which moves the
       customer id and leaves both conversion snippets pointing at the old
       one. The operator then pastes the new lead snippet, the first box on
       the card, and lands here. The rule is right and the moment is right;
       what was missing was naming what is actually happening, so the refusal
       read as the app rejecting a correct snippet rather than as it catching
       a half-finished move. Pasting BOTH snippets in one save has always
       worked — both boxes filled means neither old conversion is kept — so
       the message leads with that. */
    if (keepCall && data.conversionId && data.conversionId !== parsed.value.conversionId) {
      return NextResponse.json(
        {
          error:
            `Moving this shop to a new Ads account? Paste the CALL snippet from ${parsed.value.conversionId} ` +
            `into the box below and save both together — that replaces the pair in one go. ` +
            `On its own, this lead snippet (${parsed.value.conversionId}) would leave the saved call ` +
            `conversion from ${data.conversionId} behind, and one site cannot report to two Ads accounts: ` +
            `whichever one loses is silently never credited again. ` +
            `If this shop genuinely has no call conversion any more, press Remove on the "Calls from the ` +
            `website" row first, then paste this snippet again.`,
        },
        { status: 400 }
      )
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

  // The account id exists only to address those two conversions. Carried
  // past the last of them it would put Google's loader on the site with
  // nothing to report — a tag that fires and credits nothing, which is the
  // exact state this card exists to make visible.
  if (!data.leadConversionLabel && !data.callConversionLabel) {
    data.conversionId = null
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
    /* The card has to be able to SAY what the move did. A save that silently
       empties two configured conversions is the same invisible change this
       whole block exists to stop, just in the other direction — so the clear
       is reported, with the account it belonged to, and the card repeats it
       to the operator instead of quietly showing two empty rows. */
    accountMoved: accountMoved
      ? {
          from: existingAccount,
          to: googleAdsCustomerId,
          clearedConversionId: existing?.conversionId || null,
          clearedLead: !!existing?.leadConversionLabel,
          clearedCall: !!existing?.callConversionLabel,
        }
      : null,
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
