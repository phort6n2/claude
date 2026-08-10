export const dynamic = 'force-dynamic'

import Header from '@/components/admin/Header'
import ConversionHealthTable from '@/components/admin/ConversionHealthTable'

/**
 * "Where is money leaking?" — conversion setup for every client at once.
 *
 * Exists because the per-client Advertising tab answers the question one
 * client at a time, and the failure this is looking for is the silent kind:
 * a tag that was never pasted, or one that stopped reporting. Nobody notices
 * that by clicking through fifteen tabs, so nobody does.
 */
export default function ConversionHealthPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="Conversion health"
        subtitle="Which clients are reporting conversions, and which are spending blind"
      />
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <ConversionHealthTable />
      </div>
    </div>
  )
}
