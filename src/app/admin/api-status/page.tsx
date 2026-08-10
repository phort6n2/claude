'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MinusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import Header from '@/components/admin/Header'
import type { IntegrationCheck } from '@/lib/integration-checks'

/**
 * "Is anything broken right now?"
 *
 * Ordered by blast radius rather than alphabetically, and every row says what
 * stops working while that service is down. A vendor name and a red dot is
 * not information — knowing that leads are still being captured but nobody is
 * being emailed about them is.
 *
 * Every check runs live on load. The old page showed "configured" from the
 * database without calling anything, which reported a revoked key as healthy.
 */

const SEVERITY: Record<string, { label: string; blurb: string }> = {
  critical: { label: 'Critical', blurb: 'Leads are lost or sites are down while these are broken' },
  degraded: { label: 'Feature', blurb: 'Leads still arrive and sites still serve; a feature is off' },
  optional: { label: 'Setup only', blurb: 'Used when provisioning or checking, not on the lead path' },
}

export default function ApiStatusPage() {
  const [checks, setChecks] = useState<IntegrationCheck[] | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [environment, setEnvironment] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (await fetch('/api/integrations/status')).json()
      setChecks(data.checks || [])
      setCheckedAt(data.checkedAt || null)
      setEnvironment(data.environment || null)
    } catch {
      setChecks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const down = (checks || []).filter((c) => c.configured && !c.ok)
  const criticalDown = down.filter((c) => c.severity === 'critical')
  const unconfigured = (checks || []).filter((c) => !c.configured)

  return (
    <div className="flex flex-col h-full">
      <Header title="Integration status" subtitle="Every outside service, and what breaks without it" />
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-check everything
          </button>
          {checkedAt && !loading && (
            <span className="text-sm text-gray-500">
              Checked {new Date(checkedAt).toLocaleTimeString()}
            </span>
          )}
          {environment && !loading && (
            <span
              className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded border ${
                environment === 'production'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              {environment}
            </span>
          )}
        </div>

        {loading && !checks && (
          <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Calling every service…
          </div>
        )}

        {checks && !loading && (
          <div
            className={`mb-5 rounded-xl border p-4 text-sm ${
              criticalDown.length
                ? 'border-red-300 bg-red-50 text-red-900'
                : down.length
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-green-300 bg-green-50 text-green-900'
            }`}
          >
            {criticalDown.length ? (
              <>
                <strong>{criticalDown.length} critical integration down.</strong>{' '}
                {criticalDown.map((c) => c.impact).join(' ')}
              </>
            ) : down.length ? (
              <>
                <strong>Everything on the lead path is working.</strong> {down.length} other
                integration{down.length === 1 ? '' : 's'} need attention.
              </>
            ) : (
              <>
                <strong>Everything configured is responding.</strong>
                {/* Said out loud, because a green banner above a column of
                    "Not configured" rows otherwise reads as "all good". */}
                {unconfigured.length > 0 && (
                  <>
                    {' '}
                    {unconfigured.length} service{unconfigured.length === 1 ? ' is' : 's are'} not
                    set up at all: {unconfigured.map((c) => c.name).join(', ')}.
                  </>
                )}
              </>
            )}
          </div>
        )}

        {(['critical', 'degraded', 'optional'] as const).map((severity) => {
          const group = (checks || []).filter((c) => c.severity === severity)
          if (group.length === 0) return null
          return (
            <section key={severity} className="mb-5">
              <h2 className="text-sm font-bold text-gray-900">{SEVERITY[severity].label}</h2>
              <p className="text-xs text-gray-500 mb-2">{SEVERITY[severity].blurb}</p>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                {group.map((check) => (
                  <div key={check.id} className="p-4 flex items-start gap-3">
                    {!check.configured ? (
                      <MinusCircle className="h-5 w-5 mt-0.5 shrink-0 text-gray-300" />
                    ) : check.ok ? (
                      <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
                    ) : severity === 'critical' ? (
                      <XCircle className="h-5 w-5 mt-0.5 shrink-0 text-red-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-gray-900">{check.name}</span>
                        <span className="text-xs text-gray-500">{check.purpose}</span>
                      </div>
                      <p
                        className={`text-sm ${
                          !check.configured
                            ? 'text-gray-400'
                            : check.ok
                              ? 'text-gray-600'
                              : 'text-red-700'
                        }`}
                      >
                        {check.message}
                      </p>
                      {/* Only worth saying when it is actually down. */}
                      {check.configured && !check.ok && (
                        <p className="text-xs text-gray-600 mt-0.5">{check.impact}</p>
                      )}
                    </div>
                    {check.href && !check.ok && (
                      <Link
                        href={check.href}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700 shrink-0"
                      >
                        Fix
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
