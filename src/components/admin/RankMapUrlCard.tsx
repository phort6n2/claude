'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Loader2 } from 'lucide-react'

/**
 * The one URL this whole feature turns on, editable by hand.
 *
 * It is normally captured from Local Dominator's API — the `link` token out
 * of the campaign's `share_links.campaign_link`, served from our white-label
 * host. But the URL is also sitting in plain sight in their dashboard, and
 * waiting on an integration to discover something already known is not a
 * reason for a client's report to show the wrong map.
 *
 * Clearing the field hands control back to the automatic capture rather than
 * pinning a stale URL forever.
 */
export default function RankMapUrlCard({
  clientId,
  initialUrl,
}: {
  clientId: string
  initialUrl: string | null
}) {
  const [url, setUrl] = useState(initialUrl || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rankMapUrl: url.trim() }),
      })
      if (!res.ok) setError('Could not save.')
      else setSaved(true)
    } catch {
      setError('Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900">Map URL</h2>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        The all-keywords map embedded above. Paste the campaign&apos;s share link from Local
        Dominator — the one for the whole campaign, not a single keyword. The bare token works too.
        Clear the field to go back to whatever the API can find on its own.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setSaved(false)
          }}
          placeholder="https://ranking.example.com/… or just the token"
          className="flex-1 min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
      {saved && (
        <p className="mt-2 text-sm text-green-700 flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4" /> Saved. Reload to see the map.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
