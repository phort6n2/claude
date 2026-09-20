'use client'

import { useState } from 'react'
import { Loader2, Check, AlertCircle, ExternalLink, Plus, X } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'
import {
  INSURANCE_PROGRAMS,
  PROGRAM_KEYS,
  MAX_STEPS,
  programFor,
  publishProblem,
  type ProgramKey,
} from '@/lib/insurance-programs'
import { publicInsurerFor } from '@/lib/insurance-rules'

/**
 * The insurance-claim landing page — see lib/insurance-programs.ts.
 *
 * NOT AUTOSAVING, unlike the newer cards beside it. Everything here either
 * publishes a page or states a relationship with an insurer, and a field that
 * commits as you type is the wrong shape for both: a half-typed coverage note
 * would be live, and the network tick would take effect before the person
 * ticking it had decided. So it is a Save button, and the response says in
 * words whether the page is a draft or live — those are the two states an
 * operator confuses here, and the difference is whether an ad may point at it.
 *
 * THE PUBLISH GATE IS SHOWN BEFORE IT IS HIT. `publishProblem` is the same
 * pure function the route refuses with, read here so the button explains
 * itself rather than producing a 400 from a press that looked reasonable.
 */

interface Saved {
  programKey: string
  inNetwork: boolean
  coverageNote: string | null
  claimSteps: string[]
  metaDescription: string | null
  publishedAt: string | null
}

