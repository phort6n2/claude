'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Globe, Loader2, Plus, RefreshCw, Star, Trash2, TriangleAlert } from 'lucide-react'

/**
 * The client's own domains pointed at their hosted site.
 *
 * The site never stops answering on {label}.glassleads.app, so a DNS mistake
 * here can slow a launch but cannot take a live site off the internet.
 *
 * Status is three separate facts — attached, verified, DNS pointing here —
 * and they resolve at different times, so the card reports the one that is
 * actually blocking rather than a single green/red that hides which step is
 * outstanding.
 */

interface DnsRecord {
  type: string
  name: string
  value: string
}

interface DomainRow {
  id: string
  domain: string
  isPrimary: boolean
  verified: boolean
  misconfigured: boolean
  lastCheckedAt: string | null
  lastError: string | null
}

interface LiveStatus {
  verified: boolean
  misconfigured: boolean
  live: boolean
  records: DnsRecord[]
  error: string | null
}

export default function CustomDomainsCard({
  clientId,
  subdomain,
}: {
  clientId: string
  /** The glassleads.app host, shown as the thing that always keeps working. */
  subdomain: string
}) {
  const [rows, setRows] = useState<DomainRow[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, LiveStatus>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`/api/clients/${clientId}/domains`)).json()
      setRows(data.domains || [])
      if (data.unavailable) setUnavailable(true)
    } catch {
      setRows([])
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    setBusy('add')
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: input }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not add that domain')
      setInput('')
      if (data.status) setStatuses((prev) => ({ ...prev, [data.status.domain]: data.status }))
      await load()
      setMessage({ ok: true, text: 'Added. Now add the DNS records below at the registrar.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  async function recheck(domain: string) {
    setBusy(domain)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/domains`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Check failed')
      setStatuses((prev) => ({ ...prev, [domain]: data.status }))
      await load()
      if (!data.status.live) {
        setMessage({
          ok: false,
          text: 'Not live yet. DNS changes can take a few minutes to a few hours to propagate.',
        })
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  async function makePrimary(domain: string) {
    setBusy(domain)
    await fetch(`/api/clients/${clientId}/domains`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, action: 'primary' }),
    })
    await load()
    setBusy(null)
  }

  async function remove(domain: string) {
    if (!confirm(`Remove ${domain}? The site keeps working on ${subdomain}.`)) return
    setBusy(domain)
    setMessage(null)
    try {
      const res = await fetch(
        `/api/clients/${clientId}/domains?domain=${encodeURIComponent(domain)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not remove')
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  if (rows === null) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading domains…
      </div>
    )
  }

  return (
    <div className="p-6 pt-4 space-y-4">
      {unavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            The domains table doesn&apos;t exist in this database yet. Run{' '}
            <code className="font-mono">/api/admin/setup-db</code> first.
          </span>
        </div>
      )}

      <p className="text-sm text-gray-600">
        The site always keeps answering on{' '}
        <code className="font-mono text-xs">{subdomain}</code>, so adding a domain here can never
        take it offline. The primary domain is the one used for canonical URLs, share cards and the
        sitemap.
      </p>

      {rows.map((row) => {
        const live = statuses[row.domain]
        const verified = live?.verified ?? row.verified
        const misconfigured = live?.misconfigured ?? row.misconfigured
        const isLive = verified && !misconfigured
        const records = live?.records || []
        return (
          <div key={row.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Globe size={16} className="text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900 truncate">{row.domain}</span>
                {row.isPrimary && (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                    Primary
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!row.isPrimary && (
                  <button
                    type="button"
                    onClick={() => makePrimary(row.domain)}
                    disabled={busy === row.domain}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    <Star size={13} /> Make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => recheck(row.domain)}
                  disabled={busy === row.domain}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                >
                  {busy === row.domain ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Check
                </button>
                <button
                  type="button"
                  onClick={() => remove(row.domain)}
                  disabled={busy === row.domain}
                  className="p-2 rounded-md border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  aria-label={`Remove ${row.domain}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div
              className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
                isLive
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {isLive ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : (
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              )}
              <span>
                {isLive
                  ? 'Live. This domain serves the site over HTTPS.'
                  : !verified
                    ? 'Waiting on ownership verification — add the TXT record below, then press Check.'
                    : 'DNS is not pointing here yet. Add the record below at the registrar, then press Check.'}
                {row.lastError && <span className="block mt-1 opacity-80">{row.lastError}</span>}
              </span>
            </div>

            {records.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Type</th>
                      <th className="text-left font-medium px-3 py-2">Name / Host</th>
                      <th className="text-left font-medium px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {records.map((record, i) => (
                      <tr key={`${record.type}-${i}`} className="border-t border-gray-200">
                        <td className="px-3 py-2">{record.type}</td>
                        <td className="px-3 py-2">{record.name}</td>
                        <td className="px-3 py-2 break-all">{record.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 mt-1">
                  These values come from Vercel for this specific domain — use them rather than any
                  written down elsewhere.
                </p>
              </div>
            )}

            {!isLive && records.length === 0 && (
              <p className="text-xs text-gray-500">
                Press <strong>Check</strong> to fetch the exact DNS records this domain needs.
              </p>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="collisionautoglass.com"
          className="flex-1 min-w-[220px] px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy === 'add' || !input.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          {busy === 'add' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Add domain
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Add the apex (<code className="font-mono">example.com</code>) and{' '}
        <code className="font-mono">www.example.com</code> separately if you want both to work —
        Vercel treats them as two domains and will redirect one to the other once both are added.
      </p>

      {message && (
        <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  )
}
