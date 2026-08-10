export const dynamic = 'force-dynamic'

import Header from '@/components/admin/Header'
import StorageSweep from '@/components/admin/StorageSweep'
import { requireAdminPage } from '@/lib/admin-guard'

/**
 * Storage housekeeping.
 *
 * Client deletion now frees its own files, but that only helps from here on.
 * Anything already orphaned — by a failed delete, or by a client removed
 * before the teardown existed — is invisible and billed monthly. This is the
 * one place that looks.
 */
export default async function StoragePage() {
  await requireAdminPage()

  return (
    <div className="flex flex-col h-full">
      <Header title="Storage" subtitle="What is stored, and what is being paid for but unused" />
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <StorageSweep />
      </div>
    </div>
  )
}
