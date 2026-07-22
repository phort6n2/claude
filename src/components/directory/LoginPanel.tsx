'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, LogIn, Shield } from 'lucide-react'

type Tab = 'owner' | 'admin'

export function LoginPanel({ initialKey = '' }: { initialKey?: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('owner')

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <LogIn width={22} height={22} className="text-blue-600" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-gray-600">
          Shop owners see their leads and listing. Site admins get the management console.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setTab('owner')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === 'owner' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <KeyRound width={15} height={15} /> Shop owner
          </button>
          <button
            type="button"
            onClick={() => setTab('admin')}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Shield width={15} height={15} /> Site admin
          </button>
        </div>

        {tab === 'owner' ? (
          <OwnerForm router={router} initialKey={initialKey} />
        ) : (
          <AdminForm router={router} />
        )}
      </div>
    </div>
  )
}

function OwnerForm({
  router,
  initialKey,
}: {
  router: ReturnType<typeof useRouter>
  initialKey: string
}) {
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
    <>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your access key"
          className={INPUT}
          autoComplete="off"
        />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !key.trim()} className={BUTTON}>
          {busy ? <Loader2 className="animate-spin" width={18} height={18} /> : <LogIn width={18} height={18} />}
          Sign in
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        Don&apos;t have a key?{' '}
        <a
          href="/directory/claim"
          className="font-medium text-blue-600 hover:text-blue-700"
        >
          Claim your listing
        </a>
      </p>
    </>
  )
}

function AdminForm({ router }: { router: ReturnType<typeof useRouter> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/directory/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Sign-in failed')
      router.replace('/directory/manage')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className={INPUT}
        autoComplete="username"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
        className={INPUT}
        autoComplete="current-password"
      />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !email.trim() || !password} className={BUTTON}>
        {busy ? <Loader2 className="animate-spin" width={18} height={18} /> : <Shield width={18} height={18} />}
        Sign in to console
      </button>
    </form>
  )
}

const INPUT =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
const BUTTON =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60'
