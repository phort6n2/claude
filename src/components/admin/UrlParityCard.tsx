'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Loader2, TriangleAlert, CircleCheck } from 'lucide-react'

/**
 * What a domain cutover would break — and the two ways to stop it breaking.
 *
 * The report is the first half: addresses on the old site with nowhere
 * sensible to go. The second half is doing something about each one, and
 * there are exactly two honest answers:
 *
 * - REDIRECT it, when the new site already covers the subject. One page, one
 *   address, the ranking follows.
 * - KEEP it, when the old page said something the new site does not. The copy
 *   is pulled across as a starting point and the address survives.
 *
 * A kept page is HELD until somebody publishes it. It is another company's
 * writing about a real business and it can carry claims this platform would
 * not make on a shop's behalf — a timing promise, a deductible offer, an
 * insurer's name. Publishing is a person reading it, not a checkbox.
 */

interface Mapping {
  from: string
  to: string | null
  kind: 'exact' | 'strong' | 'weak' | 'none'
  reason: string
}

interface Redirect {
  fromPath: string
  toPath: string
}

interface KeptSection {
  index: number
  heading: string
  chars: number
  duplicates: string | null
  issues: Array<{ kind: string; detail: string }>
}

interface KeptPage {
  id: string
  path: string
  title: string
  navLabel: string | null
  sections: KeptSection[]
  metaDescription: string | null
  bodyHtml: string | null
  publishedAt: string | null
  sourceUrl: string | null
}

const KIND_LABEL: Record<Mapping['kind'], string> = {
  exact: 'Already exists',
  strong: 'Clear match',
  weak: 'Check this',
  none: 'Nowhere to go',
}

