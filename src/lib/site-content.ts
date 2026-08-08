import { prisma } from '@/lib/db'

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

export interface SiteExtras {
  warrantyTitle: string | null
  warrantyText: string | null
  faq: FaqItem[]
  heroBullets: HeroBullet[]
  footerBlurb: string | null
  registrationName: string | null
  registrationNumber: string | null
  galleryPhotos: Array<{ url: string; alt: string }>
  bodyPhotos: Array<{ url: string; alt: string }>
}

const EMPTY_EXTRAS: SiteExtras = {
  warrantyTitle: null,
  warrantyText: null,
  faq: [],
  heroBullets: [],
  footerBlurb: null,
  registrationName: null,
  registrationNumber: null,
  galleryPhotos: [],
  bodyPhotos: [],
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
    const [content, photos] = await Promise.all([
      prisma.clientSiteContent.findUnique({ where: { clientId } }),
      prisma.clientSitePhoto.findMany({
        where: { clientId },
        orderBy: [{ pool: 'asc' }, { sortOrder: 'asc' }],
      }),
    ])

    return {
      warrantyTitle: content?.warrantyTitle || null,
      warrantyText: content?.warrantyText || null,
      faq: asFaq(content?.faq),
      heroBullets: asBullets(content?.heroBullets),
      footerBlurb: content?.footerBlurb || null,
      registrationName: content?.registrationName || null,
      registrationNumber: content?.registrationNumber || null,
      galleryPhotos: photos
        .filter((p) => p.pool === 'GALLERY')
        .map((p) => ({ url: p.url, alt: p.alt })),
      bodyPhotos: photos
        .filter((p) => p.pool === 'BODY')
        .map((p) => ({ url: p.url, alt: p.alt })),
    }
  } catch {
    return EMPTY_EXTRAS
  }
}
