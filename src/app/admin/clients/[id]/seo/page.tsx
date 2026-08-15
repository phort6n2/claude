export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import { decrypt } from '@/lib/encryption'
import SeoContentCard from '@/components/admin/SeoContentCard'
import SeoArticleRows from '@/components/admin/SeoArticleRows'

/**
 * "SEO" tab: switch syndicated content on for this shop, hold their
 * BabyLoveGrowth key, and decide what reaches their site.
 *
 * Per-shop rather than one account-wide key, because each shop is its own
 * organisation at the provider — which means the key itself identifies the
 * shop and there is no website to match and get wrong.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      slug: true,
      siteSubdomain: true,
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

  // Decrypted only to mask it. The key is never sent to the browser in full.
  const plain = client.blgApiKey ? decrypt(client.blgApiKey) : null
  const masked = plain
    ? plain.length <= 8
      ? '••••'
      : `${plain.slice(0, 4)}••••${plain.slice(-4)}`
    : null

  const host =
    client.domains[0]?.domain || `${client.siteSubdomain || client.slug}.glassleads.app`

  const held = articles.filter((a) => !a.publishedAt).length

  return (
    <div className="space-y-4">
      <SeoContentCard
        clientId={client.id}
        initialEnabled={client.seoContentEnabled}
        initialMaskedKey={masked}
      />

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 className="font-semibold text-gray-900">
          Articles{articles.length ? ` (${articles.length})` : ''}
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-600">
          {held > 0
            ? `${held} waiting on you. Read each one before publishing — the scan catches known phrasings, not every invented fact.`
            : 'Everything pulled for this shop is live on their site.'}
        </p>
        <SeoArticleRows
          articles={articles.map((a) => ({
            ...a,
            publishedAt: a.publishedAt?.toISOString() || null,
            authoredAt: a.authoredAt?.toISOString() || null,
          }))}
          host={host}
        />
      </section>
    </div>
  )
}
