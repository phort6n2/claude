'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Check, AlertCircle } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * "Rewrite these sentences", on the finding that names them.
 *
 * WHY THIS FINDING AND NOT THE OTHERS. The fault is wording, and wording is
 * the one thing a model is a reliable source of — it is prose, not fact. A
 * spend cliff is not fixed by better sentences, and a tracking number that is
 * not on the page is fixed by a tick, not a paragraph. So this button lives on
 * `premises-claim-in-copy` alone rather than becoming a general "fix it"
 * affordance that would do nothing useful nine times out of ten.
 *
 * IT PROPOSES; A PERSON APPLIES. Both screens run server-side before anything
 * reaches this component, and again on the way back in — see
 * premises-rewrite.ts. What they cannot judge is whether the new sentence
 * still says what the shop meant, and this is a live page belonging to
 * somebody else's business, so the diff is shown and the press is theirs.
 */

interface Proposal {
  id: string
  where: string
  before: string
  after: string
}
interface Rejected {
  where: string
  reason: string
  before: string
  after: string
}

export default function PremisesFixButton({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [handOnly, setHandOnly] = useState<Array<{ where: string; sentence: string }>>([])
  const [done, setDone] = useState<string | null>(null)
  // Unticking one is how an operator takes three of four. Applying the whole
  // batch or nothing would mean pressing it again for the one they liked.
  const [skip, setSkip] = useState<Set<string>>(new Set())

  async function post(body: unknown) {
    const res = await fetch(`/api/clients/${clientId}/premises-rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await errorFrom(res))
    return res.json()
  }

  async function propose() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const data = await post({})
      setProposals(data.proposals || [])
      setRejected(data.rejected || [])
      setHandOnly(data.handOnly || [])
      if ((data.proposals || []).length === 0 && data.message) setDone(data.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The rewrite failed')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    const take = (proposals || []).filter((p) => !skip.has(p.id))
    if (take.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const data = await post({ apply: take })
      setDone(data.message || 'Applied.')
      setProposals(null)
      setRejected(
        (data.skipped || []).map((s: { where: string; reason: string }) => ({
          ...s,
          before: '',
          after: '',
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply those')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={propose}
        disabled={busy}
        title="Reads the offending sentences, rewrites each one without the claim, and shows you the before and after before anything is saved."
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {busy && !proposals ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {busy && !proposals ? 'Rewriting…' : 'Rewrite with AI'}
      </button>

      {(proposals || error || done || rejected.length > 0 || handOnly.length > 0) && (
        <div className="mt-2 w-full space-y-2">
          {error && (
            <p className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          {done && (
            <p className="flex items-start gap-1.5 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {done}
            </p>
          )}

          {proposals && proposals.length > 0 && (
            <>
              {proposals.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-2"
                >
                  <input
                    type="checkbox"
                    checked={!skip.has(p.id)}
                    onChange={() =>
                      setSkip((s) => {
                        const next = new Set(s)
                        if (next.has(p.id)) next.delete(p.id)
                        else next.add(p.id)
                        return next
                      })
                    }
                    className="mt-0.5"
                  />
                  <span className="min-w-0 text-xs">
                    <span className="block font-semibold text-gray-500">{p.where}</span>
                    <span className="mt-1 block text-red-700 line-through">{p.before}</span>
                    <span className="mt-0.5 block font-medium text-green-800">{p.after}</span>
                  </span>
                </label>
              ))}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy || proposals.every((p) => skip.has(p.id))}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Apply {proposals.filter((p) => !skip.has(p.id)).length}
                </button>
                <button
                  type="button"
                  onClick={() => setProposals(null)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {/* A screen firing silently looks exactly like the model returning
              two rewrites instead of three, and the obvious next move —
              press it again — is the one that cannot help. */}
          {rejected.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-semibold">Left alone:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {rejected.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium">{r.where}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {handOnly.length > 0 && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
              <p className="m-0">
                {handOnly.length} of these {handOnly.length === 1 ? 'is' : 'are'} in a field this
                cannot write back to — a kept page is raw HTML a near-miss replacement would
                mangle, and the insurance page&rsquo;s copy is a compliance statement somebody
                typed on purpose. Edit {handOnly.length === 1 ? 'it' : 'those'} by hand:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {handOnly.map((h, i) => (
                  <li key={i}>{h.where}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  )
}
