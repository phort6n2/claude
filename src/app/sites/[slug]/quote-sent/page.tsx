import { isPreview } from '@/lib/site-preview'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { sitePathPrefixFor } from '@/lib/site-origin'
import { withSitePhone } from '@/lib/site-phone'
import { SiteUnavailable } from '@/components/sites/shared'
import { LegalShell } from '@/components/sites/legal'
import { telHrefFor } from '@/components/sites/shared'

export const dynamic = 'force-dynamic'

/**
 * Where a no-JavaScript quote submission lands.
 *
 * The scripted form confirms in place and never comes here. This page exists
 * because a plain <form method="post"> has to go somewhere, and the browser
 * arrives by a 303 so a refresh cannot post the lead a second time.
 *
 * noindex: it is a dead end for a crawler and would compete with the pages
 * that are meant to rank.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } }

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ problem?: string }>
}

export default async function QuoteSentPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { problem } = await searchParams

  const client = await prisma.client.findFirst({
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
  if (!client) notFound()
  const preview = await isPreview(client.status)
  if (client.status !== 'ACTIVE' && !preview) return <SiteUnavailable />

  client.phone = (await withSitePhone(client)).phone
  const basePath = sitePathPrefixFor(client, (await headers()).get('host'))

  return (
    <LegalShell client={client} title={problem ? 'That did not go through' : 'Request sent'} basePath={basePath}>
      {problem ? (
        <>
          <p>
            Something went wrong sending your request, and we would rather tell you than let you
            assume it arrived. Nothing was saved.
          </p>
          <p>
            Call {client.businessName} on{' '}
            <a href={telHrefFor(client.phone)}>{client.phone}</a> and they will take the details
            straight away — that is faster than trying the form again.
          </p>
        </>
      ) : (
        <>
          <p>
            Your request is with {client.businessName}. They will call
            {client.phone ? <> from {client.phone}</> : null} to confirm the glass, your coverage
            and a time that works.
          </p>
          <p>
            If you would rather not wait, call them now on{' '}
            <a href={telHrefFor(client.phone)}>{client.phone}</a>.
          </p>
        </>
      )}
    </LegalShell>
  )
}
