'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Minus, TriangleAlert, ArrowRight, AlertCircle } from 'lucide-react'
import type { ClientHealthRow, HealthCell, HealthColumn, HealthColumnId } from '@/lib/client-health'
import { CELL_WEIGHT } from '@/lib/client-health'
import { fixActionFor, DISMISS_MEANING } from '@/lib/finding-actions'
import { errorFrom } from '@/lib/http-error'

/**
 * THE WHOLE BOOK, ONE ROW EACH, AND A CROSS MEANS SOMEBODY HAS TO DO SOMETHING.
 *
 * Read left to right a row says whether that shop is getting what they pay
 * for; read top to bottom a column says whether one thing is broken across the
 * platform, which is the shape most of this app's real failures had — the
 * `<Dial record>` typo and the Twilio namespace import were every client at
 * once, and both went unnoticed for weeks because nothing ever looked at all
 * fifteen together.
 *
 * WHY A CELL IS CLICKABLE RATHER THAN A TOOLTIP. A tick needs no explanation;
 * a cross does, and the explanation is a sentence, not a word. Hover is not
 * available on the phone this gets read on at 9pm, so the detail opens on tap
 * and stays open — the row underneath it, full width, where it can be read
 * rather than squinted at.
 */

const CELL_STYLES = {
  ok: 'text-green-600',
  bad: 'text-red-600',
  warn: 'text-amber-600',
  na: 'text-gray-300',
} as const

function CellMark({ cell }: { cell: HealthCell }) {
  if (cell.state === 'ok') return <Check className="h-[18px] w-[18px]" strokeWidth={3} />
  if (cell.state === 'na') return <Minus className="h-[18px] w-[18px]" strokeWidth={3} />
  if (cell.state === 'warn') return <TriangleAlert className="h-[17px] w-[17px]" strokeWidth={2.5} />
  return <X className="h-[18px] w-[18px]" strokeWidth={3} />
}

