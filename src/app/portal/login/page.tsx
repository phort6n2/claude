'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Loader2, AlertCircle, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Two ways in, and the emailed link is the front door.
 *
 * Portal accounts made by intake approval have no password — their owner
 * signed in by tapping a link in an email, and this page is what they reach
 * when that link has expired. So the default form asks only for the email
 * and sends a fresh link; the password form stays behind a toggle for the
 * accounts that have one.
 */
function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)

  // Check for error in URL params
  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) {
      setError(decodeURIComponent(urlError))
    }
  }, [searchParams])

  // Check if already logged in
  useEffect(() => {
    fetch('/api/portal/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          router.push('/portal/leads')
        }
      })
      .catch(() => {})
  }, [router])

  async function requestLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/portal/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(data.error || 'Could not send the link. Try again in a minute.')
        return
      }
      setLinkSentTo(email)
    } catch {
      setError('Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Login failed')
        return
      }

      // Redirect to leads page
      router.push('/portal/leads')
    } catch {
      setError('Failed to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (linkSentTo) {
    return (
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <MailCheck className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Check your email</h1>
        <p className="text-gray-600 mt-2">
          If <span className="font-medium text-gray-900">{linkSentTo}</span> has a portal account, a
          sign-in link is on its way. It signs you straight in — no password.
        </p>
        <p className="text-sm text-gray-500 mt-4">
          Nothing after a couple of minutes? Check the spam folder, then{' '}
          <button
            type="button"
            onClick={() => setLinkSentTo(null)}
            className="text-blue-600 font-medium hover:underline"
          >
            try again
          </button>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Lead Portal</h1>
        <p className="text-gray-600 mt-2">Sign in to view and manage your leads</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={mode === 'link' ? requestLink : handlePasswordSubmit}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {mode === 'password' && (
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        )}

        <Button
          type="submit"
          disabled={loading || !email || (mode === 'password' && !password)}
          className="w-full py-3"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {mode === 'link' ? 'Sending…' : 'Signing in…'}
            </>
          ) : mode === 'link' ? (
            'Email me a sign-in link'
          ) : (
            'Sign In'
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'link' ? 'password' : 'link'))
          setError(null)
        }}
        className="mt-4 w-full text-center text-sm text-blue-600 font-medium hover:underline"
      >
        {mode === 'link' ? 'Use a password instead' : 'Email me a sign-in link instead'}
      </button>

      <p className="mt-6 text-center text-sm text-gray-500">
        Contact your account manager if you need help accessing your account.
      </p>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">Loading...</h1>
    </div>
  )
}

export default function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Suspense fallback={<LoadingFallback />}>
        <LoginContent />
      </Suspense>
    </div>
  )
}
