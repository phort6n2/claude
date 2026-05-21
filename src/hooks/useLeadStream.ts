'use client'

import { useEffect } from 'react'

interface UseLeadStreamOptions<L> {
  /** Full URL with querystring for the SSE endpoint. */
  url: string
  /** When false the connection is closed and no events are delivered. */
  enabled?: boolean
  /** Called once per newly-arrived lead. */
  onLead: (lead: L) => void
}

/**
 * Subscribe to a Server-Sent Events stream of new leads. Wraps EventSource —
 * the browser auto-reconnects on transient errors and when our server-side
 * connection closes itself at ~25s, so callers don't need a fallback.
 */
export function useLeadStream<L>({ url, enabled = true, onLead }: UseLeadStreamOptions<L>) {
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const source = new EventSource(url, { withCredentials: true })

    const handleLead = (event: MessageEvent) => {
      try {
        const lead = JSON.parse(event.data) as L
        onLead(lead)
      } catch (err) {
        console.error('[useLeadStream] failed to parse lead event', err)
      }
    }

    source.addEventListener('lead', handleLead)

    return () => {
      source.removeEventListener('lead', handleLead)
      source.close()
    }
  }, [url, enabled, onLead])
}
