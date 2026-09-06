import { getPortalSession } from '@/lib/portal-auth'
import { prisma } from '@/lib/db'
import ImpersonationBanner from '@/components/portal/ImpersonationBanner'
import PortalNav, { PortalTabBar } from '@/components/portal/PortalNav'
import { siteLinkFor, PRIMARY_DOMAIN_SELECT } from '@/lib/site-origin'

export const dynamic = 'force-dynamic'

/**
 * Portal shell. Signed-out routes (login, magic-link verify) render bare —
 * they have no session to theme with and no navigation to offer.
 *
 * When signed in, the shell is themed with the client's own brand color so
 * the portal reads as their product, and an impersonation banner is rendered
 * above everything when an admin is viewing as them.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getPortalSession()

  if (!session) {
    return <>{children}</>
  }

  const brand = session.primaryColor || '#1e40af'

  // Only offer this tab once there is something behind it. A tab that leads
  // to a permanent empty state reads as something broken rather than
  // something not bought.
  const [rankScans, client] = await Promise.all([
    prisma.localRankScan.count({ where: { clientId: session.clientId } }).catch(() => 0),
    prisma.client
      .findUnique({
        where: { id: session.clientId },
        select: { slug: true, siteSubdomain: true, domains: PRIMARY_DOMAIN_SELECT },
      })
      .catch(() => null),
  ])
  const hasRankings = rankScans > 0
  // Their own address once a custom domain is live, ours until then. Only a
  // real, reachable address gets a tab — the preview path is an operator's
  // tool, not something to hand a shop.
  const siteUrl = client && (client.siteSubdomain || client.domains.length) ? siteLinkFor(client) : null

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={
        {
          '--brand': brand,
          '--brand-ink': brand,
          '--brand-soft': `${brand}14`,
        } as React.CSSProperties
      }
    >
      {session.isImpersonating && (
        <ImpersonationBanner
          email={session.email}
          businessName={session.businessName}
          expiresAt={session.impersonationExpiresAt}
        />
      )}

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 min-h-[60px] flex items-center gap-3">
          {session.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.logoUrl}
              alt=""
              className="h-9 w-auto max-w-[150px] object-contain"
            />
          ) : (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold shrink-0"
              style={{ backgroundColor: brand }}
            >
              {session.businessName[0]}
            </div>
          )}
          <span className="font-bold text-gray-900 truncate">{session.businessName}</span>
          <div className="ml-auto">
            <PortalNav showRankings={hasRankings} siteUrl={siteUrl} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-10">{children}</main>

      {/* Outside the header on purpose: the header's backdrop-blur makes it a
          containing block for fixed children, which pinned this bar to the
          top of the screen instead of the bottom. */}
      <PortalTabBar showRankings={hasRankings} siteUrl={siteUrl} />
    </div>
  )
}
