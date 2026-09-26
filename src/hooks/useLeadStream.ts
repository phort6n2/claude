'use client'

import { useEffect, useRef } from 'react'

interface UseLeadStreamOptions<L> {
  /** Full URL with querystring for the SSE endpoint. */
  url: string
  /** When false the connection is closed and no events are delivered. */
  enabled?: boolean
  /** Called once per newly-arrived lead. */
  onLead: (lead: L) => void
  /**
   * Called when a call already in the list learns how it ended — see the
   * `lead-call` poll in the portal stream. The payload carries only the call
   * facts; merge them, never replace the row.
   */
  onCallUpdate?: (update: LeadCallUpdate) => void
}

export interface LeadCallUpdate {
  id: string
  duplicateOfLeadId: string | null
  callStatus: string | null
  callDurationSecs: number | null
  callRecordingUrl: string | null
  callAnalysis: { id: string; status: string; score: number | null; outcome: string | null } | null
}

/**
 * Subscribe to a Server-Sent Events stream of new leads.
 *
 * Two cost-saving behaviours layered on top of EventSource:
 *  1. The connection is closed when the tab becomes hidden and reopened when
 *     it becomes visible again. Backgrounded tabs cost nothing on the server.
 *  2. The browser's built-in reconnect (sending `Last-Event-ID`) covers the
 *     ~25–55s self-close cycle the server uses, so events aren't lost across
 *     reconnects.
 */
export function useLeadStream<L>({ url, enabled = true, onLead, onCallUpdate }: UseLeadStreamOptions<L>) {
  // Keep the latest onLead in a ref so changing handlers don't force a
  // reconnect (callers usually wrap in useCallback already, but be defensive).
  const onLeadRef = useRef(onLead)
  const onCallUpdateRef = useRef(onCallUpdate)
  useEffect(() => {
    onLeadRef.current = onLead
    onCallUpdateRef.current = onCallUpdate
  }, [onLead, onCallUpdate])

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    let source: EventSource | null = null

    const handleLead = (event: MessageEvent) => {
      try {
        const lead = JSON.parse(event.data) as L
        onLeadRef.current(lead)
      } catch (err) {
        console.error('[useLeadStream] failed to parse lead event', err)
      }
    }

    const handleCall = (event: MessageEvent) => {
      try {
        onCallUpdateRef.current?.(JSON.parse(event.data) as LeadCallUpdate)
      } catch (err) {
        console.error('[useLeadStream] failed to parse lead-call event', err)
      }
    }

    const open = () => {
      if (source) return
      source = new EventSource(url, { withCredentials: true })
      source.addEventListener('lead', handleLead)
      source.addEventListener('lead-call', handleCall)
    }

    const close = () => {
      if (!source) return
      source.removeEventListener('lead', handleLead)
      source.removeEventListener('lead-call', handleCall)
      source.close()
      source = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        open()
      } else {
        close()
      }
    }

    if (document.visibilityState === 'visible') {
      open()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      close()
    }
  }, [url, enabled])
}
