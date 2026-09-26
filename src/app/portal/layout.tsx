import { getPortalSession } from '@/lib/portal-auth'
import ImpersonationBanner from '@/components/portal/ImpersonationBanner'
import PortalNav, { PortalTabBar, AccountMenu, ReportsSubNav } from '@/components/portal/PortalNav'
import { getPortalSections } from '@/lib/portal-sections'
import { brandVariables } from '@/lib/brand-color'

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

  // Which sections this shop has something behind — the same answer the
  // Summary page's cards and the home tiles read (lib/portal-sections.ts).
  const { hasCalls, hasRankings, siteUrl, logoOnDark } = await getPortalSections(session.clientId)

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={
        /* --brand-ink USED TO BE --brand. The same hex was handed to three
           incompatible jobs: the fill behind white text, the colour OF text on
           white, and a pale wash. A navy shop looked perfect, so nothing ever
           surfaced it — a yellow one had unreadable links and an invisible
           wash. brandVariables derives each from the contrast it has to meet;
           scripts/check-brand-color.ts holds the hues that broke it. */
        brandVariables(brand) as React.CSSProperties
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
            // A logo drawn for a dark background sits on a dark tile rather
            // than turning the whole portal header dark: this bar also holds
            // the tabs and the account menu, styled for white.
            <span
              className={`flex shrink-0 items-center ${
                logoOnDark ? 'rounded-lg bg-[#16181d] px-2.5 py-1.5' : ''
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session.logoUrl}
                alt=""
                className={`w-auto max-w-[150px] object-contain ${logoOnDark ? 'h-7' : 'h-9'}`}
              />
            </span>
          ) : (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold shrink-0"
              style={{ backgroundColor: brand }}
            >
              {session.businessName[0]}
            </div>
          )}
          <span className="font-bold text-gray-900 truncate">{session.businessName}</span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <PortalNav />
            <AccountMenu
              siteUrl={siteUrl}
              businessName={session.businessName}
              email={session.email}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10">
        {/* Renders only on the pages that live under Reports. */}
        <ReportsSubNav hasCalls={hasCalls} hasRankings={hasRankings} />
        {children}
        {/* In the flow, not fixed. The Leads page drew this as a fixed bar
            at bottom-0, which on a phone sat on top of the tab bar — and only
            on that one page. Here it is on every page and clears the bar via
            main's own bottom padding. */}
        <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-gray-400">
          Powered by
          <a
            href="https://autoglassmarketingpros.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-gray-600 hover:text-gray-900"
          >
            Auto Glass Marketing Pros
          </a>
        </p>
      </main>

      {/* Outside the header on purpose: the header's backdrop-blur makes it a
          containing block for fixed children, which pinned this bar to the
          top of the screen instead of the bottom. */}
      <PortalTabBar />
    </div>
  )
}
