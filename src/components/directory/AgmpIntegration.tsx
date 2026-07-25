'use client'

import { useState } from 'react'
import { Plug, Check, X, Copy, Download, ExternalLink } from 'lucide-react'

interface Props {
  webhookConfigured: boolean
  webhookSigned: boolean
  exportTokenSet: boolean
}

// Shows the AGMP data handoff at a glance and gives you the URLs to send them.
// Read-only: the actual config lives in Vercel env vars.
export function AgmpIntegration({ webhookConfigured, webhookSigned, exportTokenSet }: Props) {
  const [copied, setCopied] = useState('')

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
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
      </div>
    </section>
  )
}
