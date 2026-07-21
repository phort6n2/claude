'use client'

import { useState } from 'react'
import { Code2, Copy, Check } from 'lucide-react'

export function ReviewWidgetCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Code2 width={20} height={20} className="text-blue-600" /> Put your Google reviews on your
        website
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        Paste this one line into your site to show a live Google-rating badge — free. It updates
        automatically and links back to your listing.
      </p>
      <div className="mt-4 flex items-start gap-2">
        <pre className="flex-1 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
          <code>{code}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? (
            <>
              <Check width={14} height={14} className="text-green-600" /> Copied
            </>
          ) : (
            <>
              <Copy width={14} height={14} /> Copy
            </>
          )}
        </button>
      </div>
    </section>
  )
}
