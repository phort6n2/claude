'use client'

import Link from 'next/link'
import { ChevronDown, X } from 'lucide-react'
import { costPerConv, statusLabel, targetAdvice, worstSeverity, type TargetHint, type Totals } from '@/lib/campaign-report'
import { Change, IssueChip, TargetLine, conv, int, money, type AccountView, type Row } from './campaign-report-ui'

/**
 * THE PHONE OVERVIEW: one card per shop, nothing to scroll sideways.
 *
 * The table made a phone scroll in both directions inside a box inside a
 * scrolling page, with the sticky name column cutting the numbers in half —
 * and the four figures that answer "is anything wrong" were off the right
 * edge. So below `sm` each shop is a card with exactly those four (cost,
 * conversions, cost per conversion, clicks) visible at once, and the table
 * stays for wider screens.
 *
 * PROBLEMS ARE NEVER BEHIND A TAP: a marked campaign shows under its card,
 * with the sentence saying why, even when the card is collapsed. Expanding
 * adds the rest of the campaigns, and the controls to isolate the shop.
 */

const FOUR: Array<{ label: string; get: (t: Totals, currency: string) => string; n?: (t: Totals) => number | null }> = [
  { label: 'Cost', get: (t, c) => money(t.costMicros, c, true), n: (t) => t.costMicros },
  { label: 'Conv.', get: (t) => conv(t.conversions), n: (t) => t.conversions },
  {
    label: 'Cost / conv.',
    get: (t, c) => {
      const v = costPerConv(t)
      return v == null ? '—' : money(v, c, true)
    },
    n: (t) => costPerConv(t),
  },
  { label: 'Clicks', get: (t) => int(t.clicks), n: (t) => t.clicks },
]

function Figures({
  t,
  prior,
  currency,
  compare,
  size,
}: {
  t: Totals
  prior?: Totals
  currency: string
  compare: boolean
  size: 'card' | 'row'
}) {
  return (
    <dl className="grid grid-cols-4 gap-2">
      {FOUR.map((f) => {
        const now = f.n?.(t)
        const before = prior ? f.n?.(prior) : null
        return (
          <div key={f.label} className="min-w-0">
            <dt className="text-[11px] text-gray-500">{f.label}</dt>
            <dd
              className={`tabular-nums text-gray-900 ${size === 'card' ? 'text-[15px] font-semibold' : 'text-[13px]'}`}
            >
              {f.get(t, currency)}
            </dd>
            {compare && size === 'card' && now != null && before != null && (
              <dd className="text-[11px]">
                <Change now={now} before={before} />
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}

function CampaignLine({
  r,
  currency,
  showFigures,
  hint,
  account,
}: {
  r: Row
  currency: string
  showFigures: boolean
  hint?: TargetHint
  account: { customerId: string; name: string }
}) {
  const sev = worstSeverity(r.issues)
  return (
    <li
      className={`border-l-[3px] py-2 pl-3 pr-1 ${
        sev === 'bad' ? 'border-red-500' : sev === 'warn' ? 'border-amber-400' : 'border-transparent'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-gray-900" title={r.c.name}>
          {r.c.name}
        </span>
        <span className="shrink-0 text-[11px] text-gray-500">{statusLabel(r.c)}</span>
      </div>
      <TargetLine c={r.c} hint={hint} currency={currency} account={account} />
      {r.issues.length > 0 && (
        <>
          <div className="mt-1 flex flex-wrap gap-1">
            {r.issues.map((i) => (
              <IssueChip key={i.kind} issue={i} />
            ))}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs leading-snug text-gray-700">
            {r.issues.map((i) => (
              <li key={i.kind}>{i.detail}</li>
            ))}
          </ul>
        </>
      )}
      {showFigures && (
        <div className="mt-1.5">
          <Figures t={r.t} currency={currency} compare={false} size="row" />
        </div>
      )}
    </li>
  )
}

export default function CampaignCards({
  accounts,
  onlyIssues,
  expanded,
  onToggle,
  focus,
  onIsolate,
  compare,
  targets,
}: {
  accounts: AccountView[]
  onlyIssues: boolean
  expanded: Set<string>
  onToggle: (customerId: string) => void
  focus: string | null
  onIsolate: (customerId: string | null) => void
  compare: boolean
  /** The Target CPA panel's morning conclusions, by `customerId:campaignId`. */
  targets?: Record<string, TargetHint>
}) {
  if (accounts.length === 0) {
    return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-500">Nothing to show for this period.</p>
  }
  return (
    <ul className="space-y-2">
      {accounts.map((x) => {
        const { a } = x
        const isOpen = expanded.has(a.customerId) || focus === a.customerId
        const hintFor = (r: Row) => targets?.[`${a.customerId}:${r.c.id}`]
        // A target the panel would raise is as worth seeing as a mark, so it
        // shows on a collapsed card too.
        const flaggedRows = x.rows.filter((r) => r.issues.length > 0 || targetAdvice(r.c, hintFor(r)))
        const visible = isOpen && !onlyIssues ? x.rows : flaggedRows
        const listId = `acct-${a.customerId}`
        const pillBad = flaggedRows.some((r) => worstSeverity(r.issues) === 'bad') || x.suspended
        return (
          <li key={a.customerId} id={`card-${a.customerId}`} className="scroll-mt-48 rounded-xl border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => onToggle(a.customerId)}
              aria-expanded={isOpen}
              aria-controls={listId}
              className="flex min-h-11 w-full items-center gap-2 px-3 pt-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900" title={a.name}>
                {a.name}
              </span>
              {x.flagged > 0 && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    pillBad ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                  }`}
                >
                  {x.flagged} {x.flagged === 1 ? 'issue' : 'issues'}
                </span>
              )}
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            <div className="px-3 pb-3">
              {a.error ? (
                <p className="text-xs text-red-700">Could not read this account: {a.error}</p>
              ) : x.suspended ? (
                <p className="text-xs font-medium text-red-700">Account suspended by Google — nothing can serve.</p>
              ) : x.idle ? (
                <p className="text-xs text-gray-500">Nothing running in the last 60 days.</p>
              ) : (
                <>
                  <div className="mt-1">
                    <Figures t={x.total} prior={x.prior} currency={a.currency} compare={compare} size="card" />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {x.budget != null ? `Budget ${money(x.budget, a.currency, true)}/day · ` : ''}
                    {x.rows.length} campaign{x.rows.length === 1 ? '' : 's'}
                  </p>
                </>
              )}

              {visible.length > 0 && (
                <ul id={listId} className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
                  {visible.map((r) => (
                    <CampaignLine key={r.c.id} r={r} currency={a.currency} showFigures={isOpen} hint={hintFor(r)} account={{ customerId: a.customerId, name: a.name }} />
                  ))}
                </ul>
              )}

              {isOpen && (
                <div className="mt-2 flex flex-wrap gap-2 border-t border-gray-100 pt-2">
                  <button
                    type="button"
                    onClick={() => onIsolate(focus === a.customerId ? null : a.customerId)}
                    aria-pressed={focus === a.customerId}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {focus === a.customerId ? (
                      <>
                        <X className="h-4 w-4" aria-hidden /> Show all shops
                      </>
                    ) : (
                      'Only this shop'
                    )}
                  </button>
                  {a.clientId && (
                    <Link
                      href={`/admin/clients/${a.clientId}/advertising`}
                      className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Client page
                    </Link>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
