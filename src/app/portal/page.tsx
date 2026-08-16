import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Inbox, Phone, Globe, TrendingUp, ArrowRight, Star } from 'lucide-react'
import { getPortalSession } from '@/lib/portal-auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Portal home — the value screen. A shop owner logging in should see, in one
 * glance, that the product is working: leads arriving, work booked, and their
 * site live. Everything here is scoped to the session's own client.
 */

function Tile({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-extrabold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default async function PortalHomePage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const prevWeek = new Date(now.getTime() - 14 * 86400000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [thisWeek, lastWeek, newCount, monthSales, client, reviews] = await Promise.all([
    prisma.lead.count({ where: { clientId: session.clientId, createdAt: { gte: weekAgo } } }),
    prisma.lead.count({
      where: { clientId: session.clientId, createdAt: { gte: prevWeek, lt: weekAgo } },
    }),
    prisma.lead.count({ where: { clientId: session.clientId, status: 'NEW' } }).catch(() => 0),
    prisma.lead
      .aggregate({
        where: { clientId: session.clientId, status: 'SOLD', updatedAt: { gte: monthStart } },
        _sum: { saleValue: true },
        _count: true,
      })
      .catch(() => ({ _sum: { saleValue: null }, _count: 0 })),
    prisma.client.findUnique({
      where: { id: session.clientId },
      select: { slug: true, siteSubdomain: true, status: true },
    }),
    prisma.clientGbpReviews.findUnique({ where: { clientId: session.clientId } }).catch(() => null),
  ])

  const delta = thisWeek - lastWeek
  const siteUrl = client?.siteSubdomain
    ? `https://${client.siteSubdomain}.glassleads.app`
    : client
      ? `/sites/${client.slug}`
      : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">
          {newCount > 0 ? `${newCount} lead${newCount === 1 ? '' : 's'} need a call` : 'All caught up'}
        </h1>
        <p className="text-gray-500">
          {newCount > 0
            ? 'The faster you call, the more of these turn into work.'
            : 'Every lead has been picked up. Nice.'}
        </p>
      </div>

      {newCount > 0 && (
        <Link
          href="/portal/leads"
          className="flex items-center justify-between gap-3 rounded-2xl p-5 text-white shadow-sm"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <span className="flex items-center gap-3 font-semibold">
            <Phone className="h-5 w-5" />
            Call the {newCount} waiting {newCount === 1 ? 'lead' : 'leads'}
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="Leads this week"
          value={String(thisWeek)}
          sub={
            lastWeek === 0
              ? 'first week of data'
              : `${delta >= 0 ? '+' : ''}${delta} vs last week`
          }
          icon={Inbox}
        />
        <Link href="/portal/results" className="block no-underline">
          <Tile
            label="Booked this month"
            value={`$${(monthSales._sum.saleValue || 0).toLocaleString()}`}
            sub={`${monthSales._count} job${monthSales._count === 1 ? '' : 's'} marked sold · see every month`}
            icon={TrendingUp}
          />
        </Link>
        {reviews ? (
          <Tile
            label="Your Google rating"
            value={reviews.rating.toFixed(1)}
            sub={`${reviews.reviewCount} reviews · shown on your site`}
            icon={Star}
          />
        ) : (
          <Tile label="Your Google rating" value="—" sub="not connected yet" icon={Star} />
        )}
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
          <Globe className="h-4 w-4" />
          Your website
        </div>
        {client?.status !== 'ACTIVE' ? (
          <p className="text-amber-700">
            Your site is paused. Get in touch and we&apos;ll switch it back on.
          </p>
        ) : siteUrl ? (
          <>
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold break-all"
              style={{ color: 'var(--brand-ink)' }}
            >
              {siteUrl.replace('https://', '')}
            </a>
            <p className="text-sm text-gray-500 mt-1">
              Live and taking quote requests around the clock.
            </p>
          </>
        ) : (
          <p className="text-gray-500">Your site is being set up.</p>
        )}
        <Link
          href="/portal/website"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: 'var(--brand-ink)' }}
        >
          Update my website
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  )
}
