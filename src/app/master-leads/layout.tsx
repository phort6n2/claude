import { requireAdminPage } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

/**
 * Server-side gate for /master-leads.
 *
 * The pages here are client components that check their own access after
 * mounting and then redirect. That works, but it means an unauthenticated
 * request is answered 200 with a shell before anything is checked — the same
 * shape of gap that left /admin/clients open, just without a payload in it
 * yet. A page that renders before it authorises is one database call away
 * from leaking.
 *
 * This only establishes "a signed-in admin". The narrower rule — that
 * master-leads belongs to one specific address — stays where it already is,
 * on the routes that serve the data, since that is the check that actually
 * protects it.
 */
export default async function MasterLeadsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <>{children}</>
}
