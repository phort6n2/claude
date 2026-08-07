import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { provisionSubdomain } from '@/lib/site-domains'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/clients/[id]/provision-subdomain  { subdomain: "collision" }
 *
 * Saves the short subdomain on the client, creates the Cloudflare CNAME, and
 * attaches the domain to the Vercel project. Safe to re-run.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
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
    const result = await provisionSubdomain(id, typeof body.subdomain === 'string' ? body.subdomain : '')

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (error) {
    console.error('Failed to provision subdomain:', error)
    return NextResponse.json({ error: 'Failed to provision subdomain' }, { status: 500 })
  }
}
