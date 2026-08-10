'use client'

import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'

/**
 * "Show me what they see."
 *
 * Lives in the client header rather than on the Users tab, because it answers
 * a question you have while looking at any tab — and because it no longer has
 * anything to do with users: a client with no login can be previewed just the
 * same.
 *
 * The session it mints is read-only and expires in 30 minutes. Opening in a
 * new tab keeps the admin session in this one, so you are not signed out of
 * your own app to look at someone else's.
 */
export default function ViewAsClientButton({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function view() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/impersonate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open the portal')
      window.open('/portal', '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setTimeout(() => setError(''), 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={view}
        disabled={busy}
        title="Open their portal in a new tab, read-only, for 30 minutes"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        View as client
      </button>
    </div>
  )
}
