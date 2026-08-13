'use client'

import { Plus, X, TriangleAlert } from 'lucide-react'
import { toE164 } from '@/lib/contact-links'

/**
 * A list of people who should be told about a lead.
 *
 * This replaces a newline-separated textarea. The textarea worked — the field
 * has always been an array and always sent to everyone in it — but nothing
 * about it said so, and a feature nobody can see is a feature nobody uses.
 * One row per person, an obvious Add button, and a remove on each.
 *
 * The marks on a bad row are a warning, not a gate — typing is allowed to be
 * unfinished. The save endpoint has the final word and names the offending
 * entry when it rejects one, so the point of marking here is to catch the
 * typo before someone waits for a round trip to be told about it.
 */

export type RecipientKind = 'email' | 'phone'

function problemWith(kind: RecipientKind, value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (kind === 'email') {
    // Deliberately loose. Anything stricter starts rejecting addresses that
    // work, and the real test is whether the mail arrives.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? null : 'That does not look like an email address.'
  }
  return toE164(trimmed) ? null : 'That is not a number a text can be sent to.'
}

export function RecipientList({
  kind,
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  kind: RecipientKind
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  addLabel: string
}) {
  // Always show one row, so an empty list still offers somewhere to type
  // rather than an Add button and no explanation.
  const rows = values.length > 0 ? values : ['']

  const update = (index: number, value: string) => {
    const next = [...rows]
    next[index] = value
    onChange(next)
  }

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {rows.map((value, index) => {
        const problem = problemWith(kind, value)
        // The number that will actually be dialled, shown once it differs
        // from what was typed — "(503) 555-0142" and "+15035550142" being the
        // same thing is worth confirming rather than assuming.
        const normalized = kind === 'phone' ? toE164(value) : null
        return (
          <div key={index}>
            <div className="flex items-center gap-2">
              <input
                type={kind === 'email' ? 'email' : 'tel'}
                value={value}
                onChange={(e) => update(index, e.target.value)}
                placeholder={placeholder}
                className={`flex-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 ${
                  problem ? 'border-amber-400 bg-amber-50' : ''
                }`}
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove ${value || 'this recipient'}`}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {problem && (
              <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
                <TriangleAlert size={12} /> {problem}
              </p>
            )}
            {!problem && normalized && normalized !== value.trim() && (
              <p className="mt-1 text-xs text-gray-400">Will text {normalized}</p>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => onChange([...rows, ''])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        <Plus size={14} />
        {addLabel}
      </button>
    </div>
  )
}