export default function UrlParityCard({
  clientId,
  defaultUrl,
}: {
  clientId: string
  defaultUrl: string | null
}) {
  const [url, setUrl] = useState(defaultUrl || '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [showAll, setShowAll] = useState(false)
  /** The site the report was actually run against — the source for captures. */
  const [checked, setChecked] = useState<string | null>(null)

  const [redirects, setRedirects] = useState<Redirect[]>([])
  const [pages, setPages] = useState<KeptPage[]>([])
  /** Per-row destination overrides, keyed by old path. */
  const [dest, setDest] = useState<Record<string, string>>({})
  /** Which row is mid-request. */
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [rowNote, setRowNote] = useState<Record<string, string>>({})
  /** Which kept page is open for reading. */
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, { title: string; label: string; body: string }>>({})

  const loadSetups = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/cutover`)
      const data = await res.json().catch(() => ({}))
      setRedirects(Array.isArray(data.redirects) ? data.redirects : [])
      setPages(Array.isArray(data.pages) ? data.pages : [])
    } catch {
      // A card that cannot read its own state is not worth an error banner —
      // the buttons still work and the next action reloads it.
    }
  }, [clientId])

  useEffect(() => {
    loadSetups()
  }, [loadSetups])

  async function run() {
    setBusy(true)
    setMessage(null)
    setOk(null)
    setMappings([])
    try {
      const res = await fetch(`/api/clients/${clientId}/url-parity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      setMappings(Array.isArray(data.mappings) ? data.mappings : [])
      setChecked(typeof data.checked === 'string' ? data.checked : null)
      setMessage(data.message || 'Done.')
      setOk(!!data.ok)
    } catch {
      setMessage('Could not reach that site.')
      setOk(false)
    } finally {
      setBusy(false)
    }
  }

  async function act(from: string, action: string, extra: Record<string, unknown> = {}) {
    setRowBusy(from)
    setRowNote((n) => ({ ...n, [from]: '' }))
    try {
      const res = await fetch(`/api/clients/${clientId}/cutover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, from, ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      setRowNote((n) => ({ ...n, [from]: data.message || data.error || 'Done.' }))
      // A trim rewrites the body server-side, so the draft this card is
      // holding is now the pre-trim copy. Leaving it would put the removed
      // sections straight back on the next Save.
      if (action === 'trim') {
        setDraft((d) => {
          const next = { ...d }
          delete next[from]
          return next
        })
      }
      await loadSetups()
    } catch {
      setRowNote((n) => ({ ...n, [from]: 'That did not go through.' }))
    } finally {
      setRowBusy(null)
    }
  }

  /** Build the old page's full address so its copy can be pulled across. */
  function sourceFor(from: string): string | undefined {
    const base = checked || url
    if (!base) return undefined
    try {
      return new URL(from, base.startsWith('http') ? base : `https://${base}`).toString()
    } catch {
      return undefined
    }
  }

  const problems = mappings.filter((m) => m.kind === 'none' || m.kind === 'weak')
  const shown = showAll ? mappings : problems

  const redirectFor = (path: string) => redirects.find((r) => r.fromPath === path)
  const pageFor = (path: string) => pages.find((p) => p.path === path)

  /** Rows already decided but no longer in the report (or before one is run). */
  const decidedOutsideReport = [
    ...redirects.filter((r) => !mappings.some((m) => m.from === r.fromPath)).map((r) => r.fromPath),
    ...pages.filter((p) => !mappings.some((m) => m.from === p.path)).map((p) => p.path),
  ]

  function Controls({ from, suggested }: { from: string; suggested: string | null }) {
    const redirect = redirectFor(from)
    const page = pageFor(from)
    const working = rowBusy === from
    const value = dest[from] ?? redirect?.toPath ?? suggested ?? '/'

    return (
      <div className="space-y-1.5">
        {page ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                page.publishedAt ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
              }`}
            >
              {page.publishedAt ? 'Page live' : 'Page held'}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft((d) =>
                  d[from]
                    ? d
                    : {
                        ...d,
                        [from]: {
                          title: page.title,
                          label: page.navLabel || '',
                          body: page.bodyHtml || '',
                        },
                      }
                )
                setOpen(open === from ? null : from)
              }}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              {open === from ? 'Close' : 'Read / edit'}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => act(from, page.publishedAt ? 'unpublish' : 'publish')}
              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              {page.publishedAt ? 'Unpublish' : 'Publish'}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => act(from, 'remove')}
              className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="text"
              value={value}
              onChange={(e) => setDest((d) => ({ ...d, [from]: e.target.value }))}
              className="w-40 border border-gray-300 rounded px-2 py-1 font-mono text-xs"
              aria-label={`Where ${from} should go`}
            />
            <button
              type="button"
              disabled={working}
              onClick={() => act(from, 'redirect', { to: value })}
              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              {redirect ? 'Update redirect' : 'Redirect'}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => {
                const src = sourceFor(from)
                act(from, 'page', src ? { sourceUrl: src } : {})
              }}
              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              Build page
            </button>
            {redirect && (
              <button
                type="button"
                disabled={working}
                onClick={() => act(from, 'remove')}
                className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {redirect && !page && (
          <p className="text-xs text-gray-500 font-mono break-all">
            → {redirect.toPath} (permanent)
          </p>
        )}

        {page && open === from && (
          <div className="mt-2 space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
            {page.sourceUrl && (
              <p className="text-xs text-gray-500 break-all">
                Pulled from{' '}
                <a
                  href={page.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline"
                >
                  {page.sourceUrl}
                </a>
              </p>
            )}
            <input
              type="text"
              value={draft[from]?.title ?? page.title}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [from]: {
                    title: e.target.value,
                    label: d[from]?.label ?? page.navLabel ?? '',
                    body: d[from]?.body ?? page.bodyHtml ?? '',
                  },
                }))
              }
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
              aria-label="Page title"
            />
            {page.sections?.length > 0 && (
              <div className="border border-gray-200 rounded bg-white p-2.5">
                <p className="text-xs font-semibold text-gray-900">
                  What is on this page ({page.sections.length} section
                  {page.sections.length === 1 ? '' : 's'})
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Anything marked below is already said further down the page by the site
                  itself. Removing it shortens the page without losing anything a visitor
                  would miss.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {page.sections.map((sec) => (
                    <li key={sec.index} className="flex items-start gap-2 text-xs">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => act(from, 'trim', { drop: [sec.index] })}
                        className="shrink-0 font-semibold text-red-700 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <span className="min-w-0">
                        <span className="text-gray-900">{sec.heading}</span>{' '}
                        <span className="text-gray-400">{sec.chars} chars</span>
                        {sec.duplicates && (
                          <span className="ml-1.5 inline-block bg-amber-50 text-amber-800 rounded px-1 py-0.5 text-[10px] font-semibold">
                            repeats {sec.duplicates}
                          </span>
                        )}
                        {sec.issues.map((iss) => (
                          <span
                            key={iss.kind}
                            className="ml-1.5 inline-block bg-red-50 text-red-700 rounded px-1 py-0.5 text-[10px] font-semibold"
                            title={iss.detail}
                          >
                            {iss.kind === 'rating' ? 'states a rating' : 'has a phone number'}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                {page.sections.some((sec) => sec.duplicates) && (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() =>
                      act(from, 'trim', {
                        drop: page.sections.filter((sec) => sec.duplicates).map((sec) => sec.index),
                      })
                    }
                    className="mt-2 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Remove all {page.sections.filter((sec) => sec.duplicates).length} that repeat
                    the site
                  </button>
                )}
              </div>
            )}

            <label className="block text-xs text-gray-600">
              Footer menu label
              <input
                type="text"
                value={draft[from]?.label ?? page.navLabel ?? ''}
                placeholder="Left blank, shortened from the title automatically"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [from]: {
                      title: d[from]?.title ?? page.title,
                      label: e.target.value,
                      body: d[from]?.body ?? page.bodyHtml ?? '',
                    },
                  }))
                }
                className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
            <textarea
              value={draft[from]?.body ?? page.bodyHtml ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [from]: {
                    title: d[from]?.title ?? page.title,
                    label: d[from]?.label ?? page.navLabel ?? '',
                    body: e.target.value,
                  },
                }))
              }
              rows={14}
              spellCheck={false}
              className="w-full border border-gray-300 rounded px-2 py-1 font-mono text-xs"
              aria-label="Page content"
            />
            <p className="text-xs text-gray-500">
              Headings, paragraphs and lists. Anything else is stripped when the page renders.
            </p>
            <button
              type="button"
              disabled={working}
              onClick={() =>
                act(from, 'edit', {
                  title: draft[from]?.title ?? page.title,
                  navLabel: draft[from]?.label ?? page.navLabel ?? '',
                  bodyHtml: draft[from]?.body ?? page.bodyHtml ?? '',
                })
              }
              className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
        {working && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
        {rowNote[from] && <p className="text-xs text-gray-600">{rowNote[from]}</p>}
      </div>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <h2 className="font-semibold text-gray-900">Check the old site&apos;s addresses</h2>
      <p className="mt-1 text-sm text-gray-600 max-w-prose">
        Before pointing a domain here, read the old site and work out where each of its pages
        should land. Then either send the address somewhere on the new site, or keep the page at
        its own address and pull the old copy across.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://theiroldsite.com"
          className="flex-1 min-w-[260px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check addresses'}
        </Button>
      </div>

      {message && (
        <p
          className={`mt-3 text-sm flex items-start gap-1.5 ${
            ok === false ? 'text-red-700' : 'text-gray-700'
          }`}
        >
          {ok && <CircleCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />}
          <span>{message}</span>
        </p>
      )}

      {mappings.length > 0 && (
        <>
          {problems.length === 0 && !showAll && (
            <p className="mt-4 text-sm text-green-700 flex items-start gap-1.5">
              <CircleCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Every address on the old site has a clear home. Nothing needs a decision.</span>
            </p>
          )}

          {shown.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[46rem]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-3 font-semibold">Old address</th>
                    <th className="py-2 pr-3 font-semibold">Suggestion</th>
                    <th className="py-2 font-semibold">Decide</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.from} className="border-b border-gray-100 last:border-0 align-top">
                      <td className="py-2 pr-3 font-mono text-xs text-gray-900 break-all">{m.from}</td>
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs text-gray-900 break-all">
                          {m.to || '—'}
                        </span>
                        <span
                          className={`ml-2 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            m.kind === 'none'
                              ? 'bg-red-50 text-red-700'
                              : m.kind === 'weak'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {KIND_LABEL[m.kind]}
                        </span>
                        <p className="mt-1 text-xs text-gray-600">{m.reason}</p>
                      </td>
                      <td className="py-2">
                        {m.kind === 'exact' ? (
                          <span className="text-xs text-gray-500">
                            Nothing to do — that address already answers.
                          </span>
                        ) : (
                          <Controls from={m.from} suggested={m.to} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="mt-3 text-sm font-semibold text-blue-700 hover:underline"
          >
            {showAll
              ? `Show only the ${problems.length} needing a decision`
              : `Show all ${mappings.length} addresses`}
          </button>
        </>
      )}

      {decidedOutsideReport.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Already set up
          </h3>
          <p className="mt-1 text-xs text-gray-600 max-w-prose">
            Addresses this shop is already handling. They stay in effect whether or not you run
            the check again.
          </p>
          <div className="mt-3 space-y-3">
            {decidedOutsideReport.map((path) => (
              <div key={path} className="flex flex-col gap-1">
                <span className="font-mono text-xs text-gray-900 break-all">{path}</span>
                <Controls from={path} suggested={redirectFor(path)?.toPath ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500 max-w-prose flex items-start gap-1.5">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Redirects and kept pages only answer once the domain is pointed at this app. A page
          built from the old site is <strong>held until you publish it</strong> — read it first;
          it is someone else&apos;s copy and can carry claims this platform would not make on the
          shop&apos;s behalf.
        </span>
      </p>
    </section>
  )
}
