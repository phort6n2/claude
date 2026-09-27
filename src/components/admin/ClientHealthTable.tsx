'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ClientLogoTile from '@/components/ui/ClientLogoTile'
import {
  Check,
  X,
  TriangleAlert,
  ArrowRight,
  AlertCircle,
  ClipboardCheck,
  Globe,
  Inbox,
  PhoneCall,
  Mic,
  MessageSquare,
  Target,
  MapPin,
  FileText,
  Bell,
  type LucideIcon,
} from 'lucide-react'
import type { ClientHealthRow, HealthCell, HealthColumn, HealthColumnId } from '@/lib/client-health'
import { CELL_WEIGHT } from '@/lib/client-health'
import { fixActionFor, DISMISS_MEANING } from '@/lib/finding-actions'
import { PREMISES_COPY_CHECK } from '@/lib/premises-copy-health'
import PremisesFixButton from '@/components/admin/PremisesFixButton'
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

/* LOUD WHERE IT MATTERS, QUIET WHERE IT DOES NOT. Every mark used to be the
   same bare glyph at the same weight, so a board of ninety cells with nine
   crosses read as ninety things to look at. A problem is now a solid dot and a
   working check a pale one, so the eye lands on the reds before it has read a
   single column heading — the whole point of laying fifteen shops side by
   side. A dash is the faintest thing on the board because it is not a state
   anybody acts on. */
function CellMark({ cell }: { cell: HealthCell }) {
  if (cell.state === 'ok')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    )
  if (cell.state === 'na') return <span className="block h-1.5 w-1.5 rounded-full bg-gray-200" />
  if (cell.state === 'warn')
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-300">
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    )
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-sm shadow-red-600/30">
      <X className="h-3.5 w-3.5" strokeWidth={3} />
    </span>
  )
}

/** A glyph per column, so a heading is recognised before it is read. */
const COLUMN_ICONS: Record<HealthColumnId, LucideIcon> = {
  setup: ClipboardCheck,
  site: Globe,
  leads: Inbox,
  calls: PhoneCall,
  recording: Mic,
  sms: MessageSquare,
  ads: Target,
  rank: MapPin,
  report: FileText,
  findings: Bell,
}

