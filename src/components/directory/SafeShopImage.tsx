'use client'

import { useState } from 'react'
import { ShopCover } from './ShopCover'

/**
 * Displays a shop image (uploaded photo or the website's og:image) and falls
 * back to the branded cover if the image is missing or fails to load — so a
 * broken/hotlink-protected website image never shows as a broken-image icon.
 */
export function SafeShopImage({
  src,
  alt,
  slug,
  watermark,
}: {
  src?: string
  alt: string
  slug: string
  watermark?: number
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return <ShopCover slug={slug} watermark={watermark} />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  )
}
