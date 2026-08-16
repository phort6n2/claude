'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

/**
 * Microsoft Clarity for this shop — a panel inside the site-tracking card,
 * beside Google Ads and Microsoft Advertising.
 *
 * It sits with them because from this screen all three are the same job:
 * paste the id the platform gave you, for this one shop. What they DO differs
 * — the other two report conversions, this one records behaviour — and the
 * copy says so rather than letting the shared tab bar imply otherwise.
 *
 * Two fields that look alike and are not: the project id is public and ships
 * in their page source, the export token is a credential. They are entered
 * and stored differently, and the panel says which is which — a screen that
 * treats them the same is how a token ends up pasted into the id field.
 */
export default function ClarityPanel({
  clientId,
  initialProjectId,
  initialMaskedToken,
  onConfiguredChange,
}: {
  clientId: string
  initialProjectId: string | null
  initialMaskedToken: string | null
  /** Lets the tab bar's status dot follow a save without a reload. */
  onConfiguredChange?: (configured: boolean) => void
}) {
  const [projectId, setProjectId] = useState(initialProjectId || '')
  const [savedProjectId, setSavedProjectId] = useState(initialProjectId)
  const [maskedToken, setMaskedToken] = useState(initialMaskedToken)
  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState<'id' | 'token' | 'read' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const [rows, setRows] = useState<Array<{ name: string; total: number }>>([])

  async function patch(kind: 'id' | 'token') {
    setBusy(kind)
    setStatus(null)
    setOk(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/clarity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'id' ? { clarityProjectId: projectId } : { clarityApiToken: tokenInput }
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(data.error || 'Could not save.')
        setOk(false)
        return
      }
      if (kind === 'id') {
        setSavedProjectId(data.clarityProjectId || null)
        onConfiguredChange?.(!!data.clarityProjectId)
      }
      else {
        setMaskedToken(data.maskedToken || null)
        setTokenInput('')
      }
      setStatus(data.message || 'Saved.')
      setOk(true)
    } catch {
      setStatus('Could not save.')
      setOk(false)
    } finally {
      setBusy(null)
    }
  }

  async function read() {
    setBusy('read')
    setStatus(null)
    setOk(null)
    setRows([])
    try {
      const res = await fetch(`/api/clients/${clientId}/clarity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 3 }),
      })
      const data = await res.json().catch(() => ({}))
      setRows(Array.isArray(data.summary) ? data.summary : [])
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
    <div className="p-5 sm:p-6">
      <p className="text-sm text-gray-600 max-w-prose">
        Not conversion tracking — this records how visitors move through the pages, so you can see
        what confuses them. One project per shop, so their numbers are not averaged in with
        fourteen others. Their quote form is excluded from recording, and the shop&apos;s privacy
        page says a session-analytics tool is in use as soon as an id is saved here.
      </p>

      <div className="mt-4">
        <label htmlFor={`cid-${clientId}`} className="block text-sm font-semibold text-gray-900">
          Project id
        </label>
        <p className="mt-0.5 text-xs text-gray-500">
          Clarity → Settings → Overview. <strong>Paste the whole tracking snippet</strong> if that
          is what you have — the id is pulled out of it. Not a secret: it ships in their page
          source either way.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={`cid-${clientId}`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Paste the snippet, or just the id"
            className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <Button onClick={() => patch('id')} disabled={busy !== null}>
            {busy === 'id' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save id'}
          </Button>
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor={`ctok-${clientId}`} className="block text-sm font-semibold text-gray-900">
          Data export token
        </label>
        <p className="mt-0.5 text-xs text-gray-500">
          Clarity → Settings → Data export. Optional — only needed to read the numbers back in
          here. Stored encrypted.
          {maskedToken ? (
            <>
              {' '}
              Saved: <code>{maskedToken}</code>.
            </>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={`ctok-${clientId}`}
            type="password"
            autoComplete="off"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={maskedToken ? 'Enter a new token to replace' : 'Paste the export token'}
            className="flex-1 min-w-[220px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <Button onClick={() => patch('token')} disabled={busy !== null}>
            {busy === 'token' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save token'}
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <Button variant="outline" onClick={read} disabled={busy !== null || !maskedToken}>
          {busy === 'read' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Read the last 3 days'}
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

      {rows.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {rows.map((row) => (
            <div key={row.name} className="rounded-xl border border-gray-200 p-3">
              <dt className="text-xs text-gray-500">{row.name}</dt>
              <dd className="text-lg font-bold text-gray-900">{row.total.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-xs text-gray-500 max-w-prose">
        The API returns aggregates only — replays and heatmaps are dashboard-only, and it is rate
        limited to a few reads per project per day over the last three days. Whether a page change
        actually worked is answered in Google Ads, on search campaigns, not here.
      </p>
    </div>
  )
}
