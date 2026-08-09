'use client'

import { useEffect, useState } from 'react'
import { Eye, LogOut } from 'lucide-react'

/**
 * Unmistakable marker that the current portal view belongs to a client, not
 * to the admin looking at it. Fixed to the top, amber, with a live countdown
 * and the only exit control — so it is always one click away and can never be
 * confused with the admin's own account.
 */
export default function ImpersonationBanner({
  email,
  businessName,
  expiresAt,
}: {
  email: string
  businessName: string
  expiresAt?: number
}) {
  const [remaining, setRemaining] = useState<string>('')
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!expiresAt) return
    const tick = () => {
      const ms = expiresAt - Date.now()
      if (ms <= 0) {
        setRemaining('expired')
        return
      }
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      setRemaining(`${mins}m ${String(secs).padStart(2, '0')}s`)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  async function exit() {
    setLeaving(true)
    try {
      await fetch('/api/portal/auth/stop-impersonating', { method: 'POST' })
    } finally {
      window.location.href = '/admin/clients'
    }
  }

  return (
    <>
      {/* Accent frame so the whole viewport reads as "not your account" */}
      <div className="pointer-events-none fixed inset-0 z-[70] border-4 border-amber-400" aria-hidden="true" />
      <div className="fixed top-0 inset-x-0 z-[80] bg-amber-400 text-amber-950">
        <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-bold">Viewing as {businessName}</span>
          <span className="opacity-80 truncate">({email}) · read-only</span>
          {remaining && <span className="opacity-80">· expires in {remaining}</span>}
          <button
            type="button"
            onClick={exit}
            disabled={leaving}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-950 text-amber-50 font-semibold hover:bg-amber-900 disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" />
            {leaving ? 'Exiting…' : 'Exit'}
          </button>
        </div>
      </div>
      {/* Push page content below the fixed banner */}
      <div className="h-9" aria-hidden="true" />
    </>
  )
}