/** The row's left edge and status line take the colour of its worst cell. */
const ROW_ACCENT = {
  bad: 'before:bg-red-500',
  warn: 'before:bg-amber-400',
  ok: 'before:bg-emerald-400',
} as const

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

  /* THE BOOK AT A GLANCE, before any row is read: how many shops are clean,
     how many have something broken, how many only want a look — and one bar
     for every applicable check across all of them. Counted from the same live
     cells the table draws, so a dismissal moves the tiles too. */
  const worstOf = (r: ClientHealthRow): 'bad' | 'warn' | 'ok' => {
    const states = columns.map((c) => liveCell(r, c.id).state)
    return states.includes('bad') ? 'bad' : states.includes('warn') ? 'warn' : 'ok'
  }
  const brokenRows = rows.filter((r) => worstOf(r) === 'bad').length
  const lookRows = rows.filter((r) => worstOf(r) === 'warn').length
  const clearRows = rows.length - brokenRows - lookRows
  const cellCounts = { ok: 0, warn: 0, bad: 0 }
  for (const r of rows)
    for (const c of columns) {
      const st = liveCell(r, c.id).state
      if (st !== 'na') cellCounts[st]++
    }
  const applicable = cellCounts.ok + cellCounts.warn + cellCounts.bad || 1
  const openCol = openPanel?.column.id ?? null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Clients" value={rows.length} tone="neutral" />
        <SummaryTile label="All clear" value={clearRows} tone="ok" />
        <SummaryTile label="Something broken" value={brokenRows} tone="bad" />
        <SummaryTile label="Worth a look" value={lookRows} tone="warn" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-gray-900">
            {Math.round((cellCounts.ok / applicable) * 100)}% of checks passing
            <span className="ml-2 font-normal text-gray-500">
              {cellCounts.ok} working · {cellCounts.bad} broken · {cellCounts.warn} to check
            </span>
          </p>
          {problems > 0 && (
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setOnlyProblems(false)}
                className={`rounded-md px-2.5 py-1 ${!onlyProblems ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                All {rows.length}
              </button>
              <button
                type="button"
                onClick={() => setOnlyProblems(true)}
                className={`rounded-md px-2.5 py-1 ${onlyProblems ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                Needing something ({problems})
              </button>
            </div>
          )}
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
          <div className="bg-emerald-500" style={{ width: `${(cellCounts.ok / applicable) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${(cellCounts.warn / applicable) * 100}%` }} />
          <div className="bg-red-500" style={{ width: `${(cellCounts.bad / applicable) * 100}%` }} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Its OWN scroll box, never the page's. Eight columns plus a name do not
          fit a phone, and a table that takes the whole page sideways is the
          bug AdminShell's min-w-0 note records. The client column is STICKY,
          so a row scrolled to its Action mark still says whose it is. */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Client
              </th>
              {columns.map((col) => {
                const Icon = COLUMN_ICONS[col.id]
                const t = tally.get(col.id)!
                return (
                  <th
                    key={col.id}
                    // The full sentence on hover for a mouse; the tap target
                    // below carries it for everyone else.
                    title={`${col.label} — ${col.meaning}`}
                    className={`px-1.5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 ${
                      openCol === col.id ? 'bg-gray-100' : ''
                    }`}
                  >
                    <Icon className="mx-auto mb-1 h-4 w-4 text-gray-400" strokeWidth={2} />
                    {col.short}
                    {/* The count sits under the heading rather than in a footer
                        row: a tally you have to scroll past fifteen clients to
                        reach is one nobody reads. */}
                    <span className="mt-1 flex h-5 justify-center normal-case tracking-normal">
                      {t.bad > 0 ? (
                        <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                          {t.bad}
                        </span>
                      ) : t.warn > 0 ? (
                        <span className="min-w-5 rounded-full bg-amber-100 px-1.5 text-[11px] font-bold leading-5 text-amber-800">
                          {t.warn}
                        </span>
                      ) : (
                        <span className="self-center h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const worstState = worstOf(row)
              const broken = columns.filter((c) => liveCell(row, c.id).state === 'bad').length
              const looks = columns.filter((c) => liveCell(row, c.id).state === 'warn').length
              return (
                <tr
                  key={row.id}
                  className="group border-b border-gray-100 last:border-0 align-middle hover:bg-gray-50/70"
                >
                  <td
                    className={`sticky left-0 z-10 bg-white px-4 py-2.5 group-hover:bg-gray-50 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full ${ROW_ACCENT[worstState]}`}
                  >
                    <div className="flex items-center gap-3">
                      <ClientLogoTile
                        logoUrl={row.logoUrl}
                        businessName={row.businessName}
                        primaryColor={row.primaryColor}
                        onDark={row.logoOnDark}
                      />
                      {/* CAPPED ON A PHONE. The column is pinned, and pinned at
                          full width it covered the whole screen, so scrolling
                          sideways moved marks nobody could see. */}
                      <div className="min-w-0 max-w-[8.5rem] sm:max-w-none">
                        <div className="flex items-center gap-2">
                          <Link
                            href={row.href}
                            className="truncate font-semibold text-gray-900 hover:text-blue-700 hover:underline"
                          >
                            {row.businessName}
                          </Link>
                          {row.status !== 'ACTIVE' && (
                            <span className="hidden sm:inline rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              {row.status}
                            </span>
                          )}
                        </div>
                        {/* The row's verdict in words, so nobody has to count
                            marks along a line to know whether to open it. */}
                        <p
                          className={`truncate text-xs ${
                            worstState === 'bad'
                              ? 'text-red-700'
                              : worstState === 'warn'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {broken === 0 && looks === 0
                            ? 'All clear'
                            : [broken && `${broken} broken`, looks && `${looks} to check`]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                      </div>
                    </div>
                  </td>
                  {columns.map((col) => {
                    const cell = liveCell(row, col.id)
                    const key = `${row.id}:${col.id}`
                    return (
                      <td
                        key={col.id}
                        className={`px-1.5 py-2.5 text-center ${openCol === col.id ? 'bg-gray-50' : ''}`}
                      >
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
                          className={`mx-auto inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-1.5 transition-colors hover:bg-gray-100 ${
                            open === key ? 'bg-white ring-2 ring-gray-900' : ''
                          }`}
                        >
                          <CellMark cell={cell} />
                          {cell.badge && (
                            <span
                              className={`text-[11px] font-bold tabular-nums leading-none ${
                                cell.state === 'bad'
                                  ? 'text-red-700'
                                  : cell.state === 'warn'
                                    ? 'text-amber-700'
                                    : 'text-gray-500'
                              }`}
                            >
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
        Red is broken and needs doing, amber is worth a look, a pale tick is working and a grey
        dot means the check does not apply to that client. The number under each heading is how
        many clients that column is red for. Tap any mark to read what it means. Column headings:{' '}
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
                {f.check === PREMISES_COPY_CHECK && (
                  <PremisesFixButton clientId={row.id} />
                )}
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

  if (column.id === 'report' && (cell.state === 'bad' || cell.state === 'warn')) {
    return <ReportPanel row={row} cell={cell} />
  }

  return (
    <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-gray-600">
      <span className="font-semibold text-gray-900">{column.label}:</span>{' '}
      {cell.detail || column.meaning}
    </p>
  )
}

/**
 * The report cell, with the fix beside the fault.
 *
 * "No report was built" used to be a sentence with nowhere to go, read on the
 * dashboard and then solved on a different page the reader had to find. The
 * first time it fired it was not a failure at all — reporting shipped mid-
 * September, after the 1st's build, so August simply never ran — and the
 * answer was one press. It is that press here, for this shop: the SAME build
 * route the Monthly reports page and the cron use, so a report built from the
 * dashboard cannot differ from one built anywhere else. It BUILDS and never
 * sends: sending is still a person reading it first, on Monthly reports.
 */
function ReportPanel({ row, cell }: { row: ClientHealthRow; cell: HealthCell }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'building' | 'built' | 'failed'>('idle')
  const [message, setMessage] = useState('')

  async function build() {
    setState('building')
    setMessage('')
    try {
      const res = await fetch('/api/admin/monthly-reports/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: row.id }),
      })
      if (!res.ok) throw new Error(await errorFrom(res))
      setState('built')
      router.refresh()
    } catch (err) {
      setState('failed')
      setMessage(err instanceof Error ? err.message : 'The build failed')
    }
  }

  return (
    <div className="mt-1 max-w-[62ch] space-y-2">
      <p className="text-xs leading-relaxed text-gray-600">{cell.detail}</p>
      <div className="flex flex-wrap items-center gap-2">
        {cell.state === 'bad' && state !== 'built' && (
          <button
            type="button"
            onClick={build}
            disabled={state === 'building'}
            className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-black disabled:opacity-60"
          >
            {state === 'building' ? 'Building…' : 'Build it now'}
          </button>
        )}
        <Link
          href="/admin/monthly-reports"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {cell.state === 'warn' || state === 'built' ? 'Read and send it' : 'Monthly reports'}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {state === 'built' && (
        <p className="text-xs text-emerald-700">
          Built. Nothing has been emailed — read it on Monthly reports, then send.
        </p>
      )}
      {state === 'failed' && <p className="text-xs text-red-700">{message}</p>}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'ok' | 'bad' | 'warn'
}) {
  // A zero goes quiet whatever the tone: none broken is not an alarm, and
  // none clear is not a celebration.
  const quiet = value === 0 && tone !== 'neutral'
  const styles = {
    neutral: 'border-gray-200 bg-white text-gray-900',
    ok: quiet ? 'border-gray-200 bg-white text-gray-400' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
    bad: quiet ? 'border-gray-200 bg-white text-gray-400' : 'border-red-200 bg-red-50 text-red-700',
    warn: quiet ? 'border-gray-200 bg-white text-gray-400' : 'border-amber-200 bg-amber-50 text-amber-800',
  }[tone]
  const dot = { neutral: 'bg-gray-400', ok: 'bg-emerald-500', bad: 'bg-red-600', warn: 'bg-amber-400' }[tone]
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${styles}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <span className={`h-2 w-2 rounded-full ${quiet ? 'bg-gray-300' : dot}`} />
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  )
}
