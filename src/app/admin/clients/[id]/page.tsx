export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Inbox,
  Star,
  Globe,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  MapPin,
} from 'lucide-react'
import { prisma } from '@/lib/db'
import { getSiteExtras } from '@/lib/site-content'
import CopyField from '@/components/admin/CopyField'
import { requireAdminPage } from '@/lib/admin-guard'

/**
 * Client overview — "is this client OK, and where do I go?".
 *
 * Read-only health at a glance; every card links to the tab that fixes what
 * it reports. Reads are defensive so a table that predates a migration only
 * costs its own card.
 */

interface PageProps {
  params: Promise<{ id: string }>
}

function timeAgo(date: Date | null | undefined) {
  if (!date) return null
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function Card({
  title,
  icon: Icon,
  tone = 'ok',
  href,
  linkLabel,
  children,
}: {
  title: string
  icon: React.ElementType
  tone?: 'ok' | 'warn' | 'bad' | 'idle'
  href?: string
  linkLabel?: string
  children: React.ReactNode
}) {
  const tones = {
    ok: 'text-green-600 bg-green-50',
    warn: 'text-amber-600 bg-amber-50',
    bad: 'text-red-600 bg-red-50',
    idle: 'text-gray-400 bg-gray-50',
  }
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
      </div>
      <div className="text-sm text-gray-600 flex-1 space-y-1">{children}</div>
      {href && (
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </section>
  )
}

export default async function ClientOverviewPage({ params }: PageProps) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id } })
  if (!client) notFound()

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [leadCount, lastLead, reviews, destinations, extras, userCount] = await Promise.all([
    prisma.lead.count({ where: { clientId: id, createdAt: { gte: weekAgo } } }),
    prisma.lead.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.clientGbpReviews.findUnique({ where: { clientId: id } }).catch(() => null),
    prisma.webhookDestination
      .findMany({
        where: { clientId: id },
        select: {
          id: true,
          label: true,
          enabled: true,
          deliveries: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, lastError: true, createdAt: true },
          },
        },
      })
      .catch(() => []),
    getSiteExtras(id),
    prisma.clientUser.count({ where: { clientId: id } }).catch(() => 0),
  ])

  const base = `/admin/clients/${id}`
  const siteUrl = client.siteSubdomain
    ? `https://${client.siteSubdomain}.glassleads.app`
    : null

  // Lead delivery health
  const enabled = destinations.filter((d) => d.enabled)
  const failing = enabled.filter((d) => d.deliveries[0]?.status === 'FAILED')

  // Review freshness
  const reviewAgeDays = reviews?.fetchedAt
    ? Math.floor((Date.now() - new Date(reviews.fetchedAt).getTime()) / 86400000)
    : null

  // Site content completeness
  const missing: string[] = []
  if (!extras.warrantyText) missing.push('warranty')
  if (extras.faq.length === 0) missing.push('FAQs')
  if (extras.galleryPhotos.length === 0) missing.push('photos')
  if (extras.chapters.length === 0) missing.push('story sections')

  const webhookUrl = `https://glassleads.app/api/webhooks/highlevel/lead?client=${client.slug}`
  const embed = `<script src="https://glassleads.app/widget.js" data-client="${client.slug}" async></script>\n<div data-glassleads-widget></div>`

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Leads"
          icon={Inbox}
          tone={leadCount > 0 ? 'ok' : 'idle'}
          href={`/admin/leads?clientId=${client.id}`}
          linkLabel="Open leads"
        >
          <p className="text-2xl font-bold text-gray-900">{leadCount}</p>
          <p>in the last 7 days</p>
          <p className="text-gray-400">
            {lastLead ? `Last lead ${timeAgo(lastLead.createdAt)}` : 'No leads yet'}
          </p>
        </Card>

        <Card
          title="Lead delivery"
          icon={failing.length ? AlertTriangle : CheckCircle2}
          tone={failing.length ? 'bad' : enabled.length ? 'ok' : 'idle'}
          href={`${base}/leads-setup`}
          linkLabel="Manage delivery"
        >
          {enabled.length === 0 ? (
            <p>No destinations — leads are stored here only.</p>
          ) : failing.length ? (
            <>
              <p className="text-red-700 font-medium">
                {failing.length} of {enabled.length} failing
              </p>
              <p className="text-gray-400 truncate">{failing[0].deliveries[0]?.lastError}</p>
            </>
          ) : (
            <p>
              {enabled.length} destination{enabled.length === 1 ? '' : 's'} delivering normally.
            </p>
          )}
        </Card>

        <Card
          title="Google reviews"
          icon={Star}
          tone={reviews?.lastError ? 'bad' : reviewAgeDays !== null && reviewAgeDays > 14 ? 'warn' : reviews ? 'ok' : 'idle'}
          href={`${base}/site`}
          linkLabel="Site settings"
        >
          {reviews ? (
            <>
              <p className="text-2xl font-bold text-gray-900">
                {reviews.rating.toFixed(1)}
                <span className="text-sm font-normal text-gray-500"> · {reviews.reviewCount} reviews</span>
              </p>
              <p className="text-gray-400">Updated {timeAgo(reviews.fetchedAt)}</p>
              {reviews.lastError && <p className="text-red-600">{reviews.lastError}</p>}
            </>
          ) : (
            <p>Not connected — the site shows no ratings until reviews are pulled.</p>
          )}
        </Card>

        <Card
          title="Website"
          icon={Globe}
          tone={client.siteSubdomain ? 'ok' : 'warn'}
          href={`${base}/site`}
          linkLabel="Edit site content"
        >
          {siteUrl ? (
            <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 break-all">
              {client.siteSubdomain}.glassleads.app
            </a>
          ) : (
            <p>No subdomain connected yet.</p>
          )}
          <p className="text-gray-400">
            {missing.length === 0
              ? 'All content sections filled.'
              : `Missing: ${missing.join(', ')}`}
          </p>
        </Card>

        <Card
          title="Service areas"
          icon={MapPin}
          tone={(client.serviceAreas || []).length ? 'ok' : 'warn'}
          href={`${base}/business`}
          linkLabel="Edit areas"
        >
          <p className="text-2xl font-bold text-gray-900">{(client.serviceAreas || []).length}</p>
          <p>cities · first 5 get location pages</p>
        </Card>

        <Card
          title="Portal users"
          icon={CheckCircle2}
          tone={userCount ? 'ok' : 'idle'}
          href={`${base}/users`}
          linkLabel="Manage users"
        >
          <p className="text-2xl font-bold text-gray-900">{userCount}</p>
          <p>{userCount === 1 ? 'person can' : 'people can'} log in to the client portal</p>
        </Card>
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Integration</h2>
          <p className="text-sm text-gray-500">Paste these into the client&apos;s forms and site.</p>
        </div>
        <CopyField label="Inbound webhook URL" value={webhookUrl} />
        <CopyField label="Widget embed snippet" value={embed} multiline />
      </section>
    </div>
  )
}
