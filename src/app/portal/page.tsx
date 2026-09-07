import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Inbox,
  Phone,
  TrendingUp,
  ArrowRight,
  Star,
  Search,
  PhoneMissed,
  CircleDollarSign,
} from 'lucide-react'
import { getPortalSession } from '@/lib/portal-auth'
import { prisma } from '@/lib/db'
import { deliverabilityGuide } from '@/lib/alert-deliverability'
import GettingStartedCard from '@/components/portal/GettingStartedCard'
import { PRIMARY_DOMAIN_SELECT } from '@/lib/site-origin'
import { DEFAULT_RANGE } from '@/lib/site-analytics'
import { countRecentMissed, countAnsweredCalls } from '@/lib/call-patterns'
import { formatMoney } from '@/lib/monthly-report'

export const dynamic = 'force-dynamic'

/**
 * Portal home — the value screen. A shop owner logging in should see, in one
 * glance, that the product is working: leads arriving, work booked, and their
 * site live. Everything here is scoped to the session's own client.
 */

/**
 * Is this value a FIGURE or a PHRASE? Same rule as the traffic and calls
 * tiles, so all three screens size a value identically.
 */
const NUMERIC = /^(—|\$?[\d,.]+%?)$/

type Tone = 'plain' | 'feature' | 'warn'

/**
 * A dashboard tile.
 *
 * THREE LEVELS, AND AT MOST TWO COLOURED AT ONCE. If every tile is emphasised
 * none of them is. Urgency is already carried by the full-width banners above
 * the grid, so the grid's job is the quieter question — "is this working" —
 * and exactly one tile earns the accent for answering it.
 *
 * NO TILE IS EVER FILLED WITH THE BRAND COLOUR. The accent is a 6% wash with
 * brand-INK text on it, so an arbitrary hue can never put light text on a
 * light fill. That is what makes this safe for a yellow shop.
 *
 * `muted` outranks `tone`: a celebratory card reading "$0" is worse than a
 * plain one, so a placeholder value forces the tile quiet.
 */
