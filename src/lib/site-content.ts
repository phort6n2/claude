import { prisma } from '@/lib/db'
import {
  programFor,
  readProgramRecord,
  type InsuranceProgram,
  type ProgramRecord,
} from '@/lib/insurance-programs'

/**
 * Editorial content + photos for hosted sites. Reads are defensive: if the
 * tables don't exist yet (code deployed before the SQL ran) every section
 * simply strips, matching the design rule that empty content removes its
 * band rather than rendering a shell.
 */

export interface FaqItem {
  q: string
  a: string
}

export interface HeroBullet {
  lead: string
  text: string
}

export interface SiteChapter {
  heading: string
  body: string
  photoUrl: string
}

export interface SiteExtras {
  warrantyTitle: string | null
  warrantyText: string | null
  faq: FaqItem[]
  heroBullets: HeroBullet[]
  chapters: SiteChapter[]
  footerBlurb: string | null
  registrationName: string | null
  registrationNumber: string | null
  galleryPhotos: Array<{ url: string; alt: string }>
  bodyPhotos: Array<{ url: string; alt: string }>
  /**
   * The line under a service page's H1, per service slug, for THIS shop.
   *
   * The template's line ("Full windshield replacement with quality glass and
   * professional installation.") is true for every shop and says nothing a
   * paid visitor came for. On a phone it is the only copy between the H1 and
   * the form, so it is the whole first screen — and AGS needed theirs to say
   * mobile, ICBC, ADAS, warranty and a free quote. Empty for every other
   * shop, which keeps the template line exactly as it was. Typed by an
   * operator from the shop's own claims, never drafted.
   */
  serviceHeroLines: Record<string, string>
  /**
   * A shop's own meta description and sections for a service page, by slug.
   * Each REPLACES the template's whole — a description is one sentence and a
   * section list is one argument, and splicing a shop's half into the
   * template's half is how a page ends up saying both "repair it" and "we
   * only replace". Written for AGS's windshield-repair page, which exists for
   * the search term while the shop replaces only. Empty for everyone else.
   * Typed by an operator from the shop's own claims (a content patch), never
   * drafted.
   */
  servicePageCopy: Record<string, ServicePageCopy>
}

export interface ServicePageCopy {
  metaDescription?: string
  sections?: Array<{ heading: string; body: string }>
}

const EMPTY_EXTRAS: SiteExtras = {
  warrantyTitle: null,
  warrantyText: null,
  faq: [],
  heroBullets: [],
  chapters: [],
  footerBlurb: null,
  registrationName: null,
  registrationNumber: null,
  galleryPhotos: [],
  bodyPhotos: [],
  serviceHeroLines: {},
  servicePageCopy: {},
}

/** `{ slug: line }`, keeping only non-empty strings of a sane length. */
export function asServiceHeroLines(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [slug, line] of Object.entries(value as Record<string, unknown>)) {
    if (typeof line === 'string' && line.trim() && line.length <= 300) out[slug] = line.trim()
  }
  return out
}

export function asServicePageCopy(value: unknown): Record<string, ServicePageCopy> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, ServicePageCopy> = {}
  for (const [slug, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as { metaDescription?: unknown; sections?: unknown }
    const copy: ServicePageCopy = {}
    if (typeof r.metaDescription === 'string' && r.metaDescription.trim() && r.metaDescription.length <= 320) {
      copy.metaDescription = r.metaDescription.trim()
    }
    if (Array.isArray(r.sections)) {
      const sections = r.sections
        .filter(
          (x): x is { heading: string; body: string } =>
            !!x && typeof x.heading === 'string' && typeof x.body === 'string' && !!x.heading.trim() && !!x.body.trim()
        )
        .map((x) => ({ heading: x.heading.trim(), body: x.body.trim() }))
      if (sections.length) copy.sections = sections
    }
    if (copy.metaDescription || copy.sections) out[slug] = copy
  }
  return out
}

