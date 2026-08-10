export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import { siteOriginFor } from '@/lib/site-origin'
import PortalSiteContentEditor from '@/components/portal/PortalSiteContentEditor'

/**
 * "My Website" in the client portal.
 *
 * The nav has linked here since the portal shipped and the page never
 * existed — a shop owner tapping it got a 404 on the one tab that sounds
 * most like it's about them.
 *
 * What it is NOT is a website editor. The layout, hero, photos and location
 * copy stay with us; this is the warranty and the FAQ, the two parts of the
 * page only the shop owner can actually write.
 */
export default async function PortalWebsitePage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: {
      slug: true,
      siteSubdomain: true,
      status: true,
      domains: {
        where: { isPrimary: true },
        select: { domain: true, verified: true, misconfigured: true },
        take: 1,
      },
    },
  })

  // Point at whatever address customers actually reach — their own domain
  // once it resolves, the platform subdomain until then.
  const siteUrl = client ? siteOriginFor(client) : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">My website</h1>
        <p className="text-gray-600">
          Two things on your site are yours to write. Change them here and they&apos;re live in a
          few minutes — everything else is ours to keep working.
        </p>
      </div>

      {client?.status !== 'ACTIVE' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your site is paused right now, so these changes will save but won&apos;t be visible until
          it&apos;s switched back on. Give us a call.
        </p>
      )}

      <PortalSiteContentEditor siteUrl={siteUrl} />
    </div>
  )
}
