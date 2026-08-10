import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { getAdsTracking } from '@/lib/ads-tracking'
import { canonicalHostFor } from '@/lib/site-origin'
import { getAdsCredentials, listConversionActions } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Check that the tags are actually on the live site.
 *
 * Be precise about what this can and cannot prove. It fetches the published
 * page and looks for the tags, which catches everything that goes wrong on
 * OUR side: saved but not deployed, ISR still serving a cached page, an ID
 * typo'd into the wrong field, a conversion configured for a client whose
 * site isn't live.
 *
 * The page fetch alone cannot prove Google is receiving anything, so when Ads
 * API credentials and an account are configured the second half of this asks
 * Google directly: does the action behind that label exist, is it enabled, has
 * it recorded anything in 30 days. Microsoft has no equivalent here — that
 * half stays installation-only and says so.
 *
 * Each check states exactly what it verified. A green tick that means less
 * than it appears is worse than no tick.
 */

interface Check {
  label: string
  ok: boolean
  detail: string
  /**
   * True when this check did not run and that is a legitimate configuration,
   * not a fault. Only some clients' Ads accounts sit under our manager
   * account; the rest can only ever get the page-level checks, and marking
   * that with a red cross would train the operator to ignore red crosses.
   */
  info?: boolean
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      slug: true,
      siteSubdomain: true,
      status: true,
      domains: {
        where: { isPrimary: true },
        select: { domain: true, verified: true, misconfigured: true },
        take: 1,
      },
    },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const tracking = await getAdsTracking(id)
  if (!tracking) {
    return NextResponse.json({
      checks: [
        {
          label: 'Configuration',
          ok: false,
          detail: 'Nothing configured yet — paste a snippet above first.',
        },
      ],
    })
  }

  const host = canonicalHostFor(client)
  const url = `https://${host}/?tagcheck=${Date.now()}`

  const checks: Check[] = []

  if (client.status !== 'ACTIVE') {
    checks.push({
      label: 'Site is live',
      ok: false,
      detail: `Client status is ${client.status}, so the site serves an unavailable page and no tag loads.`,
    })
  }

  let html = ''
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'glassleads-tag-check' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      checks.push({
        label: 'Site responds',
        ok: false,
        detail: `https://${host}/ returned ${res.status}.`,
      })
      return NextResponse.json({ checks, host })
    }
    // Inline scripts arrive inside Next's JSON payload, where every quote is
    // backslash-escaped — so a naive search for "submit_lead_form" finds
    // nothing on a page that plainly contains it. Unescape before matching.
    html = (await res.text()).replace(/\\"/g, '"')
    checks.push({ label: 'Site responds', ok: true, detail: `Fetched https://${host}/` })
  } catch (error) {
    checks.push({
      label: 'Site responds',
      ok: false,
      detail: error instanceof Error ? error.message : 'Could not reach the site.',
    })
    return NextResponse.json({ checks, host })
  }

  if (tracking.conversionId) {
    const loader = html.includes(`googletagmanager.com/gtag/js?id=${tracking.conversionId}`)
    checks.push({
      label: 'Google tag on the page',
      ok: loader,
      detail: loader
        ? `Loading ${tracking.conversionId}.`
        : 'Not found in the published HTML. If you just saved, the page is cached for up to 5 minutes.',
    })

    if (tracking.leadSendTo) {
      const present = html.includes(tracking.leadSendTo)
      checks.push({
        label: 'Form-lead conversion wired up',
        ok: present,
        detail: present
          ? `The page will report to ${tracking.leadSendTo} when the form succeeds.`
          : 'The lead conversion is saved but not in the page yet.',
      })
    }

    if (tracking.callSendTo && tracking.callPhoneNumber) {
      const present = html.includes('phone_conversion_number') && html.includes(tracking.callPhoneNumber)
      checks.push({
        label: 'Call tracking wired up',
        ok: present,
        detail: present
          ? `Google will swap ${tracking.callPhoneNumber} on the page.`
          : 'The call conversion is saved but the number is not in the page yet.',
      })
      // A swap can only happen if the number is actually printed somewhere.
      // Compared digit-only, because the page may format it differently from
      // the way it was typed into Google.
      const digits = tracking.callPhoneNumber.replace(/\D/g, '')
      const tooShort = digits.length < 10
      const printed = !tooShort && html.replace(/\D/g, '').includes(digits)
      checks.push({
        label: 'That number appears on the page',
        ok: printed,
        detail: tooShort
          ? `"${tracking.callPhoneNumber}" is only ${digits.length} digits — that is not a complete phone number, so Google has nothing to match.`
          : printed
            ? 'Google can find it to swap it.'
            : `The site never prints ${tracking.callPhoneNumber}. Google swaps by matching the number on the page, so nothing will be replaced or counted — it has to match the client's phone exactly.`,
      })
    }
  }

  if (tracking.bingUetTagId) {
    const uet = html.includes('bat.bing.com/bat.js') && html.includes(tracking.bingUetTagId)
    checks.push({
      label: 'Microsoft UET tag on the page',
      ok: uet,
      detail: uet ? `Loading tag ${tracking.bingUetTagId}.` : 'Not found in the published HTML.',
    })
    if (tracking.bingLeadEventAction) {
      const action = html.includes(`"${tracking.bingLeadEventAction}"`)
      checks.push({
        label: 'Microsoft event action wired up',
        ok: action,
        detail: action
          ? `The page will push "${tracking.bingLeadEventAction}". The goal in Microsoft must use this exact string.`
          : 'The action name is not in the page yet.',
      })
    }
  }

  // ---- The other half: ask Google, not the page ----
  //
  // Only runs when there is something to ask about. Everything below degrades
  // to a note rather than a failure: not having the API set up is a normal
  // state, and a red cross for it would read as "your tracking is broken".
  if (tracking.leadSendTo || tracking.callSendTo) {
    const row = await prisma.clientAdsTracking
      .findUnique({ where: { clientId: id }, select: { googleAdsCustomerId: true } })
      .catch(() => null)
    const customerId = row?.googleAdsCustomerId || ''
    const creds = await getAdsCredentials()

    if (!creds) {
      checks.push({
        label: 'Google is counting them',
        ok: false,
        info: true,
        detail:
          'Not checked — no Google Ads API credentials in Settings → API keys. Google Ads → Goals → Conversions shows this under the action’s status.',
      })
    } else if (!customerId) {
      // The common, permanent case for a client whose Ads account is their
      // own. Everything above still verified the tag is installed and firing
      // correctly; only the "did Google receive it" half is unavailable.
      checks.push({
        label: 'Google is counting them',
        ok: false,
        info: true,
        detail:
          'Not checked — this client has no Google Ads account selected, which is expected when their account is not under your manager account. The tag checks above still apply; only Google’s own count is unavailable. To see it, either link their account to your MCC or check Goals → Conversions in their account.',
      })
    } else {
      const result = await listConversionActions(customerId)
      if (!result.ok) {
        checks.push({
          label: 'Google is counting them',
          ok: false,
          detail: `Could not ask Google: ${result.error}`,
        })
      } else {
        const report = (what: string, sendTo: string) => {
          const action = result.actions.find((a) => a.sendTo.includes(sendTo))
          if (!action) {
            checks.push({
              label: `${what}: the action exists in Google Ads`,
              ok: false,
              detail: `No conversion action in account ${customerId} reports to ${sendTo}. Either the snippet came from a different account, or the action was deleted after it was pasted here.`,
            })
            return
          }
          const enabled = action.status === 'ENABLED'
          checks.push({
            label: `${what}: the action exists in Google Ads`,
            ok: enabled,
            detail: enabled
              ? `"${action.name}" is enabled.`
              : `"${action.name}" exists but its status is ${action.status}, so nothing sent to it is counted.`,
          })
          checks.push({
            label: `${what}: conversions in the last 30 days`,
            ok: action.conversions30d > 0,
            detail:
              action.conversions30d > 0
                ? `${action.conversions30d} recorded against "${action.name}".`
                : `None recorded. If the tag checks above are green, that means the page is set up and nobody has converted yet — not that it is broken. Google also takes up to 3 hours to show a first conversion.`,
          })
        }
        if (tracking.leadSendTo) report('Form leads', tracking.leadSendTo)
        if (tracking.callSendTo) report('Calls', tracking.callSendTo)
      }
    }
  }

  return NextResponse.json({ checks, host })
}
