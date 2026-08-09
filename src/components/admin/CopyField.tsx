'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

/** Read-only value with a copy button — for webhook URLs and embed snippets. */
export default function CopyField({
  label,
  value,
  multiline,
}: {
  label: string
  value: string
  multiline?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-semibold text-gray-600">{label}</label>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={2}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-xs font-mono bg-gray-50 text-gray-700"
        />
      ) : (
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-xs font-mono bg-gray-50 text-gray-700"
        />
      )}
    </div>
  )
}
