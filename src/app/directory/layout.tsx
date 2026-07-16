import type { Metadata } from 'next'
import { Header } from '@/components/directory/Header'
import { Footer } from '@/components/directory/Footer'

const SITE_NAME = 'AutoGlass Directory'
const SITE_DESCRIPTION =
  'Find trusted auto glass and windshield repair shops near you. Free directory of local windshield replacement, chip repair, ADAS calibration, and mobile auto glass services.'

export const metadata: Metadata = {
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
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
