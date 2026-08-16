'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

/**
 * Where this shop's articles get published, so the Activity tab can notice.
 *
 * One address, read-only, no credential. Whatever tool writes the posts, the
 * feed says a post appeared — which is all the Activity tab needs, and which
 * keeps working when the tool changes.
 *
 * Does NOT autosave, unlike the newer toggles: this is pasted, not flipped,
 * and saving on every keystroke would check a dozen half-typed addresses
 * against fifteen other people's websites.
 */
export default function ContentFeedCard({
  clientId,
  initialUrl,
  lastCheckedAt,
  lastError,
  itemCount,
}: {
  clientId: string
  initialUrl: string | null
  lastCheckedAt: string | null
  lastError: string | null
  itemCount: number
}) {
  const [url, setUrl] = useState(initialUrl || '')
  const [saved, setSaved] = useState(initialUrl)
  const [busy, setBusy] = useState<'save' | 'discover' | 'check' | 'sync' | null>(null)
  const [status, setStatus] = useState<string | null>(lastError)
  const [ok, setOk] = useState<boolean | null>(lastError ? false : null)

  async function save() {
    setBusy('save')
    setStatus(null)
    setOk(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/content-feed`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentFeedUrl: url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(data.error || 'Could not save.')
        setOk(false)
      } else {
        setSaved(data.contentFeedUrl || null)
        setStatus(data.message || 'Saved.')
        setOk(true)
      }
    } catch {
      setStatus('Could not save.')
      setOk(false)
    } finally {
      setBusy(null)
    }
  }

  async function run(action: 'discover' | 'check' | 'sync') {
    setBusy(action)
    setStatus(null)
    setOk(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/content-feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      // A discovered address is offered, not saved: the admin still presses
      // Save, so a wrong guess is never adopted silently.
      if (action === 'discover' && data.contentFeedUrl) setUrl(data.contentFeedUrl)
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
      <h2 className="font-semibold text-gray-900">Content feed</h2>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        The RSS address of wherever this shop&apos;s articles get published. We only read it —
        new posts appear on their Activity tab, so they can see the writing they are paying for.
      </p>

      <div className="mt-4">
        <label htmlFor={`feed-${clientId}`} className="block text-sm font-semibold text-gray-900">
          Feed address
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={`feed-${clientId}`}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://theirsite.com/feed"
            className="flex-1 min-w-[260px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <Button onClick={save} disabled={busy !== null}>
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run('discover')} disabled={busy !== null}>
          {busy === 'discover' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find it for me'}
        </Button>
        <Button
          variant="outline"
          onClick={() => run('check')}
          disabled={busy !== null || !saved}
        >
          {busy === 'check' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check now'}
        </Button>
        <Button variant="outline" onClick={() => run('sync')} disabled={busy !== null || !saved}>
          {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pull posts now'}
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
        {itemCount > 0
          ? `${itemCount} post${itemCount === 1 ? '' : 's'} recorded so far`
          : 'No posts recorded yet'}
        {lastCheckedAt ? `, last read ${new Date(lastCheckedAt).toLocaleString()}` : ''}. Checked
        nightly. Posts already recorded stay on the Activity tab even after they drop off the end
        of the feed.
      </p>
    </section>
  )
}
