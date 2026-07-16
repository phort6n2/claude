import type { Metadata } from 'next'
import { Header } from '@/components/directory/Header'
import { Footer } from '@/components/directory/Footer'
import {
  websiteJsonLd,
  organizationJsonLd,
  jsonLdScript,
} from '@/lib/directory/seo'

const SITE_NAME = 'Windshield Repair HQ'
const SITE_DESCRIPTION =
  'Find trusted auto glass and windshield repair shops near you. Free directory of local windshield replacement, chip repair, ADAS calibration, and mobile auto glass services.'

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://windshieldrepairhq.com'
).replace(/\/$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Find Auto Glass & Windshield Shops Near You`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    title: `${SITE_NAME} — Find Auto Glass & Windshield Shops Near You`,
    description: SITE_DESCRIPTION,
  },
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Site-wide structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd()) }}
      />
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
