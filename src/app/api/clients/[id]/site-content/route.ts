import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

const MAX_PHOTOS = 24

/** GET — current editorial content + photos for the client's hosted site. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const [content, photos] = await Promise.all([
      prisma.clientSiteContent.findUnique({ where: { clientId: id } }),
      prisma.clientSitePhoto.findMany({
        where: { clientId: id },
        orderBy: [{ pool: 'asc' }, { sortOrder: 'asc' }],
        select: { url: true, alt: true, pool: true },
      }),
    ])
    return NextResponse.json({
      content: content
        ? {
            warrantyTitle: content.warrantyTitle,
            warrantyText: content.warrantyText,
            faq: content.faq ?? [],
            heroBullets: content.heroBullets ?? [],
            footerBlurb: content.footerBlurb,
            registrationName: content.registrationName,
            registrationNumber: content.registrationNumber,
          }
        : null,
      photos,
    })
  } catch (error) {
    console.error('Failed to load site content:', error)
    return NextResponse.json({ error: 'Failed to load site content' }, { status: 500 })
  }
}

/** PUT — replace editorial content and the photo list. */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
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

    const contentData = {
      warrantyTitle: text(body.warrantyTitle, 120),
      warrantyText: text(body.warrantyText, 4000),
      faq: faq as Prisma.InputJsonValue,
      heroBullets: heroBullets as Prisma.InputJsonValue,
      footerBlurb: text(body.footerBlurb, 400),
      registrationName: text(body.registrationName, 200),
      registrationNumber: text(body.registrationNumber, 100),
    }

    await prisma.$transaction([
      prisma.clientSiteContent.upsert({
        where: { clientId: id },
        update: contentData,
        create: { clientId: id, ...contentData },
      }),
      prisma.clientSitePhoto.deleteMany({ where: { clientId: id } }),
      ...(photos.length
        ? [prisma.clientSitePhoto.createMany({ data: photos.map((p) => ({ ...p, clientId: id })) })]
        : []),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save site content:', error)
    return NextResponse.json({ error: 'Failed to save site content' }, { status: 500 })
  }
}
