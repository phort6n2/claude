'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { IntakeSection } from '@/lib/client-intake'
import { errorFrom } from '@/lib/http-error'

/**
 * Read what the shop said, correct it, then approve.
 *
 * EDITABLE on purpose. The alternative — approve or reject — means a single
 * wrong ZIP sends the whole form back to a shop owner and waits a day. The
 * answers are theirs; the record is ours to get right, and what is approved
 * is what is on this screen when the button is pressed.
 */

type Answers = Record<string, unknown>

export default function IntakeReview({
  intakeId,
  sections,
  initialAnswers,
  status,
  kind,
  missing,
}: {
  intakeId: string
  sections: IntakeSection[]
  initialAnswers: Answers
  status: string
  kind: string
  missing: string[]
}) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const approved = status === 'APPROVED'

  const set = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  async function approve() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/intakes/${intakeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'Could not approve this'))
      const data = await res.json()
      router.push(`/admin/clients/${data.clientId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setSaving(false)
    }
  }

  return (
    <div className="p-6 pt-4 space-y-5">
      {!!missing.length && !approved && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium flex items-center gap-1.5">
            <AlertCircle size={15} /> Not answered yet — fill these in or send it back:
          </p>
          <ul className="list-disc ml-5 mt-1">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.key} className="rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm">{section.title}</h3>
          <div className="mt-3 space-y-3">
            {section.fields.map((field) => {
              const value = answers[field.key]
              const common = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm'
              return (
                <div key={field.key} className="grid gap-1 sm:grid-cols-[13rem_1fr] sm:items-start">
                  <label className="text-sm text-gray-500 sm:pt-2">{field.label}</label>
                  {field.kind === 'boolean' ? (
                    <label className="flex items-center gap-2 text-sm sm:pt-2">
                      <input
                        type="checkbox"
                        checked={value === true}
                        disabled={approved}
                        onChange={(e) => set(field.key, e.target.checked)}
                      />
                      <span className="text-gray-900">{value === true ? 'Yes' : 'No'}</span>
                    </label>
                  ) : field.kind === 'list' ? (
                    <textarea
                      value={(Array.isArray(value) ? (value as string[]) : []).join('\n')}
                      disabled={approved}
                      rows={3}
                      onChange={(e) =>
                        set(field.key, e.target.value.split('\n').map((v) => v.trim()).filter(Boolean))
                      }
                      className={common}
                    />
                  ) : field.kind === 'textarea' ? (
                    <textarea
                      value={typeof value === 'string' ? value : ''}
                      disabled={approved}
                      rows={3}
                      onChange={(e) => set(field.key, e.target.value)}
                      className={common}
                    />
                  ) : (
                    <input
                      value={typeof value === 'string' ? value : ''}
                      disabled={approved}
                      onChange={(e) => set(field.key, e.target.value)}
                      className={common}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {approved ? (
        <p className="text-sm text-green-700 flex items-center gap-1.5">
          <Check size={15} /> Approved — this is a client now.
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={approve}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {kind === 'EXISTING' ? 'Apply to the client' : 'Approve and create the client'}
          </button>
          <span className="text-xs text-gray-500">
            {kind === 'EXISTING'
              ? 'Updates the record we already hold, plus their alert recipients.'
              : 'Creates the client as ONBOARDING — photos, logo and ads wiring still come after this.'}
          </span>
        </div>
      )}
    </div>
  )
}
