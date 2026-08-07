import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { refreshGbpReviews } from '@/lib/gbp-reviews'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** POST /api/clients/[id]/refresh-reviews — fetch + cache GBP rating data now. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const result = await refreshGbpReviews(id)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    console.error('Failed to refresh reviews:', error)
    return NextResponse.json({ error: 'Failed to refresh reviews' }, { status: 500 })
  }
}
