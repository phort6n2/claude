export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import { ExternalLink, FileText, TrendingUp } from 'lucide-react'

/**
 * "SEO" in the client portal — the receipt for the retainer.
 *
 * Read-only by design. The shop does not commission, approve, edit or
 * schedule anything here; the point is to make the work visible between
 * invoices, because SEO's real failure mode with a small business is not
 * that it does not work, it is that three months pass with nothing to look
 * at and the retainer gets cancelled before it does.
 *
 * Every number is measured. Nothing is projected, indexed or scored — a
 * shop owner who catches one invented figure stops believing the honest
 * ones next to it.
 */

function Stat({
  value,
  label,
  hint,
}: {
  value: string
  label: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-2xl font-extrabold text-gray-900 tabular-nums leading-none">{value}</div>
      <div className="mt-1.5 text-sm font-semibold text-gray-800">{label}</div>
      {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
    </div>
  )
}

export default async function PortalSeoPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: {
      businessName: true,
      city: true,
      slug: true,
      siteSubdomain: true,
      rankKeywords: true,
      domains: { where: { isPrimary: true }, select: { domain: true }, take: 1 },
    },
  })

  const articles = await prisma.seoArticle
    .findMany({
      where: {
        clientId: session.clientId,
        publishedAt: { not: null },
        client: { seoContentEnabled: true },
      },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, slug: true, title: true, seedKeyword: true, publishedAt: true },
    })
    .catch(() => [])

  // Movement on the headline keyword: the first one configured, not the
  // best performing. Showing whichever keyword flatters the month is how a
  // report stops meaning anything.
  const keyword = client?.rankKeywords?.[0] || null
  const scans = keyword
    ? await prisma.localRankScan
        .findMany({
          where: { clientId: session.clientId, searchTerm: keyword },
          orderBy: { scannedAt: 'asc' },
          select: { averageRank: true, top3Percent: true, scannedAt: true },
        })
        .catch(() => [])
    : []

  const ranked = scans.filter((s) => typeof s.averageRank === 'number')
  const first = ranked[0]?.averageRank ?? null
  const latest = ranked[ranked.length - 1]?.averageRank ?? null
  // Negative is an improvement: position 4 to position 2 is -2.
  const delta =
    first !== null && latest !== null && ranked.length >= 2
      ? Math.round((latest - first) * 10) / 10
      : null

  const host = client?.domains[0]?.domain
    ? client.domains[0].domain
    : `${client?.siteSubdomain || client?.slug}.glassleads.app`

  const now = new Date()
  const thisMonth = articles.filter((a) => {
    const at = a.publishedAt
    return at && at.getMonth() === now.getMonth() && at.getFullYear() === now.getFullYear()
  }).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SEO</h1>
        <p className="text-gray-600">
          The work going into getting {client?.businessName || 'your shop'} found in{' '}
          {client?.city || 'your area'} without paying for the click.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          value={String(articles.length)}
          label="Articles published"
          hint={thisMonth ? `${thisMonth} this month` : 'on your site'}
        />
        {latest !== null && (
          <Stat
            value={latest.toFixed(1)}
            label="Average map position"
            hint={keyword ? `for “${keyword}”` : undefined}
          />
        )}
        {delta !== null && (
          <Stat
            value={delta === 0 ? 'Holding' : `${delta < 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}`}
            label={delta <= 0 ? 'Positions gained' : 'Positions lost'}
            hint="since tracking started"
          />
        )}
        {scans.length > 0 && (
          <Stat
            value={String(scans.length)}
            label="Ranking scans"
            hint="across your service area"
          />
        )}
      </div>

      {delta !== null && delta < 0 && keyword && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex gap-3">
          <TrendingUp className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />
          <p className="text-sm text-green-900">
            On <strong>“{keyword}”</strong> you have moved up{' '}
            <strong>{Math.abs(delta).toFixed(1)} positions</strong> on average across your service
            area since tracking started — from {first?.toFixed(1)} to {latest?.toFixed(1)}. The
            Rankings tab shows the map behind that number.
          </p>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-5 sm:p-6 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            Articles written for you
          </h2>
          <p className="mt-1 text-sm text-gray-600 max-w-prose">
            Written and published to your website to answer what drivers actually search for.
            Each one is a page Google can rank that your competitors do not have.
          </p>
        </div>

        {articles.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">
            No articles are live yet. The first ones appear here as they are published.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {articles.map((article) => (
              <li key={article.id} className="p-5 sm:p-6 flex flex-wrap gap-3 justify-between">
                <div className="min-w-0">
                  <a
                    href={`https://${host}/blog/${article.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-gray-900 hover:text-[var(--brand-ink)] inline-flex items-center gap-1.5"
                  >
                    {article.title}
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  </a>
                  <p className="mt-1 text-xs text-gray-500">
                    {article.seedKeyword && <>Targeting “{article.seedKeyword}” · </>}
                    {article.publishedAt?.toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
