import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { LegalShell, TermsContent } from '@/components/sites/legal'
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
      email: true,
      streetAddress: true,
      city: true,
      state: true,
      postalCode: true,
      logoUrl: true,
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
  if (!client || client.status !== 'ACTIVE') return { title: 'Not Found' }
  return {
    title: `Terms & Conditions | ${client.businessName}`,
    robots: { index: false },
    alternates: {
      canonical: `https://${client.siteSubdomain || client.slug}.glassleads.app/terms`,
    },
  }
}

export default async function TermsPage({ params }: PageProps) {
  const { slug } = await params
  const client = await getClient(slug)
  if (!client) notFound()
  if (client.status !== 'ACTIVE') return <SiteUnavailable />
  // Visitors see the tracking number when one is set; see lib/site-phone.ts.
  client.phone = (await withSitePhone(client)).phone
  const [extras, keptPages] = await Promise.all([
    getSiteExtras(client.id),
    keptPagesFor(client.id, client.businessName),
  ])

  return (
    <LegalShell
      client={client}
      title="Terms & Conditions"
      basePath={`/sites/${client.slug}`}
      registrationNumber={extras.registrationNumber}
      pages={keptPages}
    >
      <TermsContent
        client={client}
        warrantyTitle={extras.warrantyTitle}
        warrantyText={extras.warrantyText}
        registrationNumber={extras.registrationNumber}
      />
    </LegalShell>
  )
}
