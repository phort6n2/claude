import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listConversionActions } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ customerId: string }>
}

/**
 * GET /api/integrations/google-ads/customers/[customerId]/conversion-actions
 * List conversion actions for a specific Google Ads customer
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { customerId } = await params

  const result = await listConversionActions(customerId)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ actions: result.actions })
}
