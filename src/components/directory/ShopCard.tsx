import Link from 'next/link'
import { MapPin, Phone, Truck, BadgeCheck } from 'lucide-react'
import type { Shop } from '@/lib/directory/types'
import { serviceLabel, shopHref, cityHref } from '@/lib/directory/data'
import { telHref } from '@/lib/directory/format'
import { StarRating } from './StarRating'

export function ShopCard({ shop }: { shop: Shop }) {
  return (
    <div className="relative flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {shop.featured && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">
          Featured
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-tight text-gray-900">
            <Link href={shopHref(shop)} className="hover:text-blue-600">
              {shop.name}
            </Link>
          </h3>
          <Link
            href={cityHref(shop)}
            className="mt-1 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"
          >
            <MapPin width={14} height={14} />
            {shop.city}, {shop.state.toUpperCase()}
          </Link>
        </div>
        {shop.claimed && (
          <span
            title="Verified listing"
            className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
          >
            <BadgeCheck width={13} height={13} /> Verified
          </span>
        )}
      </div>

      {shop.rating != null && (
        <div className="mt-2">
          <StarRating rating={shop.rating} reviewCount={shop.reviewCount} />
        </div>
      )}

      <p className="mt-3 line-clamp-2 text-sm text-gray-600">{shop.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {shop.mobileService && (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
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

      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Link
          href={shopHref(shop)}
          className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-gray-700"
        >
          View details
        </Link>
        <a
          href={telHref(shop.phone)}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Phone width={14} height={14} /> Call
        </a>
      </div>
    </div>
  )
}
