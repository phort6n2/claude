'use client'

import { useSyncExternalStore } from 'react'

/**
 * Where the visitor is, shared by every component that wants to show a
 * distance.
 *
 * A plain module store rather than a context, because the things that need it
 * are client islands scattered inside server-rendered pages (shop cards, the
 * map card) — there is no common client ancestor to hang a provider on.
 *
 * Two levels of precision, and the UI says which one it has:
 *   - approximate, from the edge's IP geolocation, with no permission prompt
 *   - precise, from the Geolocation API, only after the visitor asks for it
 *
 * A precise fix is remembered for the session so the prompt happens once.
 */
export interface ViewerLocation {
  lat: number
  lng: number
  precise: boolean
  /** e.g. "Denver, CO" — only known for the IP-based fix. */
  label: string | null
  /**
   * The same point in the map's projected space, so the map can draw a "you
   * are here" without shipping a projection to the browser. Null outside the
   * projection's clip (the composite covers the US only).
   */
  xy: [number, number] | null
}

const KEY = 'wrhq_viewer_location'

let current: ViewerLocation | null = null
let started = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function set(next: ViewerLocation | null) {
  current = next
  emit()
}

function remember(loc: ViewerLocation) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(loc))
  } catch {
    // Private mode, or storage disabled. The location still works for this
    // page — it just won't survive a navigation.
  }
}

/**
 * Resolve a location once per session, cheapest source first.
 *
 * Called on mount by anything that displays a distance; repeat calls are free.
 */
function start() {
  if (started || typeof window === 'undefined') return
  started = true

  try {
    const saved = sessionStorage.getItem(KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as ViewerLocation
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        set(parsed)
        // A precise fix is as good as it gets; don't downgrade it with IP.
        if (parsed.precise) return
      }
    }
  } catch {
    // Ignore unreadable storage and fall through to the network lookup.
  }

  fetch('/api/directory/near')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j?.origin || current?.precise) return
      const loc: ViewerLocation = {
        lat: j.origin.lat,
        lng: j.origin.lng,
        precise: false,
        label: j.location ?? null,
        xy: j.origin.xy ?? null,
      }
      set(loc)
      remember(loc)
    })
    .catch(() => {
      // No edge geo headers (local dev, or a privacy relay). Distances simply
      // don't render — better than showing a wrong one.
    })
}

/** Ask the browser for a precise fix. Resolves false if declined. */
export function requestPreciseLocation(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        set({ lat, lng, precise: true, label: null, xy: current?.xy ?? null })
        // Re-project through the server, since the projection can't run here.
        // The fix is already usable for distances; only the map dot waits.
        fetch(`/api/directory/near?lat=${lat}&lng=${lng}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            const loc: ViewerLocation = {
              lat,
              lng,
              precise: true,
              label: null,
              xy: j?.origin?.xy ?? null,
            }
            set(loc)
            remember(loc)
          })
          .catch(() => {
            if (current) remember(current)
          })
        resolve(true)
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  start()
  return () => {
    listeners.delete(cb)
  }
}

const snapshot = () => current
// The server has no location, and returning a stable null keeps the first
// client render identical to the HTML it hydrates.
const serverSnapshot = () => null

export function useViewerLocation(): ViewerLocation | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
