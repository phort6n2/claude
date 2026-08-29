export const dynamic = 'force-dynamic'

import { requireAdminPage } from '@/lib/admin-guard'
import MaintenanceTools from '@/components/admin/MaintenanceTools'

/**
 * The operational endpoints, reachable.
 *
 * They were always there and always run by hand — which meant pasting a URL,
 * which only ever worked for the few that answer GET. The ones that fix
 * things are POSTs, so the tools that mattered most were the ones a browser
 * could not run at all.
 */
export default async function Page() {
  await requireAdminPage()

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
      <p className="text-sm text-gray-500 mt-1">
        Diagnostics and repairs that run against live accounts — ours, Google&apos;s and Local
        Dominator&apos;s
      </p>
      <div className="mt-5">
        <MaintenanceTools />
      </div>
    </div>
  )
}
