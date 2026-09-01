'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/** Run the daily sweep now instead of waiting for tomorrow's cron. */
export default function RunAdsChecksButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setNote(null)
    try {
      const res = await fetch('/api/admin/ads-findings/run', { method: 'POST' })
      if (!res.ok) throw new Error(await errorFrom(res, 'The run failed'))
      const data = await res.json()
      setNote(
        `${data.accounts} account${data.accounts === 1 ? '' : 's'} checked — ${data.newFindings?.length ?? 0} new, ${data.resolved ?? 0} cleared${data.errors?.length ? `, ${data.errors.length} unreadable` : ''}.`
      )
      router.refresh()
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'The run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
      >
        {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Run the checks now
      </button>
      {note && <p className="mt-1 text-xs text-gray-500">{note}</p>}
    </div>
  )
}
