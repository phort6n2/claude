'use client'

import { useState } from 'react'
import { Megaphone, Loader2, Eye, Send, ArrowUpRight, ShieldCheck, AlertTriangle } from 'lucide-react'

interface Planned {
  slug: string
  email: string
  track: 'featured' | 'agmp'
  step: number
  subject: string
}
interface Report {
  enabled: boolean
  dryRun: boolean
  eligible: number
  planned: Planned[]
  sent: number
  skipped: number
  errors: string[]
  reasons: { unsubscribed: number; notDue: number; completed: number }
}

const TRACK_LABEL: Record<Planned['track'], string> = {
  featured: 'Free → Featured',
  agmp: 'Featured → AGMP',
}
const TRACK_CLS: Record<Planned['track'], string> = {
  featured: 'bg-blue-100 text-blue-800',
  agmp: 'bg-purple-100 text-purple-800',
}

export function CampaignPanel() {
  const [busy, setBusy] = useState<'' | 'preview' | 'send'>('')
  const [error, setError] = useState('')
  const [report, setReport] = useState<Report | null>(null)

  async function run(send: boolean) {
    setBusy(send ? 'send' : 'preview')
    setError('')
    try {
      const res = await fetch(`/api/directory/campaign/run${send ? '?send=1' : ''}`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      setReport(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Megaphone width={18} height={18} className="text-blue-600" /> Upsell campaign
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        A data-driven email drip to owners who opted into marketing: free shops get nudged to{' '}
        <strong>$7/mo Featured</strong> (using their real rank), Featured shops get nudged to{' '}
        <strong>AGMP managed services</strong> (using their real lead count). Every message is
        personalized from live data — no invented numbers.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy !== ''}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy === 'preview' ? <Loader2 className="animate-spin" width={16} height={16} /> : <Eye width={16} height={16} />}
          Preview who&apos;s due
        </button>
        {report?.enabled && (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy !== '' || (report?.planned.length ?? 0) === 0}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === 'send' ? <Loader2 className="animate-spin" width={16} height={16} /> : <Send width={16} height={16} />}
            Send now
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {report && (
        <div className="mt-5">
          {report.enabled ? (
            <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
              <ShieldCheck width={16} height={16} /> Campaign is armed — daily send is on.
              {report.sent > 0 && ` Just sent ${report.sent}.`}
            </p>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle width={16} height={16} /> Preview only — no emails will send yet.
              </p>
              <p className="mt-1 text-amber-800">
                To turn it on, set these in Vercel → Settings → Environment Variables, then redeploy:
                <code className="mx-1 rounded bg-amber-100 px-1">RESEND_API_KEY</code>,
                <code className="mx-1 rounded bg-amber-100 px-1">DIRECTORY_MAILING_ADDRESS</code>, and
                <code className="mx-1 rounded bg-amber-100 px-1">DIRECTORY_CAMPAIGN_ENABLED=1</code>.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              {report.eligible} eligible
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-800">
              {report.planned.length} due now
            </span>
            {report.reasons.notDue > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                {report.reasons.notDue} not due yet
              </span>
            )}
            {report.reasons.completed > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                {report.reasons.completed} finished
              </span>
            )}
            {report.reasons.unsubscribed > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                {report.reasons.unsubscribed} unsubscribed
              </span>
            )}
          </div>

          {report.planned.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {report.dryRun ? 'Would send' : 'Sent'}
              </p>
              {report.planned.map((p) => (
                <div
                  key={`${p.slug}-${p.step}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TRACK_CLS[p.track]}`}>
                        {TRACK_LABEL[p.track]}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        touch {p.step}/3
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-gray-900">{p.subject}</p>
                    <p className="truncate text-xs text-gray-500">
                      {p.slug} · {p.email}
                    </p>
                  </div>
                  <a
                    href={`/directory/shop/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    listing <ArrowUpRight width={13} height={13} />
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
              No one&apos;s due for a touch right now. As free and Featured owners who opted into
              marketing come in, they&apos;ll show up here.
            </p>
          )}

          {report.errors.length > 0 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {report.errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
