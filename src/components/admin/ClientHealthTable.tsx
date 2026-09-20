'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, X, Minus, TriangleAlert } from 'lucide-react'
import type { ClientHealthRow, HealthCell, HealthColumn } from '@/lib/client-health'

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

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        No clients yet.
      </div>
    )
  }

  const problems = rows.filter((r) => r.score > 0).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-600">
        <span className="font-medium text-gray-900">
          {problems === 0
            ? `All ${rows.length} clients clear.`
            : `${problems} of ${rows.length} need something.`}
        </span>
        <Legend icon={<Check className="h-3.5 w-3.5 text-green-600" strokeWidth={3} />} text="Working" />
        <Legend icon={<X className="h-3.5 w-3.5 text-red-600" strokeWidth={3} />} text="Broken — act" />
        <Legend icon={<TriangleAlert className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />} text="Worth a look" />
        <Legend
          icon={<Minus className="h-3.5 w-3.5 text-gray-300" strokeWidth={3} />}
          text="Doesn't apply"
        />
      </div>

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
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const openInThisRow = columns.find((c) => open === `${row.id}:${c.id}`)
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
                    {openInThisRow && (
                      <p className="mt-1 max-w-[46ch] text-xs leading-relaxed text-gray-600">
                        <span className="font-semibold text-gray-900">{openInThisRow.label}:</span>{' '}
                        {row.cells[openInThisRow.id].detail || openInThisRow.meaning}
                      </p>
                    )}
                  </td>
                  {columns.map((col) => {
                    const cell = row.cells[col.id]
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

      <p className="text-xs text-gray-500">
        Tap any mark to read what it means. Column headings:{' '}
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

function Legend({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  )
}
