import { SessionProvider } from 'next-auth/react'
import AdminShell from '@/components/admin/AdminShell'
import DbStatusIndicator from '@/components/admin/DbStatusIndicator'
import { requireAdminPage } from '@/lib/admin-guard'
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPage()

  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
      <DbStatusIndicator />
    </SessionProvider>
  )
}
