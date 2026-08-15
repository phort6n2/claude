import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { readScanRecord, type HeatmapRecord } from '@/lib/local-dominator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST — which of Local Dominator's URLs can actually be embedded.
 *
 * This exists because guessing was not working. Probing their routes with a
 * made-up `link` token proves nothing: an invalid token and a non-existent
 * route both come back as a refusal, and reading one as the other is how the
 * interactive map got written off as unembeddable.
 *
 * So it probes with the REAL tokens out of a stored payload, with no cookies
 * attached — which is exactly the situation a client's browser is in. A 200
 * here means a signed-out visitor gets the page. Anything else means they
 * get a login screen, whatever it looks like when an admin clicks the link
 * while signed in to Local Dominator.
 */

interface Candidate {
  label: string
  url: string
}

/** Every shape worth trying, given the two links they send. */
function candidatesFor(record: HeatmapRecord): Candidate[] {
  const meta = readScanRecord(record)
  const out: Candidate[] = []

  const add = (label: string, raw: string | null) => {
    if (!raw) return
    try {
      const url = new URL(raw)
      if (url.hostname !== 'app.localdominator.co') return
      out.push({ label, url: url.toString() })

      // The share form of the same path, when it is not already one.
      if (!url.pathname.startsWith('/share/')) {
        const shared = new URL(url.toString())
        shared.pathname = `/share${url.pathname}`
        out.push({ label: `${label} → /share/`, url: shared.toString() })
      }

      // And with a trailing slash, which their router redirects to anyway.
      if (!url.pathname.endsWith('/')) {
        const slashed = new URL(url.toString())
        slashed.pathname = `${url.pathname}/`
        out.push({ label: `${label} (trailing slash)`, url: slashed.toString() })
        if (!url.pathname.startsWith('/share/')) {
          const both = new URL(url.toString())
          both.pathname = `/share${url.pathname}/`
          out.push({ label: `${label} → /share/ (trailing slash)`, url: both.toString() })
        }
      }
    } catch {
      /* not a URL we can use */
    }
  }

  add('image_link', meta.mapImageUrl)
  add('dynamic_url', meta.shareUrl)
  return out
}

interface Probe {
  label: string
  url: string
  status: number | null
  finalUrl: string | null
  landedOnLogin: boolean
  xFrameOptions: string | null
  frameAncestors: string | null
  embeddable: boolean
  note: string
}

async function probe(candidate: Candidate): Promise<Probe> {
  const base: Probe = {
    label: candidate.label,
    url: candidate.url,
    status: null,
    finalUrl: null,
    landedOnLogin: false,
    xFrameOptions: null,
    frameAncestors: null,
    embeddable: false,
    note: '',
  }

  try {
    // No credentials, deliberately: this must reproduce a signed-out client.
    const res = await fetch(candidate.url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })

    const finalUrl = res.url || candidate.url
    const landedOnLogin = /\/login\b|\/signin\b|\/sign-in\b/i.test(finalUrl)
    const xfo = res.headers.get('x-frame-options')
    const csp = res.headers.get('content-security-policy') || ''
    const ancestors = csp.match(/frame-ancestors([^;]*)/i)?.[1]?.trim() || null

    const blockedByXfo = !!xfo && /deny|sameorigin/i.test(xfo)
    const blockedByCsp =
      !!ancestors && !/\*/.test(ancestors) && !/glassleads\.app/i.test(ancestors)

    const embeddable = res.ok && !landedOnLogin && !blockedByXfo && !blockedByCsp

    return {
      ...base,
      status: res.status,
      finalUrl,
      landedOnLogin,
      xFrameOptions: xfo,
      frameAncestors: ancestors,
      embeddable,
      note: embeddable
        ? 'A signed-out visitor gets this page, and it can be framed.'
        : landedOnLogin
          ? 'Redirected to their login — this one only works for someone signed in.'
          : !res.ok
            ? `Refused with ${res.status}.`
            : blockedByXfo
              ? `Loads, but blocks framing (X-Frame-Options: ${xfo}).`
              : `Loads, but blocks framing (frame-ancestors ${ancestors}).`,
    }
  } catch (error) {
    return {
      ...base,
      note: `Could not be reached: ${error instanceof Error ? error.message : 'unknown'}`,
    }
  }
}

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const scan = await prisma.localRankScan
    .findFirst({
      orderBy: { scannedAt: 'desc' },
      select: { id: true, searchTerm: true, scannedAt: true, raw: true },
    })
    .catch(() => null)

  if (!scan?.raw) {
    return NextResponse.json({
      success: false,
      message: 'No stored scan to test with. Wait for a scan to land first.',
    })
  }

  const candidates = candidatesFor(scan.raw as HeatmapRecord)
  if (candidates.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'That scan carried no Local Dominator share links.',
    })
  }

  const probes = await Promise.all(candidates.map(probe))
  // Log the full detail: the summary has to fit in a toast, the answer does not.
  for (const p of probes) {
    console.warn(
      `[LocalRank] embed ${p.label}: status=${p.status} login=${p.landedOnLogin} ` +
        `xfo=${p.xFrameOptions || '-'} frameAncestors=${p.frameAncestors || '-'} ` +
        `embeddable=${p.embeddable} final=${p.finalUrl}`
    )
  }

  const winners = probes.filter((p) => p.embeddable)
  const summary = probes
    .map((p) => `${p.label}: ${p.embeddable ? 'YES' : 'no'} (${p.status ?? 'error'})`)
    .join(' · ')

  return NextResponse.json({
    success: winners.length > 0,
    message:
      winners.length > 0
        ? `Embeddable signed-out: ${winners.map((w) => w.label).join(', ')}. Full results: ${summary}`
        : `Nothing was embeddable signed-out. ${summary}`,
    testedWith: { keyword: scan.searchTerm, scannedAt: scan.scannedAt },
    probes,
  })
}