function Tile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'plain',
  muted = false,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  tone?: Tone
  muted?: boolean
}) {
  const t: Tone = muted ? 'plain' : tone
  return (
    <div
      className={[
        'rounded-2xl border p-5 h-full transition-all duration-150 group-hover:-translate-y-px',
        t === 'warn' ? 'bg-amber-50 border-amber-200' : '',
        t === 'feature' ? 'border-transparent' : '',
        t === 'plain'
          ? 'bg-white border-gray-200 shadow-[0_1px_2px_rgba(16,24,40,0.05)] group-hover:shadow-[0_4px_16px_-6px_rgba(16,24,40,0.18)] group-hover:border-gray-300'
          : '',
      ].join(' ')}
      style={
        t === 'feature'
          ? {
              backgroundColor: 'var(--brand-wash)',
              borderColor: 'var(--brand-edge)',
              boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 10px 28px -14px var(--brand-glow)',
            }
          : undefined
      }
    >
      <div
        className={`flex items-center gap-2.5 text-sm font-semibold ${
          t === 'warn'
            ? 'text-amber-800'
            : t === 'feature'
              ? 'text-[var(--brand-ink)]'
              : 'text-gray-500'
        }`}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
            t === 'warn' ? 'bg-amber-100' : ''
          }`}
          style={t === 'warn' ? undefined : { backgroundColor: 'var(--brand-chip)' }}
        >
          <Icon
            className={`h-4 w-4 ${t === 'warn' ? 'text-amber-700' : 'text-[var(--brand-ink)]'}`}
          />
        </span>
        {label}
      </div>
      <p
        className={[
          'mt-3 break-words',
          /* Smaller on a phone, where the grid is two columns: "$10,920" at
             32px broke across two lines inside a half-width card, which is
             worse than the same figure one size down. */
          NUMERIC.test(value)
            ? 'text-2xl sm:text-[2rem] leading-none font-extrabold tabular-nums'
            : 'text-lg sm:text-xl font-bold leading-snug',
          muted
            ? 'text-gray-300'
            : t === 'warn'
              ? 'text-amber-900'
              : t === 'feature'
                ? 'text-[var(--brand-ink)]'
                : 'text-gray-900',
        ].join(' ')}
      >
        {value}
      </p>
      {/* gray-600, not gray-500: on a phone in a workshop the sub-line is the
          one that gets lost. */}
      {sub && (
        <p className={`text-sm mt-1.5 ${t === 'warn' ? 'text-amber-800' : 'text-gray-600'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

/** The wrapper a linked tile needs: it owns the hover group and the focus ring. */
const TILE_LINK =
  'group block no-underline rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-ink)]'

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
        /* SAME SHAPE AS THE RESULTS PAGE, which this tile links to. It used
           to include duplicates and bucket by updatedAt, so a lead created in
           August and marked sold in September appeared in September here and
           in August there — two pages disagreeing about the same month, one
           of them a tap from the other. */
        where: {
          clientId: session.clientId,
          duplicateOfLeadId: null,
          status: 'SOLD',
          createdAt: { gte: monthStart },
        },
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
        createdAt: true,
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
  const [
    onboarding,
    notification,
    totalLeads,
    actionedLeads,
    guide,
    missedCalls,
    answeredCalls,
    bookedEver,
    leadsEver,
  ] = await Promise.all([
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
    countAnsweredCalls(session.clientId),
    /* LIFETIME BOOKED — the number that answers "is this worth the monthly
       fee". Duplicates excluded to match the Results page exactly: a second
       submission from the same person on the same day is not a second job. */
    prisma.lead
      .aggregate({
        where: { clientId: session.clientId, duplicateOfLeadId: null, status: 'SOLD' },
        _sum: { saleValue: true },
        _count: true,
      })
      .catch(() => ({ _sum: { saleValue: null }, _count: 0 })),
    prisma.lead
      .count({ where: { clientId: session.clientId, duplicateOfLeadId: null } })
      .catch(() => 0),
  ])

  const alertsConfirmed = !!onboarding?.alertsConfirmedAt
  const appInstalled = !!onboarding?.appInstalledAt
  const walkthroughDone = alertsConfirmed && appInstalled && totalLeads > 0 && actionedLeads > 0
  const showWalkthrough = !onboarding?.dismissedAt && !walkthroughDone

  const delta = thisWeek - lastWeek
  const trafficConnected = !!(client?.ga4PropertyId || client?.searchConsoleSiteUrl)
  const bookedRevenue = bookedEver._sum.saleValue || 0
  const bookedJobs = bookedEver._count
  const joinedLabel = client?.createdAt
    ? client.createdAt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null
  /* Their actual first week, not "we happened to see nothing last week". */
  const isFirstWeek = !!client?.createdAt && Date.now() - client.createdAt.getTime() < 14 * 86400000
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

      {/* PAUSED IS A STATUS, and an urgent one — it belonged with the other
          banners rather than below six tiles at the bottom of the page. */}
      {client?.status === 'PAUSED' && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 font-semibold text-amber-900">
          Your site is paused. Get in touch and we&apos;ll switch it back on.
        </p>
      )}

      {/* Two columns on a phone, three on a desktop: six tiles fill both
          exactly, and halving the scroll matters more than a wider card.
          ONE column below 360px, though — on the narrowest phones still in use
          a half-width card is ~140px and "$10,920" breaks across two lines,
          which is worse than any amount of scrolling. */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {/* THE ONE ACCENTED TILE, and only when there is a figure in it. It
            answers the question the grid exists for — is this worth what I
            pay — and it only ever grows. Urgency is handled by the banners
            above; a second shouting card in the grid would flatten both. */}
        <Link
          href="/portal/results"
          className={`${TILE_LINK} min-[360px]:col-span-2 sm:col-span-1`}
        >
          <Tile
            label="Booked since you joined"
            value={
              bookedRevenue > 0
                ? formatMoney(bookedRevenue)
                : bookedJobs > 0
                  ? `${bookedJobs} ${bookedJobs === 1 ? 'job' : 'jobs'}`
                  : '—'
            }
            sub={
              bookedRevenue > 0
                ? `${bookedJobs} ${bookedJobs === 1 ? 'job' : 'jobs'} from ${leadsEver.toLocaleString()} ${leadsEver === 1 ? 'enquiry' : 'enquiries'}${joinedLabel ? ` · since ${joinedLabel}` : ''}`
                : bookedJobs > 0
                  ? `from ${leadsEver.toLocaleString()} enquiries · add what each was worth and this shows the money`
                  : leadsEver > 0
                    ? 'Mark a lead booked and this fills in'
                    : 'Fills in as your first jobs come in'
            }
            icon={CircleDollarSign}
            tone="feature"
            /* Never "$0" — a shop that knows it booked work and sees zero
               learns the portal is wrong. */
            muted={bookedRevenue === 0 && bookedJobs === 0}
          />
        </Link>

        <Tile
          label="Leads this week"
          value={String(thisWeek)}
          sub={
            /* "first week of data" is a CLAIM, and it was made whenever last
               week happened to be empty — telling a shop in its second year
               that this is their first week. */
            isFirstWeek
              ? 'first week of data'
              : lastWeek === 0
                ? 'none last week'
                : `${delta >= 0 ? '+' : ''}${delta} vs last week`
          }
          icon={Inbox}
        />

        <Link href="/portal/results" className={TILE_LINK}>
          <Tile
            label="Booked this month"
            value={formatMoney(monthSales._sum.saleValue || 0)}
            sub={`${monthSales._count} job${monthSales._count === 1 ? '' : 's'} marked sold · see every month`}
            icon={TrendingUp}
            muted={!monthSales._count}
          />
        </Link>

        <Link href="/portal/calls" className={TILE_LINK}>
          {/* LEADS WITH ANSWERED, not missed. The missed count is already in
              the amber banner 250px above; repeating it made the tile a
              duplicate when there were any and a dash when there were none. */}
          <Tile
            label="Calls answered"
            value={answeredCalls.toLocaleString()}
            sub={
              answeredCalls || missedCalls
                ? 'through your tracked line · see when people ring'
                : 'once calls come through your tracked line'
            }
            icon={Phone}
            muted={!answeredCalls && !missedCalls}
          />
        </Link>

        <Link href="/portal/traffic" className={TILE_LINK}>
          <Tile
            label="How people find you"
            value={visitors !== null ? visitors.toLocaleString() : '—'}
            sub={
              visitors !== null
                ? 'found your website in 90 days'
                : trafficConnected
                  ? 'visitors, searches and your best pages'
                  : 'see what search could bring you'
            }
            icon={Search}
            muted={visitors === null}
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
          <Tile label="Your Google rating" value="—" sub="not connected yet" icon={Star} muted />
        )}
      </div>

    </div>
  )
}
