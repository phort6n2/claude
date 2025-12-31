'use client'

import { useState } from 'react'

interface ClientLogoProps {
  logoUrl: string | null
  businessName: string
  primaryColor: string | null
}

export default function ClientLogo({ logoUrl, businessName, primaryColor }: ClientLogoProps) {
  const [imageError, setImageError] = useState(false)

  if (!logoUrl || imageError) {
    return (
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-medium"
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
      className="h-10 w-10 rounded-full object-cover"
      onError={() => setImageError(true)}
    />
  )
}
