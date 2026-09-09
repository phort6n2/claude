'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export type GalleryPhoto = { url: string; alt: string }

/**
 * The work gallery, with a tap opening the photo at full size.
 *
 * WHY IT NEEDED TO OPEN. The grid crops every photo to 4:3 and, on a phone,
 * into a column about 165px wide. That is enough to show that a gallery
 * exists and not enough to show the work — and these are the photos that
 * answer "are these people any good". The shop uploaded the whole photograph;
 * the grid was the only thing shrinking it, and there was nowhere to go from
 * there.
 *
 * NOTHING IS LOST WITHOUT JAVASCRIPT. This renders the same grid on the
 * server as the plain figures did, so the six <img> tags are in the HTML a
 * crawler and a JS-less visitor get. Only the tap is hydrated. That is the
 * same bargain the review cards make: the content ships, the interaction is
 * an addition.
 *
 * Backdrop, Escape, arrow keys and a horizontal swipe all close or move,
 * because on a phone the swipe is the one people try first and on a laptop
 * it is the arrow keys.
 */
export default function GalleryPhotos({ photos }: { photos: GalleryPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null)
  const triggers = useRef<Array<HTMLButtonElement | null>>([])
  const closeRef = useRef<HTMLButtonElement>(null)
  const openedFrom = useRef<number | null>(null)

  // Wraps in both directions: the last photo's "next" is the first. A dead
  // arrow at either end reads as the control being broken.
  const show = useCallback(
    (i: number) => setIndex(((i % photos.length) + photos.length) % photos.length),
    [photos.length]
  )

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null)
      else if (e.key === 'ArrowRight') show(index + 1)
      else if (e.key === 'ArrowLeft') show(index - 1)
    }
    document.addEventListener('keydown', onKey)
    // The page behind must not scroll under the overlay — on iOS that is how
    // you close it and find yourself somewhere else entirely.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [index, show])

  useEffect(() => {
    if (index !== null) {
      closeRef.current?.focus()
      return
    }
    // Closing returns focus to the photo it was opened from, not to the top of
    // the document — otherwise a keyboard visitor loses their place in a page
    // this section sits two thirds of the way down.
    if (openedFrom.current !== null) {
      triggers.current[openedFrom.current]?.focus()
      openedFrom.current = null
    }
  }, [index])

  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start || index === null) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    // Mostly horizontal, and far enough to be a deliberate flick. Without the
    // vertical comparison a thumb travelling down the screen changes photo.
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    show(index + (dx < 0 ? 1 : -1))
  }

  const active = index === null ? null : photos[index]

  return (
    <>
      {/* Even photo counts that don't fill three columns read better 2-up —
          no orphan card on the last row. */}
      <div
        className={`grid grid-cols-2 gap-5 ${
          photos.length % 3 === 1 ? 'md:grid-cols-2' : 'md:grid-cols-3'
        }`}
      >
        {photos.map((photo, i) => (
          <button
            key={photo.url}
            type="button"
            ref={(el) => {
              triggers.current[i] = el
            }}
            onClick={() => {
              openedFrom.current = i
              setIndex(i)
            }}
            aria-label={`View larger: ${photo.alt || 'job photo'}`}
            className="group block w-full cursor-zoom-in overflow-hidden rounded-[20px] border border-[var(--line-card)] bg-white p-0 text-left shadow-sm"
          >
            {/* The description belongs in alt, not under the photo. Printed
                as a caption it just narrates what the reader can already
                see, and reads like stock-photo metadata — which costs more
                credibility than the caption ever added. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.alt || 'Job photo'}
              loading="lazy"
              decoding="async"
              className="w-full aspect-[4/3] object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {active && index !== null && (
        <div
          // OPAQUE, not a tint. At black/90 the page underneath is white
          // enough to read through — the header and a paragraph of FAQ text
          // ghosted behind the photo, which is exactly the sort of thing that
          // only shows up in a screenshot. The photo is the subject here.
          className="fixed inset-0 z-50 flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${index + 1} of ${photos.length}`}
          onClick={() => setIndex(null)}
        >
          {/* No stopPropagation here on purpose: everything except the photo
              and the arrows is backdrop, including the bar the counter sits
              on. A dead strip along the top edge of a lightbox is exactly
              where a thumb reaching for "close" lands. */}
          <div className="flex shrink-0 items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-white">
            <span className="pl-2 text-sm font-semibold tabular-nums opacity-80">
              {index + 1} / {photos.length}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setIndex(null)}
              aria-label="Close"
              // 44px, the smallest thing a thumb hits reliably.
              className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onTouchStart={(e) => {
              touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            }}
            onTouchEnd={onTouchEnd}
          >
            {/* object-contain, so the crop the grid applies is undone here —
                the whole photograph is the point of opening it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={active.url}
              src={active.url}
              alt={active.alt || 'Job photo'}
              className="max-h-full max-w-full rounded-[14px] object-contain"
              // The backdrop closes; the photo itself must not.
              onClick={(e) => e.stopPropagation()}
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation()
                    show(index - 1)
                  }}
                  className="absolute left-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation()
                    show(index + 1)
                  }}
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
