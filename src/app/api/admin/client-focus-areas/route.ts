import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientFocusAreas } from '@/lib/call-analysis/focus-areas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/client-focus-areas?clientId=xxx[&days=60]
 * The three things a given client's team should work on, from call patterns.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }

  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '60', 10), 1), 365)

  try {
    return NextResponse.json(await getClientFocusAreas(clientId, days))
  } catch (error) {
    console.error('Failed to load client focus areas:', error)
    return NextResponse.json({ error: 'Failed to load focus areas' }, { status: 500 })
  }
}
