import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import {
  analyticsConnected,
  listGa4Properties,
  listSearchConsoleSites,
} from '@/lib/site-analytics'

export const dynamic = 'force-dynamic'

/**
 * GET — everything the operator's Google account can see, for the picklists.
 *
 * ADMIN ONLY, and not per client: this is a list of every property on the
 * platform's own account, so it must never be reachable from a client's
 * portal session. What it returns is a directory of the operator's other
 * customers.
 *
 * The two halves fail independently. Search Console being unshared should not
 * empty the Analytics list — a picklist that goes blank reads as "there are
 * no properties" rather than "one API said no".
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  if (!(await analyticsConnected())) {
    return NextResponse.json({
      connected: false,
      properties: [],
      sites: [],
      errors: [],
    })
  }

  const errors: string[] = []
  const [properties, sites] = await Promise.all([
    listGa4Properties().catch((err) => {
      errors.push(`Analytics: ${err instanceof Error ? err.message : 'failed'}`)
      return []
    }),
    listSearchConsoleSites().catch((err) => {
      errors.push(`Search Console: ${err instanceof Error ? err.message : 'failed'}`)
      return []
    }),
  ])

  return NextResponse.json({ connected: true, properties, sites, errors })
}
