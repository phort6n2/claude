import type { Shop } from '@/lib/directory/types'
import { faviconUrl } from '@/lib/directory/format'
import { SafeShopImage } from './SafeShopImage'

/**
 * Shop-page hero: the business name over an image. Uses an uploaded photo when
 * available, otherwise a branded auto-glass cover. The name is the page's H1,
 * overlaid with a dark scrim for legibility, plus the business's favicon badge.
 */
export function ShopHero({ shop, photo }: { shop: Shop; photo?: string }) {
  const fav = faviconUrl(shop.website)
  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl border border-gray-200 sm:h-72">
      <SafeShopImage src={photo} alt={shop.name} slug={shop.slug} watermark={220} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-5 sm:p-6">
        {fav && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fav}
            alt=""
            width={48}
            height={48}
            className="h-11 w-11 shrink-0 rounded-xl bg-white p-1.5 shadow-md ring-1 ring-black/5 sm:h-12 sm:w-12"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-white drop-shadow sm:text-3xl">
            {shop.name}
          </h1>
          <p className="mt-0.5 text-sm text-white/85">
            {shop.city}, {shop.state.toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  )
}
