export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getPortalSession } from '@/lib/portal-auth'
import { getClientActivity } from '@/lib/client-activity'
import ActivityFeed from '@/components/ActivityFeed'

/**
 * "Work done" in the client portal — what has been done, dated. The URL is
 * still /portal/activity so old links land; the label changed because in an
 * app about leads "Activity" reads as lead activity, and the monthly report
 * has always called this "What we did".
 *
 * The retention artifact. SEO and lead generation fail with a small business
 * less often because they do not work than because three months pass with
 * nothing to look at. Read-only: the shop commissions nothing here.
 */
export default async function PortalActivityPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const months = await getClientActivity(session.clientId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Work done</h1>
        <p className="text-gray-600">
          What has been done on {session.businessName}&apos;s marketing, newest first. Every line
          is something that actually happened — nothing here is a projection.
        </p>
      </div>
      <ActivityFeed months={months} />
    </div>
  )
}
