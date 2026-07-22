'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'

export function AdminSignOut() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    try {
      await fetch('/api/directory/admin/login', { method: 'DELETE' })
    } catch {
      /* best effort */
    }
    router.replace('/directory/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
    >
      {busy ? <Loader2 className="animate-spin" width={14} height={14} /> : <LogOut width={14} height={14} />}
      Sign out
    </button>
  )
}
