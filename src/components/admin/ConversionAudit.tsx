'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * ONE live read of a client's Google Ads conversion setup, shared by every
 * card on the Advertising tab that asks the same question.
 *
 * Two cards need it: the setup instructions at the top, which hide themselves
 * once the account actually contains the action they describe, and the
 * "Conversion setup in Google Ads" audit below, which lists all four with
 * their state. Fetching twice would mean two hits on Google's search endpoint
 * per page view — it is not fast, which is why that route runs with
 * maxDuration 60 — and, worse, two answers on one screen that can disagree
 * while one of them is still in flight.
 *
 * `refresh` RETURNS the payload as well as storing it. The instructions check
 * a box by re-reading the account, and need the answer in the same tick to
 * say why it did not tick; React state has not settled by then.
 */

export interface ConversionSpecView {
  key: string
  name: string
  category: string
  type: string
  origin: string
  fires: string
  countingType: string
  clickLookbackDays: number
  callSeconds?: number
  biddable: boolean
  setup: string[]
}

export interface ConversionFinding {
  key: string
  name: string
  state: 'ok' | 'settings' | 'rename' | 'missing' | 'duplicate'
  actionId?: string
  actionName?: string
  fix?: string
  differences: string[]
  setup: string[]
  fires: string
}

export interface ConversionAudit {
  customerId: string
  findings: ConversionFinding[]
  doubleCounting: string[]
  goalIssues: string[]
  extras: Array<{ id: string; name: string; note: string }>
  clean: boolean
}

export interface ConversionAuditState {
  standard: ConversionSpecView[] | null
  audit: ConversionAudit | null
  /** Why there is no audit — no account linked, or Google could not be read. */
  reason: string | null
  loading: boolean
  refresh: () => Promise<{ audit: ConversionAudit | null; reason: string | null }>
}

const Ctx = createContext<ConversionAuditState | null>(null)

export function ConversionAuditProvider({
  clientId,
  children,
}: {
  clientId: string
  children: React.ReactNode
}) {
  const [standard, setStandard] = useState<ConversionSpecView[] | null>(null)
  const [audit, setAudit] = useState<ConversionAudit | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (await fetch(`/api/clients/${clientId}/ads-conversions`)).json()
      setStandard(data.standard || [])
      setAudit(data.audit || null)
      setReason(data.reason || null)
      return { audit: (data.audit || null) as ConversionAudit | null, reason: (data.reason || null) as string | null }
    } catch {
      const failed = 'Could not reach Google Ads.'
      setAudit(null)
      setReason(failed)
      return { audit: null, reason: failed }
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <Ctx.Provider value={{ standard, audit, reason, loading, refresh }}>{children}</Ctx.Provider>
  )
}

/**
 * Null outside a provider, on purpose.
 *
 * A card that cannot read the account should fall back to showing its
 * instructions — the state it was in before any of this existed — rather than
 * throwing in front of an operator or, worse, claiming a setup step is done
 * because nothing answered.
 */
export function useConversionAudit(): ConversionAuditState | null {
  return useContext(Ctx)
}
