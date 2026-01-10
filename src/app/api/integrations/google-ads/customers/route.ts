import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listAccessibleCustomers } from '@/lib/google-ads'

export const dynamic = 'force-dynamic'

/**
 * GET /api/integrations/google-ads/customers
 * List all accessible Google Ads customers under the MCC
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await listAccessibleCustomers()

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ customers: result.customers })
}
