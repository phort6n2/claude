'use client'

import { useEffect, useState } from 'react'
import { Loader2, ExternalLink, EyeOff, TriangleAlert } from 'lucide-react'
import {
  SITEMAP_GROUPS,
  SITEMAP_GROUP_LABEL,
  type SitemapGroup,
} from '@/lib/sitemap-groups'

/**
 * Every page this site publishes, read from the same function that renders
 * /sitemap.xml — so what an operator reads here is what a crawler is told,
 * with no second implementation to drift.
 *
 * The excluded list is the part worth having. A city page with nothing
 * city-specific written about it is served but carries noindex and stays out
 * of the sitemap; from the outside that is indistinguishable from a bug, and
 * "why isn't that city in Google" has been asked more than once.
 */

interface Entry {
  path: string
  loc: string
  /* IMPORTED, never restated. A hand-written copy of this union is what let a
     new page type be counted in the header and rendered in no group — see
     lib/sitemap-groups.ts. */
  group: SitemapGroup
  lastmod: string
}

interface Excluded {
  path: string
  group: string
  reason: string
}

export default function SitePagesCard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<{
    ok: boolean
    entries: Entry[]
    excluded: Excluded[]
    canonicalHost: string | null
    sitemapUrl: string | null
    note: string | null
  } | null>(null)

  useEffect(() => {
    fetch(`/api/clients/${clientId}/site-map`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
  }, [clientId])

  if (!data) {
    return (
      <div className="px-6 pb-5 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the sitemap…
      </div>
    )
  }

  const groups = SITEMAP_GROUPS.map((g) => ({
    group: g,
    rows: data.entries.filter((e) => e.group === g),
  })).filter((g) => g.rows.length > 0)
  /* A ROW IN NO GROUP IS THE BUG THIS CARD HAD, so it is now visible rather
     than dropped: the header counts every entry, and anything the list above
     did not place would otherwise vanish between the two. It should always be
     empty — the union makes that so — and if it ever is not, the operator
     sees the page instead of a count that does not add up. */
  const ungrouped = data.entries.filter(
    (e) => !SITEMAP_GROUPS.includes(e.group as SitemapGroup)
  )

  return (
    <div className="px-6 pb-5 space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-gray-700">
          <strong>{data.entries.length}</strong> page{data.entries.length === 1 ? '' : 's'} listed
        </span>
        {data.sitemapUrl && (
          <a
            href={data.sitemapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-700 font-medium hover:underline"
          >
            Open sitemap.xml <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {data.note && (
        <p className="text-sm text-amber-800 flex items-start gap-1.5">
          <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{data.note}</span>
        </p>
      )}

      {ungrouped.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Not in any group{' '}
            <span className="font-normal normal-case tracking-normal">({ungrouped.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-amber-800">
            These are in the sitemap and this card does not know what to call them. Add the group
            to <code>lib/sitemap-groups.ts</code>.
          </p>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {ungrouped.map((e) => (
              <li key={e.path} className="min-w-0 truncate text-sm text-amber-900">
                {e.path}
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map(({ group, rows }) => (
        <div key={group}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {SITEMAP_GROUP_LABEL[group]}{' '}
            <span className="font-normal normal-case tracking-normal">({rows.length})</span>
          </h3>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((e) => (
              <li key={e.path} className="min-w-0">
                <a
                  href={e.loc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-gray-700 hover:text-blue-700 hover:underline"
                  title={e.loc}
                >
                  {e.path}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {data.excluded.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <EyeOff className="h-3.5 w-3.5" />
            Served, but left out of the sitemap ({data.excluded.length})
          </h3>
          {/* Grouped by reason. Printed per row, ten city pages repeated one
              identical sentence ten times and buried the two held pages under
              it. */}
          <ul className="mt-1.5 space-y-2">
            {[...new Set(data.excluded.map((e) => e.reason))].map((reason) => (
              <li key={reason} className="text-sm">
                <p className="text-gray-600 m-0">{reason}</p>
                <p className="mt-0.5 m-0 font-mono text-xs text-gray-800 break-words">
                  {data.excluded
                    .filter((e) => e.reason === reason)
                    .map((e) => e.path)
                    .join('  ·  ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
