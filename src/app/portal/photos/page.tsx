export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getPortalSession } from '@/lib/portal-auth'
import PhotoManager from '@/components/admin/PhotoManager'

/**
 * "My Photos" in the client portal.
 *
 * Photos are the part of the site the client genuinely owns — their van,
 * their bay, their work — so this is the one place they add and remove
 * freely. Alt text is written by us, not here: it is an SEO and
 * accessibility field, and asking a shop owner for it produces "photo1".
 */
export default async function PortalPhotosPage() {
  const session = await getPortalSession()
  if (!session) redirect('/portal/login')

  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { logoUrl: true },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
        <p className="text-gray-600">
          Add photos of your shop, your van and your work. They appear on your website within a
          few minutes.
        </p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <PhotoManager
          listUrl="/api/portal/photos"
          uploadUrl="/api/portal/photos"
          deleteUrl="/api/portal/photos"
          hasLogo={!!client?.logoUrl}
          emptyHint="Photos of your own vehicles, your bay and your team are what make the page look like a real business. Every photo gets your logo added automatically."
        />
      </div>
    </div>
  )
}
