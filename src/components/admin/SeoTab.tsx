'use client'

import { useState } from 'react'
import SeoTierCard from '@/components/admin/SeoTierCard'
import ContentFeedCard from '@/components/admin/ContentFeedCard'

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
}: {
  clientId: string
  initialSeoClient: boolean
  feed: {
    url: string | null
    checkedAt: string | null
    error: string | null
    itemCount: number
  }
}) {
  const [seoClient, setSeoClient] = useState(initialSeoClient)

  // A feed already configured stays visible even if the plan is switched off,
  // so turning the plan off never looks like it deleted the setup.
  const showFeed = seoClient || !!feed.url

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
    </div>
  )
}
