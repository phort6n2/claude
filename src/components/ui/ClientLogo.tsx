'use client'

import { useState } from 'react'

interface ClientLogoProps {
  logoUrl: string | null
  businessName: string
  primaryColor: string | null
  size?: 'sm' | 'md' | 'lg'
}

/** The monogram is a circle — an initial on a brand colour IS an avatar. */
const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
}

/**
 * A REAL LOGO IS NOT A CIRCLE.
 *
 * These were square, cropped to fill and clipped round, which for a wordmark
 * — and almost every one of these shops has a wordmark — keeps the middle few
 * letters and throws the rest away. "AUTO GLASS KINGS" rendered in the
 * client's own portal as "J GL / KIN". Fixed height, width free, capped so a
 * very wide mark cannot shove the name off a phone.
 */
const logoSizes = {
  sm: 'h-8 max-w-[132px]',
  md: 'h-10 max-w-[160px]',
  lg: 'h-12 max-w-[200px]',
}

export default function ClientLogo({ logoUrl, businessName, primaryColor, size = 'md' }: ClientLogoProps) {
  const [imageError, setImageError] = useState(false)
  const sizeClass = sizeClasses[size]

  if (!logoUrl || imageError) {
    return (
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0`}
        style={{ backgroundColor: primaryColor || '#1e40af' }}
      >
        {businessName[0]}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={businessName}
      className={`${logoSizes[size]} w-auto object-contain flex-shrink-0`}
      onError={() => setImageError(true)}
    />
  )
}
