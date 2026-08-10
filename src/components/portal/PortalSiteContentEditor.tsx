'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { CONTENT_LIMITS, type FaqItem } from '@/lib/portal-content-limits'

/**
 * The two things on a shop's website that are genuinely theirs to write: the
 * warranty they stand behind, and the answers to what their customers actually
 * ask on the phone.
 *
 * Everything else on the page is admin-only, and this deliberately does not
 * pretend otherwise — there is no greyed-out hero field hinting at an upgrade.
 * A shop owner opening this should see two short forms he can finish in five
 * minutes, not a page builder he'll close.
 *
 * Limits are shown as remaining characters rather than enforced silently by
 * `maxLength`. Typing into a box that stops accepting letters with no
 * explanation is how people lose a sentence and blame the software.
 */

interface State {
  warrantyTitle: string
  warrantyText: string
  faq: FaqItem[]
}

const EMPTY: State = { warrantyTitle: '', warrantyText: '', faq: [] }

function Counter({ value, limit }: { value: string; limit: number }) {
  const left = limit - value.length
  const tight = left < limit * 0.1
  return (
    <span className={`text-xs tabular-nums ${left < 0 ? 'text-red-600' : tight ? 'text-amber-600' : 'text-gray-400'}`}>
      {left < 0 ? `${-left} too many` : `${left} left`}
    </span>
  )
}

export default function PortalSiteContentEditor({ siteUrl }: { siteUrl: string | null }) {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch('/api/portal/site-content')).json()
      setState({
        warrantyTitle: data.warrantyTitle || '',
        warrantyText: data.warrantyText || '',
        faq: Array.isArray(data.faq) ? data.faq : [],
      })
    } catch {
      setState(EMPTY)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = <K extends keyof State>(key: K, value: State[K]) => {
    setState((prev) => (prev ? { ...prev, [key]: value } : prev))
    setMessage(null)
  }

  const setFaq = (index: number, field: keyof FaqItem, value: string) => {
    setState((prev) => {
      if (!prev) return prev
      const faq = prev.faq.map((item, i) => (i === index ? { ...item, [field]: value } : item))
      return { ...prev, faq }
    })
    setMessage(null)
  }

  async function save() {
    if (!state) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/portal/site-content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save your changes')
      setMessage({ ok: true, text: 'Saved. Your website updates within a few minutes.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  if (!state) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    )
  }

  const full = state.faq.length >= CONTENT_LIMITS.maxFaqItems

  return (
    <div className="space-y-6">
      {/* ---- Warranty ---- */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Your warranty</h2>
          <p className="text-sm text-gray-600">
            What you stand behind, in your own words. Leave both boxes empty and the warranty
            section simply won&apos;t appear on your site.
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-medium text-gray-700" htmlFor="warranty-title">
              What you call it
            </label>
            <Counter value={state.warrantyTitle} limit={CONTENT_LIMITS.warrantyTitle} />
          </div>
          <input
            id="warranty-title"
            type="text"
            value={state.warrantyTitle}
            onChange={(e) => set('warrantyTitle', e.target.value)}
            placeholder="Lifetime workmanship warranty"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <label className="text-sm font-medium text-gray-700" htmlFor="warranty-text">
              What it actually covers
            </label>
            <Counter value={state.warrantyText} limit={CONTENT_LIMITS.warrantyText} />
          </div>
          <textarea
            id="warranty-text"
            value={state.warrantyText}
            onChange={(e) => set('warrantyText', e.target.value)}
            rows={5}
            placeholder="We warranty our workmanship for as long as you own the vehicle — leaks, wind noise, and moulding or trim that fails because of how the glass was set. Bring it back and we'll put it right at no charge."
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          {/* Not a style rule. Advertising a warranty by name without stating
              its terms is the failure the site's content rules exist to stop,
              so the save is rejected rather than quietly publishing half. */}
          <p className="text-xs text-gray-500">
            If you name a warranty you have to say what it covers — a name on its own can&apos;t go
            on the site.
          </p>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Questions customers ask</h2>
          <p className="text-sm text-gray-600">
            The things you answer on the phone ten times a week. Up to{' '}
            {CONTENT_LIMITS.maxFaqItems}. Answering them here means the ones who read it call
            ready to book instead of ringing to ask.
          </p>
        </div>

        {state.faq.length === 0 && (
          <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4">
            Nothing added yet. Good ones for glass: does insurance cover it, how long does it take,
            can you come to me, when can I drive it.
          </p>
        )}

        <div className="space-y-4">
          {state.faq.map((item, index) => (
            <div key={index} className="rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor={`faq-q-${index}`}>
                  Question {index + 1}
                </label>
                <div className="flex items-center gap-3">
                  <Counter value={item.q} limit={CONTENT_LIMITS.faqQuestion} />
                  <button
                    type="button"
                    onClick={() => {
                      set(
                        'faq',
                        state.faq.filter((_, i) => i !== index)
                      )
                    }}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`Remove question ${index + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <input
                id={`faq-q-${index}`}
                type="text"
                value={item.q}
                onChange={(e) => setFaq(index, 'q', e.target.value)}
                placeholder="Will my insurance cover this?"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium text-gray-700" htmlFor={`faq-a-${index}`}>
                  Your answer
                </label>
                <Counter value={item.a} limit={CONTENT_LIMITS.faqAnswer} />
              </div>
              <textarea
                id={`faq-a-${index}`}
                value={item.a}
                onChange={(e) => setFaq(index, 'a', e.target.value)}
                rows={3}
                placeholder="Most comprehensive policies do. Call us with your policy number and we'll check it with you before you commit to anything."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => set('faq', [...state.faq, { q: '', a: '' }])}
          disabled={full}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus size={15} />
          Add a question
        </button>
        {full && (
          <span className="ml-3 text-xs text-gray-500">
            That&apos;s the maximum. Remove one to add another.
          </span>
        )}
      </section>

      {/* ---- Save. Sticky on a phone, because the FAQ list gets long and the
              owner is doing this one-handed between jobs.

              Solid background, not a gradient: the message can wrap to three
              lines, and a fading backdrop lets it sit unreadably on top of
              whatever section happens to be scrolled underneath. ---- */}
      <div className="sticky bottom-[56px] sm:bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-3 py-3 bg-white border-t border-gray-200 sm:rounded-xl sm:border sm:shadow-sm space-y-2">
        {message && (
          <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--brand-ink)] text-white text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Save changes
          </button>
          {siteUrl && (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
            >
              View my website
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
