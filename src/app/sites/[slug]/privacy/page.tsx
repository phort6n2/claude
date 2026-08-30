import { canViewSite, isPreview, siteIsLive } from '@/lib/site-preview'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { sitePathPrefixFor } from '@/lib/site-origin'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { LegalShell, PrivacyContent } from '@/components/sites/legal'
import { getSiteExtras } from '@/lib/site-content'
import { keptPagesFor } from '@/lib/site-pages'

export const revalidate = 3600

interface PageProps {
  params: Promise<{ slug: string }>
}

async function getClient(slug: string) {
  return prisma.client.findFirst({
    where: { OR: [{ slug }, { siteSubdomain: slug }] },
    select: {
      id: true,
      slug: true,
      siteSubdomain: true,
      status: true,
      businessName: true,
      phone: true,
      siteDisplayPhone: true,
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      logoUrl: true,
      footerLogoUrl: true,
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
  client.phone = (await withSitePhone(client)).phone
  const basePath = sitePathPrefixFor(client, (await headers()).get('host'))
  const [extras, keptPages] = await Promise.all([
    getSiteExtras(client.id),
    keptPagesFor(client.id, client.businessName),
  ])

  return (
    <LegalShell
      client={client}
      title="Privacy Policy"
      basePath={basePath}
      registrationNumber={extras.registrationNumber}
      pages={keptPages}
    >
      <PrivacyContent client={client} />
    </LegalShell>
  )
}
