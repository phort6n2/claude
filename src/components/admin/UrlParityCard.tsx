'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Loader2, TriangleAlert, CircleCheck } from 'lucide-react'

/**
 * What a domain cutover would break, before it breaks it.
 *
 * The output that matters is the bottom of the list, not the top: addresses
 * on the old site with nowhere sensible to go. Those are decisions a person
 * has to make — add a city page, add a service, or accept sending them to the
 * home page — and they are the ones nobody thinks to check until the traffic
 * has already gone.
 */

interface Mapping {
  from: string
  to: string | null
  kind: 'exact' | 'strong' | 'weak' | 'none'
  reason: string
}

const KIND_LABEL: Record<Mapping['kind'], string> = {
  exact: 'Already exists',
  strong: 'Clear match',
  weak: 'Check this',
  none: 'Nowhere to go',
}

export default function UrlParityCard({
  clientId,
  defaultUrl,
}: {
  clientId: string
  defaultUrl: string | null
}) {
  const [url, setUrl] = useState(defaultUrl || '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [showAll, setShowAll] = useState(false)

  async function run() {
    setBusy(true)
    setMessage(null)
    setOk(null)
    setMappings([])
    try {
      const res = await fetch(`/api/clients/${clientId}/url-parity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      setMappings(Array.isArray(data.mappings) ? data.mappings : [])
      setMessage(data.message || 'Done.')
      setOk(!!data.ok)
    } catch {
      setMessage('Could not reach that site.')
      setOk(false)
    } finally {
      setBusy(false)
    }
  }

  const problems = mappings.filter((m) => m.kind === 'none' || m.kind === 'weak')
  const shown = showAll ? mappings : problems

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900">Check the old site&apos;s addresses</h2>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        Before pointing a domain here, read the old site and work out where each of its pages
        should land. Nothing is changed on either site — this only tells you what would break.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://theiroldsite.com"
          className="flex-1 min-w-[260px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check addresses'}
        </Button>
      </div>

      {message && (
        <p
          className={`mt-3 text-sm flex items-start gap-1.5 ${
            ok === false ? 'text-red-700' : 'text-gray-700'
          }`}
        >
          {ok && <CircleCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />}
          <span>{message}</span>
        </p>
      )}

      {mappings.length > 0 && (
        <>
          {problems.length === 0 && !showAll && (
            <p className="mt-4 text-sm text-green-700 flex items-start gap-1.5">
              <CircleCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Every address on the old site has a clear home. Nothing needs a decision.</span>
            </p>
          )}

          {shown.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[34rem]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-3 font-semibold">Old address</th>
                    <th className="py-2 pr-3 font-semibold">Should go to</th>
                    <th className="py-2 font-semibold">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.from} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="py-2 pr-3 font-mono text-xs text-gray-900 break-all">{m.from}</td>
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs text-gray-900 break-all">
                          {m.to || '—'}
                        </span>
                        <span
                          className={`ml-2 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            m.kind === 'none'
                              ? 'bg-red-50 text-red-700'
                              : m.kind === 'weak'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {KIND_LABEL[m.kind]}
                        </span>
                      </td>
                      <td className="py-2 text-gray-600">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="mt-3 text-sm font-semibold text-blue-700 hover:underline"
          >
            {showAll
              ? `Show only the ${problems.length} needing a decision`
              : `Show all ${mappings.length} addresses`}
          </button>
        </>
      )}

      <p className="mt-4 text-xs text-gray-500 max-w-prose flex items-start gap-1.5">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          This reports; it does not redirect. Once you have decided where each address goes, the
          redirects still have to be set up wherever the domain is served from.
        </span>
      </p>
    </section>
  )
}
