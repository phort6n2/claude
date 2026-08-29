'use client'

import { useState } from 'react'
import { AlertCircle, Check, ExternalLink, Loader2 } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * The campaign's all-keywords map, pasted once.
 *
 * The automatic capture is still the preferred route and still runs — the
 * daily sweep and "Refresh map URLs" ask their API for a campaign_link and
 * store it without anyone typing. This exists because for campaigns created
 * through their API that link is not always issued, and the URL is sitting in
 * the address bar of whoever is looking at the map.
 *
 * ANY OF THE THREE FORMS WORKS and only the token is kept:
 *
 *   1e164f…                                  the bare token
 *   https://ranking.…com/1e164f…             our white-label URL
 *   https://app.localdominator.co/…?link=…   their dashboard, taskId and all
 *
 * The third is the one somebody actually has, and it is the one that must not
 * be stored as pasted: their host in a client's portal is precisely what the
 * white-label rule exists to prevent. The token is extracted and rebuilt on
 * our own domain, server-side.
 *
 * It does not go stale. The token addresses the CAMPAIGN, not a run, so their
 * page shows every keyword and the whole history and updates itself as runs
 * complete. Paste it once and it is done.
 */
export default function RankMapUrlCard({
  clientId,
  mapUrl,
}: {
  clientId: string
  mapUrl: string | null
}) {
  const [value, setValue] = useState('')
  const [current, setCurrent] = useState(mapUrl)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(next: string) {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rankMapUrl: next }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      const saved = await res.json().catch(() => null)
      const stored = saved?.rankMapUrl ?? null
      setCurrent(stored)
      setValue('')
      setMessage(
        next && !stored
          ? {
              ok: false,
              text: 'No map token in that. Paste the whole address from the map page, or just the long token out of it.',
            }
          : { ok: true, text: next ? 'Saved — the map is embedded from now on.' : 'Cleared.' }
      )
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 pt-4 space-y-3">
      {current ? (
        <p className="text-sm text-gray-700 flex flex-wrap items-center gap-2">
          <Check className="h-4 w-4 text-green-600" />
          Embedded from{' '}
          <a
            href={current}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-blue-600 hover:underline break-all inline-flex items-center gap-1"
          >
            {current.replace(/^https?:\/\//, '')}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          No map stored yet, so this page falls back to the per-keyword maps. Paste the campaign
          map&apos;s address to embed every keyword and the full history in one.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the map address, or its token"
          spellCheck={false}
          className="flex-1 min-w-[16rem] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => save(value.trim())}
          disabled={saving || !value.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
        {current && (
          <button
            type="button"
            onClick={() => save('')}
            disabled={saving}
            className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-700 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      {message && (
        <p className={`text-sm flex items-start gap-1.5 ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
          {message.ok ? (
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          {message.text}
        </p>
      )}

      <p className="text-xs text-gray-500">
        Whatever you paste, only the token is kept and the address is rebuilt on our own domain —
        a client should never see a vendor&apos;s host in their portal. Clearing it hands control
        back to the automatic capture.
      </p>
    </div>
  )
}
