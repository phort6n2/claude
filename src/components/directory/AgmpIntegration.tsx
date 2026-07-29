'use client'

import { useState } from 'react'
import { Plug, Check, X, Copy, Download, ExternalLink, Send } from 'lucide-react'

interface TestResult {
  ok: boolean
  status?: number
  body?: string
  error?: string
  signed: boolean
}

interface Props {
  webhookConfigured: boolean
  webhookSigned: boolean
  exportTokenSet: boolean
}

// Shows the AGMP data handoff at a glance and gives you the URLs to send them.
// Read-only: the actual config lives in Vercel env vars.
export function AgmpIntegration({ webhookConfigured, webhookSigned, exportTokenSet }: Props) {
  const [copied, setCopied] = useState('')
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)

  async function sendTest() {
    setTesting(true)
    setTest(null)
    try {
      const res = await fetch('/api/directory/agmp/test', { method: 'POST' })
      setTest(await res.json())
    } catch (e) {
      setTest({ ok: false, error: e instanceof Error ? e.message : 'Request failed', signed: false })
    } finally {
      setTesting(false)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const exportUrl = `${origin}/api/directory/export/shops`

  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  const Row = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
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
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
    </div>
  )

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Plug width={18} height={18} className="text-blue-600" /> AGMP data handoff
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Sends shop-side events to AGMP so their nurture starts the moment a shop raises its hand,
        and exposes the shop list for their outbound. Consumer quote requests are never included —
        those stay with the shop they were sent to.
      </p>

      <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 px-4 py-2">
        <Row
          ok={webhookConfigured}
          label="Lead events → AGMP"
          hint={
            webhookConfigured
              ? 'Claims, new listings, publishes, Featured purchases and rank drops are pushed live.'
              : 'Set AGMP_WEBHOOK_URL in Vercel to start pushing events.'
          }
        />
        <Row
          ok={webhookSigned}
          label="Signed payloads"
          hint={
            webhookSigned
              ? 'Each request carries an HMAC signature AGMP can verify.'
              : 'Optional: set AGMP_WEBHOOK_SECRET so AGMP can verify events came from you.'
          }
        />
        <Row
          ok={exportTokenSet}
          label="Shop export token"
          hint={
            exportTokenSet
              ? 'AGMP can pull the shop list with their own token.'
              : 'Set DIRECTORY_EXPORT_TOKEN so AGMP can pull without your admin login.'
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`${exportUrl}?format=csv`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Download width={15} height={15} /> Download shop CSV
        </a>
        <button
          type="button"
          onClick={() => copy('url', exportUrl)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <Copy width={15} height={15} /> {copied === 'url' ? 'Copied' : 'Copy export URL for AGMP'}
        </button>
        <a
          href={exportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          View JSON <ExternalLink width={13} height={13} />
        </a>
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || !webhookConfigured}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send width={15} height={15} /> {testing ? 'Sending…' : 'Send test event'}
        </button>
      </div>

      {/* The copied URL carries no credential — say so rather than let it be
          pasted to AGMP and silently 401 for everyone but you. */}
      {!exportTokenSet && copied === 'url' && (
        <p className="mt-2 text-xs text-amber-700">
          Heads up: this URL only works while you&apos;re logged in here. Set
          DIRECTORY_EXPORT_TOKEN before sending it to AGMP.
        </p>
      )}

      {test && (
        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            test.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
          }`}
        >
          <p className={`font-semibold ${test.ok ? 'text-green-800' : 'text-red-800'}`}>
            {test.ok
              ? `Delivered — AGMP answered ${test.status}`
              : test.status
                ? `AGMP rejected it — ${test.status}`
                : 'Could not reach AGMP'}
          </p>
          {test.ok && (
            <p className="mt-1 text-xs text-green-800">
              A test event landed on the receiving end. It&apos;s tagged{' '}
              <code className="rounded bg-green-100 px-1">X-WRHQ-Test: 1</code>
              {test.signed ? ' and signed.' : ' but unsigned — set AGMP_WEBHOOK_SECRET to sign it.'}{' '}
              Filter on that header so test traffic never enters real nurture.
            </p>
          )}
          {(test.error || test.body) && (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs text-gray-700">
              {test.error || test.body}
            </pre>
          )}
        </div>
      )}
    </section>
  )
}
