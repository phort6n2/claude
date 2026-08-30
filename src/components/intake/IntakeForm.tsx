'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronRight, Loader2, ShieldCheck } from 'lucide-react'
import type { IntakeSection } from '@/lib/client-intake'

/**
 * The form a shop fills in from their welcome email.
 *
 * Built for a phone between jobs, which decides most of what it is:
 *
 * - It AUTOSAVES. There is no submit-or-lose-it, because the realistic
 *   session is three minutes in a waiting room and the rest tomorrow.
 * - One section at a time. Fifteen questions on one screen reads as
 *   paperwork; five reads as a form.
 * - Submitting is a separate, deliberate act at the end, and it says what
 *   happens next — a human reads it — because a shop that thinks the site
 *   went live on submit is a shop that will not read the follow-up.
 */

interface Deliverability {
  senders: { emailAddress: string | null; emailName: string; smsNumber: string | null }
  email: Array<{ platform: string; steps: string[] }>
  sms: Array<{ platform: string; steps: string[] }>
}

type Answers = Record<string, unknown>

export default function IntakeForm({
  token,
  businessName,
  kind,
  sections,
  initialAnswers,
  initialStatus,
  deliverability,
}: {
  token: string
  businessName: string
  kind: string
  sections: IntakeSection[]
  initialAnswers: Answers
  initialStatus: string
  deliverability: Deliverability
}) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(initialStatus === 'SUBMITTED' || initialStatus === 'APPROVED')
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(
    async (next: Answers) => {
      setSaving(true)
      try {
        await fetch(`/api/intake/${token}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: next }),
        })
      } catch {
        // A failed autosave is not worth interrupting typing for; the next
        // keystroke retries, and submitting sends the whole set anyway.
      } finally {
        setSaving(false)
      }
    },
    [token]
  )

  const set = (key: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void save(next), 700)
      return next
    })
    setError(null)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function submit() {
    setSaving(true)
    setError(null)
    setMissing([])
    try {
      const res = await fetch(`/api/intake/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMissing(data.missing || [])
        throw new Error(data.error || 'Something went wrong.')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-green-900">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Check className="h-5 w-5" /> Got it — thank you.
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          Someone reads this before anything goes live, so nothing you typed is on the internet
          yet. You&apos;ll hear from us once your pages are built. If you spot a mistake in the
          meantime, just reply to the email that brought you here.
        </p>
        <Whitelist deliverability={deliverability} />
      </div>
    )
  }

  const current = sections[step]
  const last = step === sections.length - 1

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {sections.map((section, i) => (
          <span
            key={section.key}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-900">{current.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{current.blurb}</p>
      </div>

      <div className="space-y-4">
        {current.fields.map((field) => (
          <Field key={field.key} field={field} value={answers[field.key]} onChange={set} />
        ))}
      </div>

      {current.key === 'alerts' && <Whitelist deliverability={deliverability} />}

      {!!missing.length && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" /> Still needed before we can build this:
          </p>
          <ul className="list-disc ml-5 mt-1">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
          >
            Back
          </button>
        )}
        {last ? (
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Send this to {businessName ? 'the team' : 'us'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {saving ? 'Saving…' : 'Saved as you type'}
        </span>
      </div>

      {kind === 'EXISTING' && step === 0 && (
        <p className="text-xs text-gray-500">
          These are the details we already hold for you. Correct anything that is wrong — what you
          leave is what your site says.
        </p>
      )}
    </div>
  )
}

function Field({
  field,
  value,
  onChange,
}: {
  field: IntakeSection['fields'][number]
  value: unknown
  onChange: (key: string, value: unknown) => void
}) {
  const label = (
    <span className="block text-sm font-medium text-gray-900">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </span>
  )
  const help = field.help ? <span className="block text-xs text-gray-500 mt-0.5">{field.help}</span> : null
  const box = 'mt-1.5 w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500'

  if (field.kind === 'boolean') {
    return (
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          {label}
          {help}
        </span>
      </label>
    )
  }

  if (field.kind === 'list') {
    return (
      <ListField field={field} value={value} onChange={onChange} label={label} help={help} box={box} />
    )
  }

  if (field.kind === 'textarea') {
    return (
      <label className="block">
        {label}
        {help}
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          rows={4}
          placeholder={field.placeholder}
          className={box}
        />
      </label>
    )
  }

  if (field.kind === 'select') {
    return (
      <label className="block">
        {label}
        {help}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={box}
        >
          <option value="">Choose…</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="block">
      {label}
      {help}
      <input
        type={field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : 'text'}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className={box}
      />
    </label>
  )
}

/**
 * A list typed as free text.
 *
 * WHAT IS SHOWN IS THE RAW TEXT, and the parsed list rides along beside it.
 * The old version rendered the parsed list back into the textarea on every
 * keystroke, and the per-entry trim ate the trailing space the instant it was
 * typed — so "Colorado Springs" could never be entered at all. The person on
 * this form is a shop owner typing town names; a form that refuses the space
 * bar reads as broken, because it is.
 *
 * Commas work as separators too, because "Denver, Aurora, Lakewood" is how
 * people actually type a list when nobody tells them otherwise.
 */
function ListField({
  field,
  value,
  onChange,
  label,
  help,
  box,
}: {
  field: IntakeSection['fields'][number]
  value: unknown
  onChange: (key: string, value: unknown) => void
  label: React.ReactNode
  help: React.ReactNode
  box: string
}) {
  const [raw, setRaw] = useState(() =>
    Array.isArray(value) ? (value as string[]).join('\n') : ''
  )
  return (
    <label className="block">
      {label}
      {help}
      <textarea
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          onChange(
            field.key,
            e.target.value
              .split(/[\n,]/)
              .map((v) => v.trim())
              .filter(Boolean)
          )
        }}
        rows={4}
        placeholder={field.placeholder || 'One per line'}
        className={box}
      />
    </label>
  )
}

/**
 * The whitelisting block, shown where the alert recipients are entered and
 * again on the thank-you screen.
 *
 * Twice on purpose. It is the only instruction on this form with a deadline
 * attached — the first lead can arrive the day the site goes live, and an
 * alert in a spam folder is indistinguishable from a platform that does not
 * work.
 */
function Whitelist({ deliverability }: { deliverability: Deliverability }) {
  const { senders, email, sms } = deliverability
  if (!email.length && !sms.length) return null

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mt-4">
      <p className="font-semibold text-sm text-blue-900 flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4" /> Let the alerts through
      </p>
      <p className="text-sm text-blue-900 mt-1 leading-relaxed">
        Lead alerts come from{' '}
        {senders.emailAddress && <strong>{senders.emailAddress}</strong>}
        {senders.emailAddress && senders.smsNumber && ' and '}
        {senders.smsNumber && <strong>{senders.smsNumber}</strong>}. Add them now — a first alert
        that lands in spam is a customer who called somebody else.
      </p>
      <div className="mt-3 space-y-3">
        {[...email, ...sms].map((group) => (
          <details key={group.platform} className="text-sm">
            <summary className="cursor-pointer font-medium text-blue-900">{group.platform}</summary>
            <ol className="list-decimal ml-5 mt-1.5 space-y-1 text-blue-900/90">
              {group.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </div>
  )
}
