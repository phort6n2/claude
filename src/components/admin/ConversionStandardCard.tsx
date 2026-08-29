'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'

/**
 * Is this account set up the same way as every other one?
 *
 * The card is deliberately two things at once. For an account that exists it
 * is an audit; for one that does not it is the checklist — the same four
 * actions, with the steps to create each. Splitting those into "instructions"
 * and "checker" would mean the instructions are the ones nobody opens, and
 * they are exactly what somebody needs at the moment the checker says
 * "missing".
 */

interface Spec {
  key: string
  name: string
  category: string
  type: string
  origin: string
  fires: string
  countingType: string
  clickLookbackDays: number
  callSeconds?: number
  biddable: boolean
  setup: string[]
}

interface Finding {
  key: string
  name: string
  state: 'ok' | 'settings' | 'rename' | 'missing' | 'duplicate'
  actionId?: string
  actionName?: string
  fix?: string
  differences: string[]
  setup: string[]
  fires: string
}

interface Audit {
  customerId: string
  findings: Finding[]
  doubleCounting: string[]
  goalIssues: string[]
  extras: Array<{ id: string; name: string; note: string }>
  clean: boolean
}

const STATE_STYLE: Record<Finding['state'], { label: string; cls: string }> = {
  ok: { label: 'Set up', cls: 'text-green-700 bg-green-50 border-green-200' },
  settings: { label: 'Wrong settings', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  rename: { label: 'Rename it', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  duplicate: { label: 'Duplicates', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  missing: { label: 'Missing', cls: 'text-red-700 bg-red-50 border-red-200' },
}

export default function ConversionStandardCard({ clientId }: { clientId: string }) {
  const [standard, setStandard] = useState<Spec[] | null>(null)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (await fetch(`/api/clients/${clientId}/ads-conversions`)).json()
      setStandard(data.standard || [])
      setAudit(data.audit || null)
      setReason(data.reason || null)
    } catch {
      setReason('Could not reach Google Ads.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !standard) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Checking the account…
      </div>
    )
  }

  const findingFor = (key: string) => audit?.findings.find((f) => f.key === key)

  return (
    <div className="p-6 pt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Four conversion actions, the same names in every account — so a report can span them and
          this card can tell you which are wrong without anyone opening Google Ads.
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-check
        </button>
      </div>

      {reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>{reason} The checklist below is what to set up.</span>
        </div>
      )}

      {audit?.clean && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900 flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          Account {audit.customerId} matches the standard — all four actions, named and configured
          the same as every other client.
        </div>
      )}

      <div className="space-y-2">
        {(standard || []).map((spec) => {
          const finding = findingFor(spec.key)
          const state = finding?.state
          const style = state ? STATE_STYLE[state] : null
          const expanded = open === spec.key
          return (
            <div key={spec.key} className="rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : spec.key)}
                className="w-full text-left p-4 flex flex-wrap items-center gap-2"
              >
                <span className="font-mono text-sm font-semibold text-gray-900">{spec.name}</span>
                {style && (
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 border ${style.cls}`}
                  >
                    {style.label}
                  </span>
                )}
                <span className="text-xs text-gray-500 flex-1 min-w-[12rem]">{spec.fires}</span>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              {finding && finding.state !== 'ok' && (
                <div className="px-4 pb-3 -mt-1">
                  <p className="text-sm text-amber-900 flex items-start gap-1.5">
                    {finding.state === 'missing' ? (
                      <Plus size={15} className="mt-0.5 shrink-0" />
                    ) : finding.state === 'rename' ? (
                      <PencilLine size={15} className="mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    )}
                    {finding.fix}
                  </p>
                  {/* The settings that disagree, listed under the fix. A
                      rename and a wrong call length arrive together more often
                      than not, and showing only the rename means the second
                      correction never gets made. */}
                  {finding.differences.length > 0 && (
                    <ul className="mt-1 ml-6 list-disc text-sm text-amber-900 space-y-0.5">
                      {finding.differences.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-4">
                    <div>
                      <dt className="text-gray-400">Goal</dt>
                      <dd>{spec.category.replace(/_/g, ' ').toLowerCase()}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Count</dt>
                      <dd>{spec.countingType === 'ONE_PER_CLICK' ? 'One' : 'Every'}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Click window</dt>
                      <dd>{spec.clickLookbackDays} days</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400">Bidding</dt>
                      <dd>{spec.biddable ? 'Primary' : 'Secondary'}</dd>
                    </div>
                  </dl>
                  <ol className="list-decimal ml-4 space-y-1 text-sm text-gray-700">
                    {spec.setup.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {finding?.actionId && (
                    <p className="text-xs text-gray-400 font-mono">
                      Action {finding.actionId}
                      {finding.actionName && finding.actionName !== spec.name
                        ? ` — currently "${finding.actionName}"`
                        : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!!audit?.doubleCounting?.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-900">Counting the same lead twice</p>
          <ul className="list-disc ml-4 text-sm text-amber-900 space-y-1">
            {audit.doubleCounting.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          {/* Nothing in this app can create these. They come from linking a
              GA4 property and accepting Google's offer to import its events,
              at which point the same form submission is reported twice and
              bidding treats it as two wins. */}
          <p className="text-xs text-amber-900/80">
            Nothing in this app uploads to Analytics — it writes to one Ads action over the API.
            These come from importing GA4 events in the Ads UI.
          </p>
        </div>
      )}

      {!!audit?.goalIssues.length && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-900">Bidding and upload target</p>
          <ul className="list-disc ml-4 text-sm text-amber-900 space-y-1">
            {audit.goalIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {!!audit?.extras.length && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-1">
          <p className="text-sm font-semibold text-gray-900">Other AGMP actions in this account</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {audit.extras.map((extra) => (
              <li key={extra.id}>
                <span className="font-mono text-xs">{extra.name}</span> — {extra.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500 flex items-start gap-1.5">
        <Copy size={13} className="mt-0.5 shrink-0" />
        Renaming keeps the history. Creating a second action of the same kind starts the count and
        the bidding learning over, which is why every fix above says rename rather than replace.
      </p>
    </div>
  )
}
