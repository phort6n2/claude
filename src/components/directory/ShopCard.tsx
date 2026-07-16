import Link from 'next/link'
import { MapPin, Phone, Truck, BadgeCheck, ArrowRight } from 'lucide-react'
import type { Shop } from '@/lib/directory/types'
import { serviceLabel, shopHref, cityHref } from '@/lib/directory/data'
import { telHref } from '@/lib/directory/format'
import { cn } from '@/lib/utils'
import { StarRating } from './StarRating'

export function ShopCard({
  shop,
  className,
}: {
  shop: Shop
  className?: string
}) {
  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ring-1 ring-transparent transition duration-200',
        'hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:ring-gray-100',
        'focus-within:ring-2 focus-within:ring-blue-500/60',
        shop.featured && 'border-blue-200 shadow-blue-100/40',
        className
      )}
    >
      {shop.featured && (
        <span className="absolute -top-2.5 left-5 inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
          Featured
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-snug text-gray-900">
            <Link
              href={shopHref(shop)}
              className="rounded-sm outline-none transition-colors after:absolute after:inset-0 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {shop.name}
            </Link>
          </h3>
          <Link
            href={cityHref(shop)}
            className="relative z-10 mt-1 inline-flex items-center gap-1 text-sm text-gray-500 outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600"
          >
            <MapPin width={14} height={14} className="shrink-0 text-gray-400" />
            <span className="truncate">
              {shop.city}, {shop.state.toUpperCase()}
            </span>
          </Link>
        </div>
        {shop.claimed && (
          <span
            title="Verified listing"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/10"
          >
            <BadgeCheck width={13} height={13} /> Verified
          </span>
        )}
      </div>

      {shop.rating != null && (
        <div className="mt-2.5">
          <StarRating rating={shop.rating} reviewCount={shop.reviewCount} />
        </div>
      )}

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
        {shop.description}
      </p>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {shop.mobileService && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/10">
            <Truck width={12} height={12} /> Mobile service
          </span>
        )}
        {shop.services.slice(0, 3).map((s) => (
          <span
            key={s}
            className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
          >
            {serviceLabel(s)}
          </span>
        ))}
        {shop.services.length > 3 && (
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            +{shop.services.length - 3} more
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Link
          href={shopHref(shop)}
          className="group/btn relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-center text-sm font-medium text-white outline-none transition-colors hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          View details
          <ArrowRight
            width={14}
            height={14}
            className="transition-transform duration-200 group-hover/btn:translate-x-0.5"
          />
        </Link>
        <a
          href={telHref(shop.phone)}
          aria-label={`Call ${shop.name} at ${shop.phone}`}
          className="relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors hover:border-gray-400 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Phone width={14} height={14} /> Call
        </a>
      </div>
    </article>
  )
}
