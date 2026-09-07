'use client'

import { useState } from 'react'
import SeoTierCard from '@/components/admin/SeoTierCard'
import ContentFeedCard from '@/components/admin/ContentFeedCard'
import SiteAnalyticsCard from '@/components/admin/SiteAnalyticsCard'

/**
 * The SEO tab, as one client component so the plan switch can reveal the rest.
 *
 * Ticking "on the SEO plan" is the moment a shop's content feed is wanted, so
 * that is where the field appears. Client-side state rather than a reload,
 * because the reveal has to happen on the tick — a card that only appears
 * after a refresh reads as a card that did not appear.
 */
export default function SeoTab({
  clientId,
  initialSeoClient,
  feed,
  analytics,
}: {
  clientId: string
  initialSeoClient: boolean
  feed: {
    url: string | null
    checkedAt: string | null
    error: string | null
    itemCount: number
  }
  analytics: {
    propertyId: string | null
    siteUrl: string | null
    fetchedAt: string | null
    error: string | null
    brandTerms: string | null
    /** What the split falls back to when the field is left empty. */
    defaultBrandTerms: string[]
  }
}) {
  const [seoClient, setSeoClient] = useState(initialSeoClient)

  // A feed already configured stays visible even if the plan is switched off,
  // so turning the plan off never looks like it deleted the setup.
  const showFeed = seoClient || !!feed.url
  // Same rule as the feed: an association already made stays visible after the
  // plan is switched off, so turning it off never looks like it deleted the
  // setup. It also has to be settable BEFORE the plan is on — the traffic
  // numbers are what the upsell page argues from.
  const showAnalytics = seoClient || !!analytics.propertyId || !!analytics.siteUrl

  return (
    <div className="space-y-4">
      <SeoTierCard
        clientId={clientId}
        initialEnabled={initialSeoClient}
        onEnabledChange={setSeoClient}
      />

      {showFeed && (
        <ContentFeedCard
          clientId={clientId}
          initialUrl={feed.url}
          lastCheckedAt={feed.checkedAt}
          lastError={feed.error}
          itemCount={feed.itemCount}
        />
      )}

      {showAnalytics && (
        <SiteAnalyticsCard
          clientId={clientId}
          initialPropertyId={analytics.propertyId}
          initialSiteUrl={analytics.siteUrl}
          lastFetchedAt={analytics.fetchedAt}
          lastError={analytics.error}
          initialBrandTerms={analytics.brandTerms}
          defaultBrandTerms={analytics.defaultBrandTerms}
        />
      )}
    </div>
  )
}
