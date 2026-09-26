import { prisma } from '@/lib/db'
import { describeFetchFailure, fetchHtml, validatePublicUrl } from '@/lib/site-import'
import { challengeReason } from '@/lib/social-scan'
import {
  colorsAreReplaceable,
  isOurOwnSite,
  readBrandScheme,
  type BrandReading,
  type LogoColors,
} from '@/lib/brand-colors'

/**
 * Fetch a shop's website and read its colours (the rule is in
 * brand-colors.ts; this is only the fetching and the writing).
 *
 * One page plus a few of its OWN stylesheets. A page builder keeps the shop's
 * choices in generated CSS on the same host (Elementor's post CSS, a combined
 * cache file); plugin and core sheets are skipped by path, and anything on
 * another host — a CDN's framework, Google Fonts — is not the shop's.
 */

const MAX_SHEETS = 4
const MAX_SHEET_BYTES = 600_000
const SHEET_TIMEOUT_MS = 8_000
const SKIP_SHEET = /\/wp-content\/plugins\/|\/wp-includes\/|font|awesome|icon|bootstrap|jquery|slick|swiper|animate/i

async function sameSiteStylesheets(html: string, page: URL): Promise<string[]> {
  const hrefs: string[] = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&#0?38;|&amp;/g, '&')
    if (!href) continue
    let url: URL
    try {
      url = new URL(href, page)
    } catch {
      continue
    }
    const bare = (h: string) => h.replace(/^www\./, '')
    if (bare(url.hostname) !== bare(page.hostname)) continue
    if (SKIP_SHEET.test(url.pathname)) continue
    hrefs.push(url.toString())
    if (hrefs.length >= MAX_SHEETS) break
  }
  const sheets = await Promise.all(
    hrefs.map(async (href) => {
      // Every fetch goes through the guard, and uses what the guard returns.
      const safe = validatePublicUrl(href)
      if (!safe.ok) return ''
      try {
        const res = await fetch(safe.url.toString(), {
          signal: AbortSignal.timeout(SHEET_TIMEOUT_MS),
          headers: { Accept: 'text/css,*/*;q=0.1' },
          redirect: 'follow',
        })
        if (!res.ok || !validatePublicUrl(res.url || safe.url.toString()).ok) return ''
        return (await res.text()).slice(0, MAX_SHEET_BYTES)
      } catch {
        return ''
      }
    })
  )
  return sheets.filter(Boolean)
}

async function logoColorsFor(logoUrl: string | null): Promise<LogoColors | null> {
  if (!logoUrl) return null
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const file = Buffer.from(await res.arrayBuffer())
    if (file.byteLength > 8_000_000) return null
    // Dynamic and guarded: sharp's native binary has gone missing from a
    // deployed function before, and the page is still readable without it.
    const { readLogoColors } = await import('@/lib/logo-surface-measure')
    return await readLogoColors(file)
  } catch {
    return null
  }
}

export async function scanBrandColors(
  rawUrl: string,
  logoUrl: string | null
): Promise<BrandReading & { url?: string }> {
  const check = validatePublicUrl(rawUrl)
  if (!check.ok) return { ok: false, reason: check.error, evidence: [] }
  const url = check.url.toString()

  const page = await fetchHtml(check.url)
  if (!page.ok) return { ok: false, reason: describeFetchFailure(page.failure, url), evidence: [], url }
  const challenged = challengeReason(page.html)
  if (challenged) {
    return {
      ok: false,
      reason: `${check.url.host} ${challenged} — the site is blocking automated visits, so its colours cannot be read. Set them by hand.`,
      evidence: [],
      url,
    }
  }
  if (isOurOwnSite(page.html)) {
    return {
      ok: false,
      reason: `${check.url.host} is the site this platform hosts for them, so it can only show our own colours back. The old site is gone — set the colours by hand, or from their logo.`,
      evidence: [],
      url,
    }
  }

  const [css, logo] = await Promise.all([sameSiteStylesheets(page.html, check.url), logoColorsFor(logoUrl)])
  return { ...readBrandScheme({ html: page.html, css, logo }), url }
}

