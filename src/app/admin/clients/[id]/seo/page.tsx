export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import { decrypt } from '@/lib/encryption'
import SeoTierCard from '@/components/admin/SeoTierCard'
import SeoContentCard from '@/components/admin/SeoContentCard'
import SeoArticleRows from '@/components/admin/SeoArticleRows'

/**
 * "SEO" tab: what this shop is paying for, and what that changes.
 *
 * One switch for now. The syndicated-content cards below it only appear once
 * a shop actually has a BabyLoveGrowth key or articles — the integration is
 * built and idle, and a card for something nobody is using is clutter on
 * every client rather than a feature.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      seoClient: true,
      seoContentEnabled: true,
      blgApiKey: true,
      domains: { where: { isPrimary: true }, select: { domain: true }, take: 1 },
    },
  })
  if (!client) notFound()

  const articles = await prisma.seoArticle
    .findMany({
      where: { clientId: id },
      orderBy: [{ publishedAt: 'desc' }, { authoredAt: 'desc' }],
      select: {
        id: true,
        title: true,
        slug: true,
        seedKeyword: true,
        reviewFlags: true,
        publishedAt: true,
        authoredAt: true,
      },
    })
    .catch(() => [])

  // Content is in use for this shop only if it has a key or something synced.
  const usesContent = !!client.blgApiKey || articles.length > 0
  const plain = client.blgApiKey ? decrypt(client.blgApiKey) : null
  const masked = plain
    ? plain.length <= 8
      ? '••••'
      : `${plain.slice(0, 4)}••••${plain.slice(-4)}`
    : null
  const host = client.domains[0]?.domain || `${client.siteSubdomain || client.slug}.glassleads.app`

  return (
    <div className="space-y-4">
      <SeoTierCard clientId={client.id} initialEnabled={client.seoClient} />

      {usesContent && (
        <>
          <SeoContentCard
            clientId={client.id}
            initialEnabled={client.seoContentEnabled}
            initialMaskedKey={masked}
          />
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
            <h2 className="font-semibold text-gray-900">Articles ({articles.length})</h2>
            <div className="mt-4">
              <SeoArticleRows
                articles={articles.map((a) => ({
                  ...a,
                  publishedAt: a.publishedAt?.toISOString() || null,
                  authoredAt: a.authoredAt?.toISOString() || null,
                }))}
                host={host}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
