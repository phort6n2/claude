'use client'

import { useState } from 'react'

/**
 * A client's logo at list size — a fixed tile beside the shop's name, so a row
 * of fifteen reads as fifteen businesses rather than fifteen strings.
 *
 * A TILE, NOT A CROP. Almost every one of these logos is a wordmark, and a
 * square cropped to fill keeps the middle few letters — "AUTO GLASS KINGS"
 * once rendered as "J GL / KIN". So the box is fixed and the picture is
 * CONTAINED inside it: a wordmark runs out of width, a badge runs out of
 * height, and every row's name starts at the same x.
 *
 * NOT A FREE-WIDTH IMAGE EITHER, which is what the Clients list drew until it
 * moved onto this: a fixed height with the width left to the file, so a
 * wordmark ran 130px, a badge 32px, and every name started somewhere
 * different — while a white logo sat invisible on the white row.
 *
 * The tile is dark for a logo drawn for a dark background (headerIsDark, the
 * same decision the site's header makes) — EliteProGlass's white lettering is
 * invisible on the white tile everything else gets. No logo, or one that fails
 * to load, is the shop's initial on its brand colour, never a broken image.
 */
const SIZES = {
  sm: 'h-9 w-14 text-xs',
  lg: 'h-12 w-20 text-sm',
}

export default function ClientLogoTile({
  logoUrl,
  businessName,
  primaryColor,
  onDark = false,
  size = 'sm',
}: {
  logoUrl: string | null
  businessName: string
  primaryColor: string | null
  onDark?: boolean
  size?: keyof typeof SIZES
}) {
  const [failed, setFailed] = useState(false)

  if (!logoUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-md font-bold text-white`}
        style={{ backgroundColor: primaryColor || '#1e40af' }}
      >
        {businessName.trim()[0]?.toUpperCase()}
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex ${SIZES[size]} shrink-0 items-center justify-center overflow-hidden rounded-md border p-1 ${
        onDark ? 'border-gray-700 bg-[#16181d]' : 'border-gray-200 bg-white'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </span>
  )
}
