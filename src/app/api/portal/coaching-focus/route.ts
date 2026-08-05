import { NextResponse } from 'next/server'
import { getPortalSession } from '@/lib/portal-auth'
import { getClientFocusAreas } from '@/lib/call-analysis/focus-areas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/coaching-focus
 * The three things this client's team should work on, from call patterns.
 */
export async function GET() {
  const session = await getPortalSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await getClientFocusAreas(session.clientId))
  } catch (error) {
    console.error('Failed to load coaching focus areas:', error)
    return NextResponse.json({ error: 'Failed to load focus areas' }, { status: 500 })
  }
}