export default function ClientHealthTable({
  rows,
  columns,
}: {
  rows: ClientHealthRow[]
  columns: HealthColumn[]
}) {
  // One open cell at a time, keyed by row+column. A board with six
  // explanations unfolded is a board you have to scroll to read.
  const [open, setOpen] = useState<string | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)
  /* Dismissals are held here rather than re-fetched. Pressing Dismiss on six
     findings in a row should feel like crossing things off, not like six page
     loads — the same reason the autosaving cards flip their state first and
     reconcile after. A failure puts the row back and says why. */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function dismiss(findingId: string) {
    setBusy(findingId)
    setError(null)
    setDismissed((s) => new Set(s).add(findingId))
    try {
      const res = await fetch(`/api/admin/ads-findings/${findingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
    } catch (err) {
      // Put it back. A finding that looks cleared but is not is worse than
      // one that never went away, because nobody looks at it again.
      setDismissed((s) => {
        const next = new Set(s)
        next.delete(findingId)
        return next
      })
      setError(err instanceof Error ? err.message : 'Could not dismiss that one')
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        No clients yet.
      </div>
    )
  }

  /* THE CELL HAS TO MOVE WHEN YOU CLEAR THE LAST ONE. Dismissing every
     finding and watching the cross sit there is the moment somebody decides
     the button did not work and presses it again. Recomputed from the same
     dismissed set the panel filters on, so the mark, the badge, the tally and
     the summary can never disagree with the list underneath them. */
  const liveCell = (r: ClientHealthRow, id: HealthColumnId): HealthCell => {
    if (id !== 'findings') return r.cells[id]
    const left = r.findings.filter((f) => !dismissed.has(f.id))
    if (r.cells.findings.state === 'na' || r.cells.findings.state === 'warn' && r.findings.length === 0)
      return r.cells.findings
    if (left.length === 0) return { state: 'ok', detail: '' }
    const alerts = left.filter((f) => f.severity === 'ALERT').length
    return {
      state: alerts > 0 ? 'bad' : 'warn',
      detail: alerts > 0 ? `${alerts} alert${alerts === 1 ? '' : 's'} of ${left.length} open.` : `${left.length} open to review.`,
      badge: String(left.length),
    }
  }
  const liveScore = (r: ClientHealthRow) =>
    columns.reduce((n, c) => n + CELL_WEIGHT[liveCell(r, c.id).state], 0)

  const needing = rows.filter((r) => liveScore(r) > 0)
  const problems = needing.length
  const shown = onlyProblems ? needing : rows

  /* HOW MANY CLIENTS ARE RED IN EACH COLUMN — the payoff for reading DOWN.
     The `<Dial record>` typo and the Twilio namespace import were not one
     client having a bad day, they were every client at once, and the tell is
     a column that is red all the way down rather than a row that is. With the
     table locked to alphabetical order this tally is also what finds the
     trouble, so it has to be visible without scrolling. */
  const tally = new Map<string, { bad: number; warn: number }>()
  for (const col of columns) {
    const bad = rows.filter((r) => liveCell(r, col.id).state === 'bad').length
    const warn = rows.filter((r) => liveCell(r, col.id).state === 'warn').length
    tally.set(col.id, { bad, warn })
  }
  const openPanel = (() => {
    if (!open) return null
    const [rowId, colId] = open.split(':')
    const row = rows.find((r) => r.id === rowId)
    const column = columns.find((c) => c.id === colId)
    return row && column ? { row, column } : null
  })()

  const worst = columns
    .map((c) => ({ col: c, ...tally.get(c.id)! }))
    .filter((t) => t.bad >= 2)
    .sort((a, b) => b.bad - a.bad)[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-600">
        <span className="font-medium text-gray-900">
          {problems === 0
            ? `All ${rows.length} clients clear.`
            : `${problems} of ${rows.length} need something.`}
        </span>
        {problems > 0 && (
          <button
            type="button"
            onClick={() => setOnlyProblems((v) => !v)}
            className={`rounded-md border px-2 py-1 font-medium ${
              onlyProblems
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {onlyProblems ? `Showing ${problems} — show all` : 'Only those needing something'}
          </button>
        )}
        <Legend icon={<Check className="h-3.5 w-3.5 text-green-600" strokeWidth={3} />} text="Working" />
        <Legend icon={<X className="h-3.5 w-3.5 text-red-600" strokeWidth={3} />} text="Broken — act" />
        <Legend icon={<TriangleAlert className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />} text="Worth a look" />
        <Legend
          icon={<Minus className="h-3.5 w-3.5 text-gray-300" strokeWidth={3} />}
          text="Doesn't apply"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Its OWN scroll box, never the page's. Eight columns plus a name do not
          fit a phone, and a table that takes the whole page sideways is the
          bug AdminShell's min-w-0 note records. */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Client
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  // The full sentence on hover for a mouse; the tap target
                  // below carries it for everyone else.
                  title={`${col.label} — ${col.meaning}`}
                  className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  {col.short}
                  {/* The count sits under the heading rather than in a footer
                      row: a tally you have to scroll past fifteen clients to
                      reach is one nobody reads. */}
                  <span className="mt-0.5 block text-[11px] font-bold normal-case tracking-normal">
                    {tally.get(col.id)!.bad > 0 ? (
                      <span className="text-red-600">{tally.get(col.id)!.bad}</span>
                    ) : tally.get(col.id)!.warn > 0 ? (
                      <span className="text-amber-600">{tally.get(col.id)!.warn}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              return (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 align-middle">
                  <td className="px-4 py-2">
                    <Link
                      href={row.href}
                      className="font-medium text-gray-900 hover:text-blue-700 hover:underline"
                    >
                      {row.businessName}
                    </Link>
                    {row.status !== 'ACTIVE' && (
                      <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        {row.status}
                      </span>
                    )}

                  </td>
                  {columns.map((col) => {
                    const cell = liveCell(row, col.id)
                    const key = `${row.id}:${col.id}`
                    return (
                      <td key={col.id} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setOpen(open === key ? null : key)}
                          aria-label={`${col.label} for ${row.businessName}: ${cell.state}`}
                          aria-expanded={open === key}
                          /* The count sits BESIDE the mark, not on it. As a
                             bubble pinned to the corner it overlapped the
                             row rule and the cell edge, and a number half
                             over a border is the one thing on this board
                             that has to be read at a glance. */
                          className={`mx-auto inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-1.5 hover:bg-gray-100 ${
                            CELL_STYLES[cell.state]
                          } ${open === key ? 'bg-gray-100 ring-1 ring-gray-300' : ''}`}
                        >
                          <CellMark cell={cell} />
                          {cell.badge && (
                            <span className="text-[11px] font-bold tabular-nums leading-none">
                              {cell.badge}
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {openPanel && (
        /* OUTSIDE the horizontally-scrolling table, deliberately. It used to
           open inside the client's name cell, which reads well on a desktop
           and is unusable on a phone: eleven columns do not fit, so tapping
           the Action mark means the table is scrolled right and the panel is
           sitting off-screen to the LEFT behind a tall empty row. Below the
           table it is visible wherever the columns happen to be scrolled to,
           so it names its client and column instead of relying on being next
           to them. */
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold text-gray-900">
              {openPanel.row.businessName}
              <span className="text-gray-400"> · </span>
              {openPanel.column.label}
            </p>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="-m-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
          <CellPanel
            column={openPanel.column}
            row={openPanel.row}
            cell={liveCell(openPanel.row, openPanel.column.id)}
            dismissed={dismissed}
            onDismiss={dismiss}
            busy={busy}
          />
        </div>
      )}

      {/* A column red most of the way down is one BROKEN THING, not several
          broken shops — which is the shape the `<Dial record>` typo and the
          Twilio import both had, and neither was noticed for weeks. */}
      {worst && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">{worst.bad} clients</span> are failing the same check —{' '}
          <span className="font-semibold">{worst.col.label}</span>. That is usually one thing
          wrong on this side rather than {worst.bad} shops having the same bad week.
        </p>
      )}

      <p className="text-xs text-gray-500">
        The number under each heading is how many clients that column is red for. Tap any mark to
        read what it means. Column headings:{' '}
        {columns.map((c, i) => (
          <span key={c.id}>
            {i > 0 && ' · '}
            <span className="font-medium text-gray-700">{c.short}</span> = {c.label}
          </span>
        ))}
        .
      </p>
    </div>
  )
}

/**
 * What opens under a client's name when a mark is tapped.
 *
 * TWO COLUMNS ARE A LIST OF THINGS TO DO rather than a sentence, because they
 * already hold one: every open finding knows the screen that changes the fact
 * it was filed on, and every outstanding readiness check carries the tab that
 * satisfies it. Reading "3 required checks outstanding: Logo, Google reviews
 * connected, Leads reach the shop" and then hunting three tabs by hand is work
 * the row already had the answers for.
 *
 * NOTHING HERE CLAIMS TO FIX ANYTHING. "Fix" navigates; "Dismiss" writes the
 * one state that exists. See finding-actions.ts for why there is no third
 * button.
 */
function CellPanel({
  column,
  row,
  cell,
  dismissed,
  onDismiss,
  busy,
}: {
  column: HealthColumn
  row: ClientHealthRow
  cell: HealthCell
  dismissed: Set<string>
  onDismiss: (id: string) => void
  busy: string | null
}) {
  const findings = row.findings.filter((f) => !dismissed.has(f.id))

  if (column.id === 'findings' && findings.length > 0) {
    return (
      <div className="mt-2 max-w-[62ch] space-y-2">
        {findings.map((f) => {
          const action = fixActionFor(f.check, row.id)
          return (
            <div key={f.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    f.severity === 'ALERT' ? 'bg-red-600' : 'bg-amber-500'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{f.detail}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-4">
                <Link
                  href={action.href}
                  title={action.hint}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-black"
                >
                  {action.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => onDismiss(f.id)}
                  disabled={busy === f.id}
                  title={DISMISS_MEANING}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === f.id ? 'Dismissing…' : 'Dismiss'}
                </button>
              </div>
            </div>
          )
        })}
        <p className="text-[11px] leading-relaxed text-gray-500">{DISMISS_MEANING}</p>
      </div>
    )
  }

  if (column.id === 'setup' && row.todo.length > 0) {
    return (
      <div className="mt-2 max-w-[62ch] space-y-1.5">
        {row.todo.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 hover:border-gray-300 hover:bg-white"
          >
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-gray-900">{t.label}</span>
              <span className="block text-xs leading-relaxed text-gray-600">{t.detail}</span>
            </span>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-gray-600">
      <span className="font-semibold text-gray-900">{column.label}:</span>{' '}
      {cell.detail || column.meaning}
    </p>
  )
}

function Legend({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  )
}
