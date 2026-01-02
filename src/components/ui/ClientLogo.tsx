'use client'

import { useState } from 'react'

interface ClientLogoProps {
  logoUrl: string | null
  businessName: string
  primaryColor: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
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
    <img
      src={logoUrl}
      alt={businessName}
      className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      onError={() => setImageError(true)}
    />
  )
}
