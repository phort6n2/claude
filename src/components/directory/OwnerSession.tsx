'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

/**
 * Persists an owner session that arrived via an access link (?key=...) into an
 * httpOnly cookie, then strips the key from the URL. Also renders the sign-out
 * control. Rendering this means the server already validated the key.
 */
export function OwnerSession({ persistKey }: { persistKey?: string }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const persisted = useRef(false)

  useEffect(() => {
    if (!persistKey || persisted.current) return
    persisted.current = true
    fetch('/api/directory/owner/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: persistKey }),
    })
      .catch(() => {})
      .finally(() => {
        // Remove the sensitive key from the address bar / history.
        router.replace('/directory/owner')
      })
  }, [persistKey, router])

  async function signOut() {
    setSigningOut(true)
    await fetch('/api/directory/owner/login', { method: 'DELETE' }).catch(() => {})
    router.replace('/directory/owner')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
    >
      <LogOut width={15} height={15} /> Sign out
    </button>
  )
}