export default function InsuranceProgramCard({
  clientId,
  siteUrl,
  initial,
  suggested,
  state,
}: {
  clientId: string
  /** The site's own origin, so the preview link goes to the real page. */
  siteUrl: string
  initial: Saved | null
  /** The programme this shop's province points at — a suggestion, never a default. */
  suggested: ProgramKey
  /** `Client.state`, so a BC shop is told the network tick is in here. */
  state: string | null
}) {
  // THE TICK IS THE REASON SOMEBODY OPENS THIS CARD, and until it is added
  // the card says nothing about it — so an operator looking for "where do I
  // mark them as in the ICBC network" finds a card about landing pages and
  // moves on. The collapsed state names it.
  const publicInsurer = publicInsurerFor(state)
  const [on, setOn] = useState(!!initial)
  const [key, setKey] = useState<ProgramKey>(
    (initial?.programKey as ProgramKey) || suggested
  )
  const [inNetwork, setInNetwork] = useState(initial?.inNetwork ?? false)
  const [coverageNote, setCoverageNote] = useState(initial?.coverageNote || '')
  const [steps, setSteps] = useState<string[]>(initial?.claimSteps || [])
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription || '')
  const [published, setPublished] = useState(!!initial?.publishedAt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const program = programFor(key)!
  const path = `/${program.slug}`
  const draft = {
    programKey: key,
    inNetwork,
    coverageNote: coverageNote.trim() || null,
    claimSteps: steps.map((s) => s.trim()).filter(Boolean),
    metaDescription: metaDescription.trim() || null,
    publishedAt: null,
  }
  const blocker = publishProblem(draft)

  async function save(publish: boolean) {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/insurance-program`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, publish }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      const data = await res.json()
      setPublished(!!data.published)
      setDone(data.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/insurance-program`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await errorFrom(res))
      const data = await res.json()
      setOn(false)
      setPublished(false)
      setDone(data.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove it')
    } finally {
      setBusy(false)
    }
  }

  if (!on) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900">Insurance claims page</h2>
        <p className="mt-1 text-sm text-gray-500">
          A landing page about the claim rather than about the glass — the full page shell, the
          quote form, the tracked number, at its own address. It is where an &ldquo;insurance&rdquo;
          or &ldquo;ICBC&rdquo; ad group should land: a click on an ad about the claim currently
          arrives on a page that answers it two-thirds of the way down.
        </p>
        {publicInsurer && (
          <p className="mt-2 text-sm text-gray-500">
            This is also where you mark this shop as part of{' '}
            <span className="font-medium text-gray-700">{publicInsurer.short}</span>&rsquo;s repair
            network — add the {publicInsurer.short} page and the tick is inside it. That one tick
            changes the small print under the insurance band on every page of the site, so the
            site cannot claim the network in one place and deny any affiliation in another.
          </p>
        )}
        <button
          type="button"
          onClick={() => setOn(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add one
        </button>
        {done && <p className="mt-3 text-sm text-green-700">{done}</p>}
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">Insurance claims page</h2>
        <p className="mt-1 text-sm text-gray-500">
          Lives at <code className="rounded bg-gray-100 px-1">{path}</code>. Published, it is in
          the sitemap and an ad can point at it; unpublished, that address 404s.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Which page</label>
        <select
          value={key}
          onChange={(e) => setKey(e.target.value as ProgramKey)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {PROGRAM_KEYS.map((k) => (
            <option key={k} value={k}>
              {k === 'general'
                ? 'General insurance claims — any carrier'
                : `${INSURANCE_PROGRAMS[k].short} — ${INSURANCE_PROGRAMS[k].full}`}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-gray-500">
          {program.needsTypedCoverage ? (
            <>
              Nothing here knows what {program.short} covers, so that part is yours to write — and
              the page will not publish until it is written. A named insurer&rsquo;s page also has
              to be <em>about</em> {program.short} for the ad copy naming them to stand on
              anything.
            </>
          ) : (
            <>
              The general page writes itself: its coverage section is the reviewed
              state-by-state deductible copy this site already prints in the insurance band. Steps
              are optional.
            </>
          )}
        </p>
      </div>

      {program.needsTypedCoverage && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            What {program.short} covers
          </label>
          <textarea
            value={coverageNote}
            onChange={(e) => setCoverageNote(e.target.value)}
            rows={4}
            placeholder={`What ${program.short} actually pays for, in your own words.`}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Typed, never drafted. This is a statement about somebody&rsquo;s insurance on a real
            business&rsquo;s website, and it is the one thing on this page a model cannot be a
            source for.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            How the claim works, step by step
          </label>
          <button
            type="button"
            onClick={() => setSteps((s) => [...s, ''])}
            disabled={steps.length >= MAX_STEPS}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add a step
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-xs font-bold text-gray-400">{i + 1}.</span>
              <textarea
                value={step}
                onChange={(e) =>
                  setSteps((s) => s.map((v, j) => (j === i ? e.target.value : v)))
                }
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
                className="mt-1.5 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label={`Remove step ${i + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {steps.length === 0 && (
            <p className="text-xs text-gray-500">
              None yet. Leave it empty and the page skips the section.
            </p>
          )}
        </div>
      </div>

      {/* THE ONE CLAIM ON THIS PAGE THAT § 2 OTHERWISE FORBIDS. It is a tick
          rather than a text box precisely so that it cannot be widened into
          "approved by" or "preferred provider" on the way in. */}
      {program.networkName ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <input
            type="checkbox"
            checked={inNetwork}
            onChange={(e) => setInNetwork(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900">
              This shop is part of {program.networkName}
            </span>
            <span className="mt-1 block text-xs text-gray-600">
              Tick it only if you have checked. The page then says they take part in it — a
              membership fact, never an endorsement — and the small print under the insurance
              band on <em>every</em> page changes to match, because a site that claims the network
              here and says &ldquo;not affiliated with any insurance company&rdquo; there
              contradicts itself in front of the customer.
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          No repair-network claim is available for {program.short}: this platform has not
          confirmed what that network is called, and a membership claim with nothing named is one
          nobody could check. Confirm the name and it goes in the catalogue.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Meta description <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Left empty, one is built from the page."
        />
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {done && (
        <p className="flex items-start gap-1.5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          {done}
        </p>
      )}
      {blocker && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {blocker}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save as draft
        </button>
        <button
          type="button"
          onClick={() => save(true)}
          disabled={busy || !!blocker}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {published ? 'Save and keep live' : 'Save and publish'}
        </button>
        {published && (
          <a
            href={`${siteUrl}${path}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          >
            View the page
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="ml-auto text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          Remove the page
        </button>
      </div>
    </section>
  )
}
