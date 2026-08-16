'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

/**
 * This shop's syndicated-content settings: the switch, and their own
 * BabyLoveGrowth key.
 *
 * The switch autosaves, per the newer cards — a controlled checkbox that
 * waits on a round trip feels broken, so the optimistic state flips first
 * and reconciles after. The key does NOT autosave: it is pasted, not
 * toggled, and saving on every keystroke would store a dozen truncated keys
 * on the way to the real one.
 */
export default function SeoContentCard({
  clientId,
  initialEnabled,
  initialMaskedKey,
}: {
  clientId: string
  initialEnabled: boolean
  initialMaskedKey: string | null
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [maskedKey, setMaskedKey] = useState(initialMaskedKey)
  const [keyInput, setKeyInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<'save' | 'test' | 'sync' | null>(null)

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/clients/${clientId}/seo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { res, data: await res.json().catch(() => ({})) }
  }

  async function toggle(next: boolean) {
    setEnabled(next) // optimistic
    setStatus(null)
    setOk(null)
    const { res, data } = await patch({ seoContentEnabled: next })
    if (!res.ok) {
      setEnabled(!next)
      setStatus(data.error || 'Could not save.')
      setOk(false)
    } else {
      setStatus(next ? 'SEO content is on for this shop.' : 'SEO content is off for this shop.')
      setOk(true)
    }
  }

  async function saveKey() {
    setBusy('save')
    setStatus(null)
    setOk(null)
    const { res, data } = await patch({ blgApiKey: keyInput })
    setBusy(null)
    if (!res.ok) {
      setStatus(data.error || 'Could not save the key.')
      setOk(false)
      return
    }
    setMaskedKey(data.maskedKey || null)
    setKeyInput('')
    setStatus(data.hasKey ? 'Key saved.' : 'Key removed.')
    setOk(true)
  }

  async function run(action: 'test' | 'sync') {
    setBusy(action)
    setStatus(null)
    setOk(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/seo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      setStatus(data.message || (data.success ? 'Done.' : 'Failed.'))
      setOk(!!data.success)
    } catch {
      setStatus('Request failed.')
      setOk(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900">SEO content</h2>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        Articles written by BabyLoveGrowth and published to this shop&apos;s site at{' '}
        <code>/blog</code>. Each shop is its own organisation there, with its own key — that key
        is what tells us an article belongs to this shop.
      </p>

      <label className="mt-4 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300"
        />
        <span className="text-sm">
          <span className="font-semibold text-gray-900">Publish SEO articles for this shop</span>
          <span className="block text-gray-600">
            Off, nothing is pulled and nothing is served — articles already live come down with
            it.
          </span>
        </span>
      </label>

      <div className="mt-5">
        <label
          htmlFor={`blg-${clientId}`}
          className="block text-sm font-semibold text-gray-900"
        >
          BabyLoveGrowth API key
        </label>
        {maskedKey && (
          <p className="mt-0.5 text-xs text-gray-500">
            Saved: <code>{maskedKey}</code>. Enter a new one to replace it, or clear the field and
            save to remove it.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={`blg-${clientId}`}
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={maskedKey ? 'Enter a new key to replace' : 'Paste this shop’s key'}
            className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <Button onClick={saveKey} disabled={busy !== null}>
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save key'}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run('test')} disabled={busy !== null || !maskedKey}>
          {busy === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test connection'}
        </Button>
        <Button
          variant="outline"
          onClick={() => run('sync')}
          disabled={busy !== null || !maskedKey || !enabled}
        >
          {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sync articles now'}
        </Button>
      </div>

      {status && (
        <p
          className={`mt-3 text-sm flex items-start gap-1.5 ${
            ok === false ? 'text-red-700' : ok ? 'text-green-700' : 'text-gray-700'
          }`}
        >
          {ok === true && <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          {ok === false && <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{status}</span>
        </p>
      )}

      <p className="mt-4 text-xs text-gray-500 max-w-prose">
        Every article is scanned before it can go live. Anything promising a turnaround, offering
        to cover a deductible, claiming an insurer relationship, asserting a rating, or stating a
        fact about the shop&apos;s history or credentials is held for review instead — clear those
        by hand below.
      </p>
    </section>
  )
}
