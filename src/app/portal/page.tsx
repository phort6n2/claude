import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Inbox, Phone, Globe, TrendingUp, ArrowRight, Star, Search, PhoneMissed } from 'lucide-react'
import { getPortalSession } from '@/lib/portal-auth'
import { prisma } from '@/lib/db'
import { deliverabilityGuide } from '@/lib/alert-deliverability'
import GettingStartedCard from '@/components/portal/GettingStartedCard'
import { siteLinkFor, PRIMARY_DOMAIN_SELECT } from '@/lib/site-origin'
import { DEFAULT_RANGE } from '@/lib/site-analytics'
import { countRecentMissed } from '@/lib/call-patterns'

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

  const [thisWeek, lastWeek, newCount, monthSales, client, reviews, trafficSnapshot] =
    await Promise.all([
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
      // domains, or the client opens their own portal after a cutover and
      // sees the platform's subdomain where their domain should be.
      select: {
        slug: true,
        siteSubdomain: true,
        status: true,
        domains: PRIMARY_DOMAIN_SELECT,
        // Decides whether the traffic tile reads as a report or as an offer.
        // Not a tab: the phone tab bar is full at five — see PortalNav.
        ga4PropertyId: true,
        searchConsoleSiteUrl: true,
      },
    }),
    prisma.clientGbpReviews.findUnique({ where: { clientId: session.clientId } }).catch(() => null),
    prisma.siteTrafficSnapshot
      // The default window, which is what the tile's number claims to be. Any
      // other range the shop happens to have opened is a different question.
      .findUnique({
        where: { clientId_range: { clientId: session.clientId, range: DEFAULT_RANGE } },
        select: { traffic: true },
      })
      .catch(() => null),
  ])

  // The walkthrough's state. Two of its steps are derived — a lead exists,
  // and a lead has been acted on — so the card can tick itself the moment the
  // product does its job.
  const [onboarding, notification, totalLeads, actionedLeads, guide, missedCalls] =
    await Promise.all([
    prisma.clientOnboarding.findUnique({ where: { clientId: session.clientId } }).catch(() => null),
    prisma.clientNotification
      .findUnique({
        where: { clientId: session.clientId },
        select: { emailEnabled: true, emailTo: true, smsEnabled: true, smsTo: true },
      })
      .catch(() => null),
    prisma.lead.count({ where: { clientId: session.clientId } }).catch(() => 0),
    prisma.lead
      .count({
        where: {
          clientId: session.clientId,
          OR: [{ firstTouchedAt: { not: null } }, { status: { not: 'NEW' } }],
        },
      })
      .catch(() => 0),
    deliverabilityGuide().catch(() => null),
    countRecentMissed(session.clientId),
  ])

  const alertsConfirmed = !!onboarding?.alertsConfirmedAt
  const appInstalled = !!onboarding?.appInstalledAt
  const walkthroughDone = alertsConfirmed && appInstalled && totalLeads > 0 && actionedLeads > 0
  const showWalkthrough = !onboarding?.dismissedAt && !walkthroughDone

  const delta = thisWeek - lastWeek
  const siteUrl = client ? siteLinkFor(client) : null
  const trafficConnected = !!(client?.ga4PropertyId || client?.searchConsoleSiteUrl)
  // The stored snapshot only — never a live Google call. This is the home
  // screen; it must not wait on two external APIs to draw a tile.
  const visitors =
    trafficConnected && trafficSnapshot?.traffic
      ? ((trafficSnapshot.traffic as { activeUsers?: number }).activeUsers ?? null)
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

      {/* MISSED CALLS SIT WITH THE WAITING LEADS, because they are the same
          thing: somebody tried to reach this shop and nobody has got back to
          them. It was recorded from the day call tracking shipped and shown
          to nobody. */}
      {missedCalls > 0 && (
        <Link
          href="/portal/calls"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 no-underline"
        >
          <span className="flex items-center gap-3 font-semibold">
            <PhoneMissed className="h-5 w-5" />
            {missedCalls} missed {missedCalls === 1 ? 'call' : 'calls'} in the last 7 days
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
      )}

      {/* Below the waiting-leads banner on purpose: a lead that needs a call
          outranks set-up, always. */}
      {showWalkthrough && (
        <GettingStartedCard
          senders={
            guide?.senders ?? { emailAddress: null, emailName: 'AUTO GLASS LEAD', smsNumber: null }
          }
          emailSteps={guide?.email ?? []}
          smsSteps={guide?.sms ?? []}
          recipients={{
            emails: notification?.emailEnabled ? (notification?.emailTo ?? []) : [],
            phones: notification?.smsEnabled ? (notification?.smsTo ?? []) : [],
          }}
          hasRecipients={
            !!(
              (notification?.emailEnabled && (notification?.emailTo?.length ?? 0) > 0) ||
              (notification?.smsEnabled && (notification?.smsTo?.length ?? 0) > 0)
            )
          }
          testSentAt={onboarding?.testAlertSentAt?.toISOString() ?? null}
          alertsConfirmed={alertsConfirmed}
          appInstalled={appInstalled}
          hasLead={totalLeads > 0}
          hasActioned={actionedLeads > 0}
        />
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
        <Link href="/portal/calls" className="block no-underline">
          <Tile
            label="Your phone"
            value={missedCalls > 0 ? String(missedCalls) : '—'}
            sub={
              missedCalls > 0
                ? 'missed calls to ring back'
                : 'missed calls, and when people ring'
            }
            icon={Phone}
          />
        </Link>
        <Link href="/portal/traffic" className="block no-underline">
          <Tile
            label="How people find you"
            // A number when there is one, and the same "—" the rating tile
            // uses when there is not. "SEO" set in 30px bold read as a
            // heading rather than a value.
            value={visitors !== null ? visitors.toLocaleString() : '—'}
            sub={
              visitors !== null
                ? 'found your website in 90 days'
                : trafficConnected
                  ? 'visitors, searches and your best pages'
                  : 'see what search could bring you'
            }
            icon={Search}
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
        {client?.status === 'PAUSED' ? (
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
        {/* LOOK, not edit. The site is ours to run — a change to it is a
            conversation, not a form — so this opens the live page rather than
            an editor. Anything that needs changing, they tell us. */}
        {siteUrl && (
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: 'var(--brand-ink)' }}
          >
            Open my site
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        )}
      </section>
    </div>
  )
}