export interface BrandScanResult {
  clientId: string
  businessName: string
  status: 'updated' | 'unchanged' | 'no-reading' | 'skipped'
  note: string
  colors?: { primaryColor: string; secondaryColor: string; accentColor: string }
}

/**
 * Read one client's website and, when allowed, write what it says.
 *
 * `force` is an operator pressing the button: it overrides colours chosen by
 * hand, because the press IS the choice. Without it, only colours that are
 * still the defaults or that came from the site last time are replaced.
 */
export async function applyBrandScan(
  clientId: string,
  { force = false, dryRun = false }: { force?: boolean; dryRun?: boolean } = {}
): Promise<BrandScanResult> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      slug: true,
      businessName: true,
      websiteUrl: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      brandColorsSource: true,
    },
  })
  if (!client) return { clientId, businessName: '', status: 'skipped', note: 'client not found' }
  const base = { clientId, businessName: client.businessName }

  if (!client.websiteUrl) {
    return { ...base, status: 'skipped', note: 'no website on file (Business tab → Website)' }
  }
  if (!force && !colorsAreReplaceable(client)) {
    return { ...base, status: 'skipped', note: 'colours were chosen by hand — left alone' }
  }
  if (dryRun) return { ...base, status: 'unchanged', note: `would read ${client.websiteUrl}` }

  const reading = await scanBrandColors(client.websiteUrl, client.logoUrl)
  const now = new Date()
  if (!reading.ok) {
    await prisma.client.update({
      where: { id: clientId },
      data: { brandColorsReadAt: now, brandColorsNote: reading.reason },
    })
    return { ...base, status: 'no-reading', note: reading.reason }
  }

  const colors = {
    primaryColor: reading.primary,
    // The site uses secondaryColor nowhere; it is filled so the Branding card
    // shows one scheme rather than the new colours beside a stale default.
    secondaryColor: reading.secondary || reading.accent || reading.primary,
    // No distinct call-to-action colour on their site: keep what is there
    // rather than inventing one (lib/site-theme.ts then uses the primary).
    accentColor: reading.accent || client.accentColor || '#f59e0b',
  }
  const changed =
    colors.primaryColor !== client.primaryColor?.toLowerCase() ||
    colors.secondaryColor !== client.secondaryColor?.toLowerCase() ||
    colors.accentColor !== client.accentColor?.toLowerCase()
  const note = `Read from ${reading.url}: ${reading.evidence.join('; ')}.`
  await prisma.client.update({
    where: { id: clientId },
    data: { ...colors, brandColorsSource: 'site', brandColorsReadAt: now, brandColorsNote: note },
  })
  if (changed) {
    try {
      const { revalidatePath } = await import('next/cache')
      revalidatePath(`/sites/${client.slug}`, 'layout')
    } catch {
      // Outside a request: nothing to revalidate.
    }
  }
  return { ...base, status: changed ? 'updated' : 'unchanged', note, colors }
}

/**
 * The automatic half: every client with a website, colours nobody chose, and
 * no reading yet. Bounded by a time budget, because these are fetches of
 * other people's websites inside a cron that has other work to do; whoever
 * it does not reach is simply read tomorrow.
 */
export async function readUnreadBrandColors({
  dryRun = false,
  budgetMs = 90_000,
}: { dryRun?: boolean; budgetMs?: number } = {}): Promise<BrandScanResult[]> {
  const deadline = Date.now() + budgetMs
  const clients = await prisma.client.findMany({
    where: {
      websiteUrl: { not: null },
      brandColorsReadAt: null,
      // Live clients (ONBOARDING is live — the mistake three modules made).
      status: { in: ['ACTIVE', 'ONBOARDING'] },
    },
    select: { id: true, primaryColor: true, secondaryColor: true, accentColor: true, brandColorsSource: true },
    orderBy: { businessName: 'asc' },
  })
  const out: BrandScanResult[] = []
  for (const c of clients) {
    if (!colorsAreReplaceable(c)) continue
    if (Date.now() > deadline) break
    out.push(await applyBrandScan(c.id, { dryRun }))
  }
  return out
}
