import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getClientReadiness } from '@/lib/client-readiness'
import { siteLinkFor, PRIMARY_DOMAIN_SELECT } from '@/lib/site-origin'
import ClientTabs from '@/components/admin/ClientTabs'
import { UnsavedWorkProvider } from '@/components/admin/UnsavedWorkGuard'
import ClientReadinessBadge from '@/components/admin/ClientReadinessBadge'
import ViewAsClientButton from '@/components/admin/ViewAsClientButton'
import { requireAdminPage } from '@/lib/admin-guard'

/**
 * Shell for everything under a single client: identity header, live-site
 * link, and the task tabs. Each child route owns its own data and its own
 * save.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  await requireAdminPage()

  const { id } = await params
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      city: true,
      state: true,
      status: true,
      slug: true,
      siteSubdomain: true,
      // Without this the header's "View site" link cannot see a custom
      // domain, and goes on pointing at the subdomain after a cutover.
      domains: PRIMARY_DOMAIN_SELECT,
      logoUrl: true,
    },
  })
  if (!client) notFound()

  // Computed here rather than per tab so the answer is the same wherever you
  // are, and so a tab you never open can still tell you something is missing.
  const readiness = await getClientReadiness(client.id)

  const siteUrl = siteLinkFor(client)

  const statusStyles: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    PAUSED: 'bg-amber-100 text-amber-700',
    CANCELLED: 'bg-gray-200 text-gray-600',
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto p-6">
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          All clients
        </Link>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt=""
              className="h-11 w-11 rounded-xl object-contain bg-white border border-gray-200 p-1"
            />
          ) : (
            <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              {client.businessName[0]}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{client.businessName}</h1>
            <p className="text-sm text-gray-500">
              {client.city}, {client.state}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              statusStyles[client.status] || statusStyles.CANCELLED
            }`}
          >
            {client.status}
          </span>
          <ClientReadinessBadge
            checks={readiness.checks}
            requiredOpen={readiness.requiredOpen}
            recommendedOpen={readiness.recommendedOpen}
            opportunityOpen={readiness.opportunityOpen}
          />
          <div className="ml-auto flex items-center gap-2">
            <ViewAsClientButton clientId={client.id} />
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              View site
            </a>
          </div>
        </div>

        {/* The provider must wrap BOTH: the tab bar asks, the tab's form
            answers. */}
        <UnsavedWorkProvider>
          <ClientTabs clientId={client.id} />
          <div className="pt-6">{children}</div>
        </UnsavedWorkProvider>
      </div>
    </div>
  )
}
