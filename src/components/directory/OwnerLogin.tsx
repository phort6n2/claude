'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, LogIn } from 'lucide-react'

export function OwnerLogin({ initialKey = '' }: { initialKey?: string }) {
  const router = useRouter()
  const [key, setKey] = useState(initialKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Sign-in failed')
      router.replace('/directory/owner')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <KeyRound width={22} height={22} className="text-blue-600" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Owner sign-in</h1>
        <p className="mt-1 text-gray-600">
          Enter the access key we sent you to view your leads and manage your listing.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your access key"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            autoComplete="off"
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="animate-spin" width={18} height={18} /> : <LogIn width={18} height={18} />}
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          Don&apos;t have a key?{' '}
          <a href="mailto:hello@windshieldrepairhq.com" className="font-medium text-blue-600 hover:text-blue-700">
            Claim your listing
          </a>
        </p>
      </div>
    </div>
  )
}
