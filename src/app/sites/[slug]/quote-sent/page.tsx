import { isPreview, siteIsLive } from '@/lib/site-preview'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { siteClientWhere } from '@/lib/site-client'
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
  if (!client) notFound()
  const preview = await isPreview(client.status)
  if (!siteIsLive(client.status) && !preview) return <SiteUnavailable />

  // Object.assign, not `client.phone = …`: the swap now also carries the
  // shop's own line for the callback and SMS copy, and taking only `.phone`
  // would drop it. See site-phone.ts.
  const swapped = await withSitePhone(client)
  Object.assign(client, swapped)
  const callbackPhone = swapped.callbackPhone
  // Only worth two roles when they are actually two numbers. Twelve of the
  // fifteen shops have no tracking number, and for them the split would be
  // the same number twice with different labels.
  const splitNumbers =
    !!callbackPhone &&
    callbackPhone.replace(/\D/g, '') !== (client.phone || '').replace(/\D/g, '')
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
            Call us on <a href={telHrefFor(client.phone)}>{client.phone}</a> and we will take the
            details straight away — that is faster than trying the form again.
          </p>
        </>
      ) : (
        <>
          {/* WE, not THEY, and the CALLBACK line rather than the displayed
              one — the same two faults the widget's own confirmation had.
              This page is the shop's site speaking as the shop, and the call
              back arrives from their handset, not from the tracking number.
              The call-now link below stays on the display number: inbound,
              and it wants recording. See lib/site-phone. */}
          {/* TWO NUMBERS NEED TWO ROLES — see the same split in widget.js.
              The sentence is the call WE make, from the shop's own handset;
              the link is the call THEY make, on the recorded line. Labelled
              by action rather than by naming a department, because this text
              renders for fifteen shops and most are one or two people in a
              van: "our dedicated quote team" would be §2's invented fact. */}
          <p>
            Your request is in.{' '}
            {callbackPhone ? (
              splitNumbers ? (
                <>
                  We will call you from {callbackPhone} to confirm the glass, your coverage and a
                  time — save it so you know it is us.
                </>
              ) : (
                <>
                  We will call from {callbackPhone} to confirm the glass, your coverage and a time —
                  save the number so you do not miss it.
                </>
              )
            ) : (
              <>We will call to confirm the glass, your coverage and a time that works.</>
            )}
          </p>
          <p>
            {splitNumbers ? 'Rather not wait? Call us on ' : 'If you would rather not wait, call us now on '}
            <a href={telHrefFor(client.phone)}>{client.phone}</a>.
          </p>
        </>
      )}
    </LegalShell>
  )
}
