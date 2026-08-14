import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const MAX_PHOTOS = 24

/** GET — current editorial content + photos for the client's hosted site. */
async function lookupPlaceWebsite(placeId: string): Promise<string | null> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'GOOGLE_PLACES_API_KEY' } })
    const apiKey = setting?.encrypted
      ? decrypt(setting.value)
      : setting?.value || process.env.GOOGLE_PLACES_API_KEY || null
    if (!apiKey) return null
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=website&key=${apiKey}`,
      { signal: AbortSignal.timeout(8_000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const website = data?.result?.website
    return typeof website === 'string' && website.startsWith('http') ? website : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const [content, photos, chapterRow, clientRow] = await Promise.all([
      prisma.clientSiteContent.findUnique({
        where: { clientId: id },
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
        where: { clientId: id },
        orderBy: [{ pool: 'asc' }, { sortOrder: 'asc' }],
        select: { url: true, alt: true, pool: true },
      }),
      // Newer column, fetched separately so a DB that predates it still
      // serves everything else.
      prisma.clientSiteContent
        .findUnique({ where: { clientId: id }, select: { chapters: true } })
        .catch(() => null),
      // Their existing site, as the Business Profile picker recorded it —
      // seeds the import field. Newer column; degrade to null quietly.
      prisma.client
        .findUnique({ where: { id }, select: { websiteUrl: true, googlePlaceId: true } })
        .catch(() => null),
    ])

    // Clients picked before the capture existed have a Place ID and no
    // stored website. Backfill on the spot rather than making the admin
    // re-pick every existing client: one Places call, persisted, so it runs
    // once per client rather than once per page load.
    let websiteUrl = clientRow?.websiteUrl ?? null
    if (!websiteUrl && clientRow?.googlePlaceId) {
      websiteUrl = await lookupPlaceWebsite(clientRow.googlePlaceId)
      if (websiteUrl) {
        await prisma.client
          .update({ where: { id }, data: { websiteUrl } })
          .catch(() => {})
      }
    }
    return NextResponse.json({
      content: content
        ? {
            warrantyTitle: content.warrantyTitle,
            warrantyText: content.warrantyText,
            faq: content.faq ?? [],
            heroBullets: content.heroBullets ?? [],
            chapters: chapterRow?.chapters ?? [],
            footerBlurb: content.footerBlurb,
            registrationName: content.registrationName,
            registrationNumber: content.registrationNumber,
          }
        : null,
      photos,
      websiteUrl,
    })
  } catch (error) {
    console.error('Failed to load site content:', error)
    return NextResponse.json({ error: 'Failed to load site content' }, { status: 500 })
  }
}

/** PUT — replace editorial content and the photo list. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const body = await request.json()
    const text = (v: unknown, max = 2000): string | null => {
      if (typeof v !== 'string') return null
      const trimmed = v.trim()
      return trimmed ? trimmed.slice(0, max) : null
    }

    const faq = Array.isArray(body.faq)
      ? body.faq
          .filter(
            (f: { q?: unknown; a?: unknown }) =>
              typeof f?.q === 'string' && typeof f?.a === 'string' && f.q.trim() && f.a.trim()
          )
          .slice(0, 12)
          .map((f: { q: string; a: string }) => ({ q: f.q.trim(), a: f.a.trim() }))
      : []

    const heroBullets = Array.isArray(body.heroBullets)
      ? body.heroBullets
          .filter((b: { lead?: unknown }) => typeof b?.lead === 'string' && b.lead.trim())
          .slice(0, 4)
          .map((b: { lead: string; text?: string }) => ({
            lead: b.lead.trim(),
            text: typeof b.text === 'string' ? b.text.trim() : '',
          }))
      : []

    const rawPhotos = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS) : []
    const photos: Array<{ url: string; alt: string; pool: 'GALLERY' | 'BODY'; sortOrder: number }> = []
    for (const [index, photo] of rawPhotos.entries()) {
      if (typeof photo?.url !== 'string') continue
      let parsed: URL
      try {
        parsed = new URL(photo.url.trim())
      } catch {
        return NextResponse.json({ error: `Invalid photo URL: ${photo.url}` }, { status: 400 })
      }
      if (parsed.protocol !== 'https:') {
        return NextResponse.json({ error: `Photo URLs must be https: ${photo.url}` }, { status: 400 })
      }
      photos.push({
        url: parsed.toString(),
        alt: typeof photo.alt === 'string' ? photo.alt.trim().slice(0, 200) : '',
        pool: photo.pool === 'BODY' ? 'BODY' : 'GALLERY',
        sortOrder: index,
      })
    }

    const chapters = Array.isArray(body.chapters)
      ? body.chapters
          .filter(
            (c: { heading?: unknown; body?: unknown }) =>
              typeof c?.heading === 'string' && typeof c?.body === 'string' && c.heading.trim() && c.body.trim()
          )
          .slice(0, 5)
          .map((c: { heading: string; body: string; photoUrl?: string }) => ({
            heading: c.heading.trim().slice(0, 120),
            body: c.body.trim().slice(0, 4000),
            photoUrl:
              typeof c.photoUrl === 'string' && /^https:\/\//.test(c.photoUrl.trim())
                ? c.photoUrl.trim()
                : '',
          }))
      : []

    const contentData = {
      warrantyTitle: text(body.warrantyTitle, 120),
      warrantyText: text(body.warrantyText, 4000),
      faq: faq as Prisma.InputJsonValue,
      heroBullets: heroBullets as Prisma.InputJsonValue,
      footerBlurb: text(body.footerBlurb, 400),
      registrationName: text(body.registrationName, 200),
      registrationNumber: text(body.registrationNumber, 100),
    }
    const withChapters = { ...contentData, chapters: chapters as Prisma.InputJsonValue }

    const save = (data: typeof contentData) =>
      prisma.$transaction([
        prisma.clientSiteContent.upsert({
          where: { clientId: id },
          update: data,
          create: { clientId: id, ...data },
        }),
        prisma.clientSitePhoto.deleteMany({ where: { clientId: id } }),
        ...(photos.length
          ? [prisma.clientSitePhoto.createMany({ data: photos.map((p) => ({ ...p, clientId: id })) })]
          : []),
      ])

    let chaptersSkipped = false
    try {
      await save(withChapters)
    } catch (err) {
      // The chapters column may not exist yet (ALTER not run). Save the rest
      // rather than failing the whole request, and say so.
      console.error('Save with chapters failed, retrying without:', err)
      await save(contentData)
      chaptersSkipped = chapters.length > 0
    }

    return NextResponse.json({
      success: true,
      ...(chaptersSkipped
        ? { warning: 'Chapters were NOT saved — run docs/db-add-site-chapters.sql, then save again.' }
        : {}),
    })
  } catch (error) {
    console.error('Failed to save site content:', error)
    return NextResponse.json({ error: 'Failed to save site content' }, { status: 500 })
  }
}