export function asChapters(value: unknown): SiteChapter[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is SiteChapter =>
        !!item &&
        typeof (item as SiteChapter).heading === 'string' &&
        typeof (item as SiteChapter).body === 'string' &&
        (item as SiteChapter).heading.trim() !== '' &&
        (item as SiteChapter).body.trim() !== ''
    )
    .map((c) => ({
      heading: c.heading,
      body: c.body,
      photoUrl: typeof c.photoUrl === 'string' ? c.photoUrl : '',
    }))
    .slice(0, 5)
}

function asFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is FaqItem =>
        !!item &&
        typeof (item as FaqItem).q === 'string' &&
        typeof (item as FaqItem).a === 'string' &&
        (item as FaqItem).q.trim() !== '' &&
        (item as FaqItem).a.trim() !== ''
    )
    .slice(0, 12)
}

function asBullets(value: unknown): HeroBullet[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is HeroBullet =>
        !!item &&
        typeof (item as HeroBullet).lead === 'string' &&
        (item as HeroBullet).lead.trim() !== ''
    )
    .map((b) => ({ lead: b.lead, text: typeof b.text === 'string' ? b.text : '' }))
    .slice(0, 4)
}

export async function getSiteExtras(clientId: string): Promise<SiteExtras> {
  try {
    // The main query names its columns so a DB that predates a newer column
    // never fails it; each newer column is fetched in its own guarded query
    // and simply strips when the ALTER hasn't run yet.
    const [content, photos, chapterRow, heroRow, pageCopyRow] = await Promise.all([
      prisma.clientSiteContent.findUnique({
        where: { clientId },
        select: {
          warrantyTitle: true,
          warrantyText: true,
          faq: true,
          heroBullets: true,
          footerBlurb: true,
          registrationName: true,
          registrationNumber: true,
        },
      }),
      prisma.clientSitePhoto.findMany({
        where: { clientId },
        orderBy: [{ pool: 'asc' }, { sortOrder: 'asc' }],
      }),
      prisma.clientSiteContent
        .findUnique({ where: { clientId }, select: { chapters: true } })
        .catch(() => null),
      prisma.clientSiteContent
        .findUnique({ where: { clientId }, select: { serviceHeroLines: true } })
        .catch(() => null),
      // Its own guarded query, like the two above: a database that predates
      // the column costs this copy, not the whole page's content.
      prisma.clientSiteContent
        .findUnique({ where: { clientId }, select: { servicePageCopy: true } })
        .catch(() => null),
    ])

    return {
      warrantyTitle: content?.warrantyTitle || null,
      warrantyText: content?.warrantyText || null,
      faq: asFaq(content?.faq),
      heroBullets: asBullets(content?.heroBullets),
      chapters: asChapters(chapterRow?.chapters),
      footerBlurb: content?.footerBlurb || null,
      registrationName: content?.registrationName || null,
      registrationNumber: content?.registrationNumber || null,
      galleryPhotos: photos
        .filter((p) => p.pool === 'GALLERY')
        .map((p) => ({ url: p.url, alt: p.alt })),
      bodyPhotos: photos
        .filter((p) => p.pool === 'BODY')
        .map((p) => ({ url: p.url, alt: p.alt })),
      serviceHeroLines: asServiceHeroLines(heroRow?.serviceHeroLines),
      servicePageCopy: asServicePageCopy(pageCopyRow?.servicePageCopy),
    }
  } catch {
    return EMPTY_EXTRAS
  }
}

/**
 * The client's insurance-claim page record, or null.
 *
 * READ BY EVERY PAGE TYPE, not just by the page it belongs to, because the
 * one thing it settles is the affiliation sentence in the insurance band —
 * and that band is on every page. A shop whose claim page says they are in an
 * insurer's repair network while the home page says they are not affiliated
 * with any insurer has published both halves of a contradiction, and the one
 * a customer reads first decides which of them reads as the lie.
 *
 * Defensive for the same reason `getSiteExtras` is: a database that predates
 * the table costs this one sentence rather than every page on the site.
 */
export async function getInsuranceProgram(
  clientId: string
): Promise<{ program: InsuranceProgram | null; record: ProgramRecord | null }> {
  const row = await prisma.clientInsuranceProgram
    .findUnique({ where: { clientId } })
    .catch(() => null)
  const record = readProgramRecord(row)
  return { program: record ? programFor(record.programKey) : null, record }
}
