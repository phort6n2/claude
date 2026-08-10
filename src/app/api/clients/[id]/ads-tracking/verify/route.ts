import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { getAdsTracking } from '@/lib/ads-tracking'
import { canonicalHostFor } from '@/lib/site-origin'

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
 * It CANNOT prove Google or Microsoft is receiving conversions. That needs
 * the Ads API, which this project doesn't hold credentials for. So each check
 * says exactly what it verified, and the answer to "is it recording?" points
 * at the place that can actually answer it. A green tick that means less than
 * it appears is worse than no tick.
 */

interface Check {
  label: string
  ok: boolean
  detail: string
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

  return NextResponse.json({ checks, host })
}
