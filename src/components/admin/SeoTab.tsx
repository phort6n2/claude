'use client'

import { useState } from 'react'
import SeoTierCard from '@/components/admin/SeoTierCard'
import SeoContentCard from '@/components/admin/SeoContentCard'
import SeoArticleRows, { type ArticleRow } from '@/components/admin/SeoArticleRows'

/**
 * The SEO tab, as one client component so the plan switch can reveal the rest.
 *
 * Ticking "on the SEO plan" is the moment the shop's BabyLoveGrowth key is
 * wanted, so that is where the field appears. It used to be gated on the shop
 * ALREADY having a key or an article, which was a chicken and egg: the only
 * place to enter a first key was a card that would not render until a key
 * existed.
 *
 * Client-side state rather than a reload, because the reveal has to happen on
 * the tick — a card that only appears after a refresh reads as a card that
 * did not appear.
 */
export default function SeoTab({
  clientId,
  initialSeoClient,
  initialContentEnabled,
  initialMaskedKey,
  articles,
  host,
}: {
  clientId: string
  initialSeoClient: boolean
  initialContentEnabled: boolean
  initialMaskedKey: string | null
  articles: ArticleRow[]
  host: string
}) {
  const [seoClient, setSeoClient] = useState(initialSeoClient)

  // Articles already synced stay visible even if the plan is switched off, so
  // turning the plan off never looks like it deleted the work.
  const showContent = seoClient || !!initialMaskedKey || articles.length > 0

  return (
    <div className="space-y-4">
      <SeoTierCard
        clientId={clientId}
        initialEnabled={initialSeoClient}
        onEnabledChange={setSeoClient}
      />

      {showContent && (
        <>
          <SeoContentCard
            clientId={clientId}
            initialEnabled={initialContentEnabled}
            initialMaskedKey={initialMaskedKey}
          />
          {articles.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
              <h2 className="font-semibold text-gray-900">Articles ({articles.length})</h2>
              <div className="mt-4">
                <SeoArticleRows articles={articles} host={host} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
