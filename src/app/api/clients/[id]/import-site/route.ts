import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { importSiteContent } from '@/lib/site-import'

export const dynamic = 'force-dynamic'
// Crawl (up to 5 pages) + model extraction can exceed the default budget.
export const maxDuration = 120

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — fetch a client's existing website and extract site content as a
 * DRAFT. Nothing is written to the database: the response pre-fills the Site
 * Content editor and an admin reviews before saving.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      select: { businessName: true, city: true, state: true },
    })
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const body = await request.json()
    if (typeof body.url !== 'string' || !body.url.trim()) {
      return NextResponse.json({ error: 'A URL is required' }, { status: 400 })
    }

    const result = await importSiteContent(body.url, {
      name: client.businessName,
      city: client.city,
      state: client.state,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json({ draft: result.draft })
  } catch (error) {
    console.error('Failed to import site content:', error)
    return NextResponse.json({ error: 'Failed to import site content' }, { status: 500 })
  }
}
