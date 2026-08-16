import {
  CalendarCheck,
  Camera,
  Globe,
  Inbox,
  MapPin,
  PhoneCall,
  Star,
  TrendingUp,
} from 'lucide-react'
import type { ActivityKind, ActivityMonth } from '@/lib/client-activity'

/**
 * The work, dated, newest first.
 *
 * One component for the client's portal and the admin's view of a client, so
 * the two can never say different things — the whole value of showing a
 * client this is that it is the same feed you are looking at.
 */

const ICONS: Record<ActivityKind, React.ElementType> = {
  ranking: TrendingUp,
  website: Globe,
  photos: Camera,
  reviews: Star,
  calls: PhoneCall,
  leads: Inbox,
  ads: CalendarCheck,
  setup: MapPin,
}

export default function ActivityFeed({ months }: { months: ActivityMonth[] }) {
  if (months.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900">Nothing to show yet</h2>
        <p className="mt-1 text-sm text-gray-600 max-w-prose">
          This fills in as work happens — ranking scans, photos and pages added to your site,
          calls reviewed, and enquiries delivered.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {months.map((month) => (
        <section key={month.month.toISOString()}>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">
            {month.label}
          </h2>
          <ol className="relative border-l border-gray-200 ml-3">
            {month.items.map((item, i) => {
              const Icon = ICONS[item.kind]
              return (
                <li key={`${item.at.toISOString()}-${i}`} className="mb-5 ml-6 last:mb-0">
                  <span className="absolute -left-[13px] grid h-6 w-6 place-items-center rounded-full bg-white ring-1 ring-gray-200">
                    <Icon className="h-3.5 w-3.5 text-[var(--brand-ink,#1e40af)]" />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="font-semibold text-gray-900 m-0">{item.title}</p>
                    <time
                      className="text-xs text-gray-500"
                      dateTime={item.at.toISOString()}
                    >
                      {item.at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </time>
                  </div>
                  {item.detail && (
                    <p className="mt-0.5 mb-0 text-sm text-gray-600 max-w-prose">{item.detail}</p>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
