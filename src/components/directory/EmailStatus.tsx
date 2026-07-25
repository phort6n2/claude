'use client'

import { useState } from 'react'
import { Mail, Loader2, Check, X, Send, AlertTriangle } from 'lucide-react'

interface Props {
  transportReady: boolean
  fromAddress: string
  notifyEmail: string
  mailingAddressSet: boolean
  campaignArmed: boolean
}

// Email health at a glance + a real test send. Everything else swallows send
// failures on purpose, so without this a bad key or unverified domain would
// only show up as leads quietly never arriving.
export function EmailStatus({
  transportReady,
  fromAddress,
  notifyEmail,
  mailingAddressSet,
  campaignArmed,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  async function test() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/directory/email/test', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Send failed')
      setResult({ ok: true, msg: `Sent to ${json.to} — check your inbox.` })
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : 'Send failed' })
    } finally {
      setBusy(false)
    }
  }

  const Row = ({ ok, label, value }: { ok: boolean; label: string; value: string }) => (
    <div className="flex items-start gap-2.5 py-1.5">
      {ok ? (
        <Check width={16} height={16} className="mt-0.5 shrink-0 text-green-600" />
      ) : (
        <X width={16} height={16} className="mt-0.5 shrink-0 text-gray-300" />
      )}
      <div className="min-w-0">
        <span className={ok ? 'text-sm font-medium text-gray-900' : 'text-sm text-gray-500'}>
          {label}
        </span>
        <p className="truncate text-xs text-gray-500">{value}</p>
      </div>
    </div>
  )

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Mail width={18} height={18} className="text-blue-600" /> Email
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Powers lead alerts, listing emails, and the upsell campaign. Send yourself a test to
        confirm the key and sending domain actually work.
      </p>

      <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 px-4 py-2">
        <Row
          ok={transportReady}
          label="Resend connected"
          value={transportReady ? 'RESEND_API_KEY is set' : 'Set RESEND_API_KEY in Vercel'}
        />
        <Row ok={!!fromAddress} label="Sends from" value={fromAddress} />
        <Row
          ok={!!notifyEmail}
          label="Your lead copies"
          value={
            notifyEmail || 'Set DIRECTORY_NOTIFY_EMAIL to get copied on every lead'
          }
        />
        <Row
          ok={campaignArmed}
          label="Upsell campaign armed"
          value={
            campaignArmed
              ? 'Drip + "you got passed" emails will send'
              : mailingAddressSet
                ? 'Set DIRECTORY_CAMPAIGN_ENABLED=1 to arm'
                : 'Set DIRECTORY_MAILING_ADDRESS, then DIRECTORY_CAMPAIGN_ENABLED=1'
          }
        />
      </div>

      <button
        type="button"
        onClick={test}
        disabled={busy || !transportReady}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="animate-spin" width={16} height={16} />
        ) : (
          <Send width={16} height={16} />
        )}
        Send me a test email
      </button>

      {result && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            result.ok
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {result.ok ? (
            <Check width={16} height={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle width={16} height={16} className="mt-0.5 shrink-0" />
          )}
          <span className="min-w-0 break-words">{result.msg}</span>
        </div>
      )}
    </section>
  )
}
