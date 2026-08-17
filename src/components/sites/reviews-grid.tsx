'use client'

import { useEffect, useState } from 'react'
import { GoogleG, StarRow, type ReviewQuote } from '@/components/sites/shared'

/**
 * The review cards, clamped to a fixed height with the full text a click away.
 *
 * WHY CLAMPING RATHER THAN PICKING EVEN ONES. Google returns at most five
 * reviews for a place and they are whatever length they are — Collision's run
 * 496 to 1183 characters. The cards share a grid row and stretch to the
 * tallest, so one long review set the height of the row and the wall looked
 * ragged. Earlier attempts fixed that by choosing WHICH reviews to show:
 * first a length filter (which, tightened too far, emptied a live client's
 * wall entirely), then the three closest in length (which threw away two
 * perfectly good reviews to make the remaining three match).
 *
 * Clamping makes the choice unnecessary. Every card is the same height
 * because the visible part is the same number of lines, so length stops
 * driving layout and every review Google returns can be shown.
 *
 * NOTHING IS LOST. The clip is visual only — the full text is in the markup,
 * so it is read by search engines and by a screen reader, and "Read more"
 * opens all of it. That distinction is the whole reason the old code refused
 * to clip: the clip landed mid-sentence exactly where these reviews become
 * persuasive, and there was no way to get to the rest. Now there is.
 *
 * A client component, deliberately the only one on the page: the modal needs
 * state. It carries no data fetching and renders the same markup on the
 * server, so the cards are complete before hydration.
 */

const AVATAR_COLORS = ['#0B57D0', '#B3261E', '#146C2E', '#7B4397', '#B26A00']

export function ReviewsGrid({ quotes }: { quotes: ReviewQuote[] }) {
  const [open, setOpen] = useState<number | null>(null)

  // Escape closes, and the page behind must not scroll under the modal.
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  if (quotes.length === 0) return null
  const active = open === null ? null : quotes[open]

  return (
    <>
      <div
        className={`grid gap-5 ${
          quotes.length < 3
            ? quotes.length === 1
              ? 'max-w-xl mx-auto'
              : 'sm:grid-cols-2 max-w-3xl mx-auto'
            : 'sm:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {quotes.map((q, i) => (
          <figure
            key={i}
            className="p-5 rounded-[20px] border border-[var(--line-card)] shadow-sm bg-white flex flex-col m-0"
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              >
                {(q.author || 'G')[0].toUpperCase()}
              </span>
              <span className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="text-sm font-bold text-[var(--tx)] truncate">{q.author}</span>
                {q.relativeTime && (
                  <span className="text-xs text-[var(--tx-muted)]">{q.relativeTime}</span>
                )}
              </span>
              <GoogleG size={16} />
            </div>
            <StarRow rating={q.rating} size={13} className="mb-2" />
            {/* The full text ships; only its height is capped. */}
            <blockquote className="m-0 text-sm text-[var(--tx2)] leading-relaxed line-clamp-6 overflow-hidden">
              “{q.text}”
            </blockquote>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="mt-3 self-start text-sm font-bold text-[var(--brand)] hover:underline min-h-[44px] -mb-2"
            >
              Read more
            </button>
          </figure>
        ))}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Review from ${active.author}`}
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white w-full sm:max-w-xl max-h-[85vh] overflow-y-auto rounded-t-[20px] sm:rounded-[20px] p-6"
            // The backdrop closes; a click on the review itself must not.
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ backgroundColor: AVATAR_COLORS[(open ?? 0) % AVATAR_COLORS.length] }}
              >
                {(active.author || 'G')[0].toUpperCase()}
              </span>
              <span className="flex flex-col leading-tight min-w-0 flex-1">
                <span className="font-bold text-[var(--tx)]">{active.author}</span>
                {active.relativeTime && (
                  <span className="text-xs text-[var(--tx-muted)]">{active.relativeTime}</span>
                )}
              </span>
              <GoogleG size={18} />
            </div>
            <StarRow rating={active.rating} size={15} className="mb-3" />
            <blockquote className="m-0 text-[15px] text-[var(--tx2)] leading-relaxed">
              “{active.text}”
            </blockquote>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mt-5 inline-flex items-center min-h-[44px] px-4 rounded-full border border-[var(--line-card)] font-bold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
