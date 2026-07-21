import Link from 'next/link'
import { MapPin, Phone, Truck, BadgeCheck, ArrowRight } from 'lucide-react'
import type { Shop } from '@/lib/directory/types'
import { serviceLabel, shopHref, cityHref } from '@/lib/directory/data'
import { telHref, faviconUrl } from '@/lib/directory/format'
import { cn } from '@/lib/utils'
import { StarRating } from './StarRating'
import { SafeShopImage } from './SafeShopImage'
import { OpenNow } from './OpenNow'

export function ShopCard({
  shop,
  className,
}: {
  shop: Shop
  className?: string
}) {
  const favicon = faviconUrl(shop.website)
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ring-1 ring-transparent transition duration-200',
        'hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:ring-gray-100',
        'focus-within:ring-2 focus-within:ring-blue-500/60',
        shop.featured && 'border-blue-200',
        className
      )}
    >
      {/* Photo band — website/owner photo, else a branded auto-glass cover */}
      <div className="relative h-36 w-full shrink-0 overflow-hidden border-b border-gray-100">
        <SafeShopImage src={shop.photos?.[0]} alt={shop.name} slug={shop.slug} />
        {shop.featured && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
            Featured
          </span>
        )}
        {shop.claimed && (
          <span
            title="Verified listing"
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-medium text-green-700 shadow-sm ring-1 ring-inset ring-green-600/10"
          >
            <BadgeCheck width={13} height={13} /> Verified
          </span>
        )}
        {favicon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={favicon}
            alt=""
            width={32}
            height={32}
            className="absolute bottom-2 left-3 h-8 w-8 rounded-lg bg-white p-1 shadow ring-1 ring-black/5"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
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
          className="relative z-10 mt-1 inline-flex w-fit items-center gap-1 text-sm text-gray-500 outline-none transition-colors hover:text-blue-600 focus-visible:text-blue-600"
        >
          <MapPin width={14} height={14} className="shrink-0 text-gray-400" />
          <span className="truncate">
            {shop.city}, {shop.state.toUpperCase()}
          </span>
        </Link>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {shop.rating != null && (
            <span className="inline-flex items-center gap-1.5">
              <StarRating rating={shop.rating} reviewCount={shop.reviewCount} />
              <span className="text-xs text-gray-400">Google</span>
            </span>
          )}
          <OpenNow hours={shop.hours} />
        </div>

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

        {/* CTA row — Call is primary (the directory's core conversion) */}
        <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-4">
          <a
            href={telHref(shop.phone)}
            aria-label={`Call ${shop.name} at ${shop.phone}`}
            className="relative z-10 inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Phone width={14} height={14} /> Call
          </a>
          <Link
            href={shopHref(shop)}
            className="group/btn relative z-10 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none transition-colors hover:border-gray-400 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
          >
            Details
            <ArrowRight
              width={14}
              height={14}
              className="transition-transform duration-200 group-hover/btn:translate-x-0.5"
            />
          </Link>
        </div>
      </div>
    </article>
  )
}
