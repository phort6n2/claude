'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

/**
 * The public link to this client's ranking report.
 *
 * Built in the browser from the current origin rather than server-side,
 * because the report gets shared from whatever host the admin is actually
 * on, and a link pointing at the wrong domain is worse than no link.
 */
export default function ShareLinkBox({
  token,
  businessName,
  disabled,
}: {
  token: string
  businessName: string
  disabled?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/r/${token}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked; the input is selectable */
    }
  }

  if (disabled) {
    return (
      <p className="text-xs text-gray-500">
        A shareable link appears here once {businessName} has its first scan.
      </p>
    )
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        Shareable report link
      </label>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50 text-gray-700"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Anyone with this link sees this report — no login. It shows only rankings, nothing else on
        the account.
      </p>
    </div>
  )
}
