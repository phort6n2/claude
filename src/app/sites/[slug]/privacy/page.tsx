import { canViewSite, isPreview, siteIsLive } from '@/lib/site-preview'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { siteClientWhere } from '@/lib/site-client'
import { sitePathPrefixFor } from '@/lib/site-origin'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { LegalShell, PrivacyContent } from '@/components/sites/legal'
import { getSiteExtras } from '@/lib/site-content'
import { keptPagesFor } from '@/lib/site-pages'
import { getAdsTracking } from '@/lib/ads-tracking'
import type { SiteMeasurement } from '@/components/sites/legal'

export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getClient(slug: string) {
  return prisma.client.findFirst({
    where: siteClientWhere(slug),
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      // So the policy names the address the reader is on.
      domains: { where: { isPrimary: true }, select: { domain: true, verified: true, misconfigured: true }, take: 1 },
      status: true,
      businessName: true,
      phone: true,
      siteDisplayPhone: true,
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      marketArea: true,
      logoUrl: true,
      footerLogoUrl: true,
      logoSurface: true,
      logoSurfaceUrl: true,
      headerTheme: true,
      primaryColor: true,
      accentColor: true,
      hasShopLocation: true,
      googleMapsUrl: true,
      clarityProjectId: true,
    },
  })
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client || !(await canViewSite(client.status))) return { title: 'Not Found' }
  return {
    title: `Privacy Policy | ${client.businessName}`,
    // See the note on the terms page: without one, Next inherits the root
    // layout's description, which is the platform's own.
    description: `What ${client.businessName} collects through this website, why, and what you can ask us to do about it.`,
    robots: { index: false },
    alternates: {
      canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app/privacy`,
    },
  }
}

export default async function PrivacyPage({ params }: PageProps) {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client) notFound()
  const preview = await isPreview(client.status)
  if (!siteIsLive(client.status) && !preview) return <SiteUnavailable />
  // Visitors see the tracking number when one is set; see lib/site-phone.ts.
  // Object.assign, not `client.phone = …`: the swap now also carries the
  // shop's own line for the callback and SMS copy, and taking only `.phone`
  // would drop it. See site-phone.ts.
  Object.assign(client, await withSitePhone(client))
  const basePath = sitePathPrefixFor(client, (await headers()).get('host'))
  const [extras, keptPages, tracking, recordingNumbers] = await Promise.all([
    getSiteExtras(client.id),
    keptPagesFor(client.id, client.businessName),
    getAdsTracking(client.id),
    prisma.trackingNumber.count({ where: { clientId: client.id, active: true, recordCalls: true } }).catch(() => 0),
  ])
  /* The tag-by-tag disclosure and the opt-out are rendered for a client with
     privacy choices on (any client with a Meta Pixel, or switched on by
     hand), so every other shop's policy reads exactly as it did. */
  const measurement: SiteMeasurement | undefined = tracking?.privacyChoices
    ? {
        googleAds: !!tracking.conversionId,
        googleAnalytics: !!tracking.ga4MeasurementId,
        microsoftUet: !!tracking.bingUetTagId,
        metaPixel: !!tracking.metaPixelId,
        metaCapi: tracking.metaCapi,
        privacyChoices: true,
        recordsCalls: recordingNumbers > 0,
      }
    : undefined

  return (
    <LegalShell
      client={client}
      title="Privacy Policy"
      basePath={basePath}
      registrationNumber={extras.registrationNumber}
      pages={keptPages}
    >
      <PrivacyContent client={client} measurement={measurement} />
    </LegalShell>
  )
}
