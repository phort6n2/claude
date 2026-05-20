/**
 * Minimal HighLevel v2 (LeadConnector) API client.
 *
 * Used by the admin backfill endpoint. Production lead ingestion is still
 * handled by webhooks — this client only fills the gap when a client is
 * onboarded after leads have already been captured in their HighLevel.
 *
 * Auth: a Private Integration Token (`pit-...`), per location, passed in the
 * Authorization header. Stored encrypted on Client.highlevelApiToken.
 */

const BASE_URL = 'https://services.leadconnectorhq.com'
const API_VERSION = '2021-07-28'

export interface HighLevelContact {
  id: string
  firstName?: string | null
  lastName?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  dateAdded?: string | null
  source?: string | null
  type?: string | null
  attributionSource?: {
    utmSource?: string | null
    utmMedium?: string | null
    utmCampaign?: string | null
    utmContent?: string | null
    utmTerm?: string | null
    medium?: string | null
    campaign?: string | null
    gclid?: string | null
    fbclid?: string | null
  }
  lastAttributionSource?: HighLevelContact['attributionSource']
  customFields?: Array<{ id: string; key?: string; value: unknown }>
  tags?: string[]
}

export interface HighLevelMessage {
  id: string
  type?: number | string
  messageType?: string
  contactId?: string
  dateAdded?: string
  direction?: 'inbound' | 'outbound'
  attachments?: string[]
  meta?: {
    call?: {
      duration?: number
      status?: string
      recordingUrl?: string | null
    }
  }
  // Some endpoints return the recording URL directly.
  recordingUrl?: string | null
}

interface FetchOpts {
  token: string
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
  query?: Record<string, string | number | undefined>
}

async function callHL<T>(opts: FetchOpts): Promise<T> {
  const url = new URL(BASE_URL + opts.path)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Version: API_VERSION,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `HighLevel API ${res.status} on ${opts.path}: ${text.substring(0, 500)}`
    )
  }
  return (await res.json()) as T
}

/**
 * Page through contacts created in the given window. The `dateAdded` filter
 * uses HighLevel's ISO-string semantics; we pass start/end as `YYYY-MM-DD`.
 */
export async function listContactsInDateRange({
  token,
  locationId,
  startDate,
  endDate,
  pageLimit = 100,
  maxPages = 20,
}: {
  token: string
  locationId: string
  startDate: Date
  endDate: Date
  pageLimit?: number
  maxPages?: number
}): Promise<HighLevelContact[]> {
  const all: HighLevelContact[] = []
  let page = 1
  let searchAfter: unknown[] | undefined

  for (let i = 0; i < maxPages; i++) {
    const body: Record<string, unknown> = {
      locationId,
      pageLimit,
      sort: [{ field: 'dateAdded', direction: 'desc' }],
      filters: [
        {
          field: 'dateAdded',
          operator: 'range',
          value: {
            gte: startDate.toISOString(),
            lte: endDate.toISOString(),
          },
        },
      ],
    }
    if (searchAfter) body.searchAfter = searchAfter

    const result = await callHL<{
      contacts: HighLevelContact[]
      total?: number
    }>({
      token,
      path: '/contacts/search',
      method: 'POST',
      body,
    })

    const batch = result.contacts ?? []
    all.push(...batch)
    if (batch.length < pageLimit) break

    // HighLevel's search uses searchAfter for cursoring on the last result's
    // sort key (dateAdded). We pass the most-recent contact's dateAdded back.
    const last = batch[batch.length - 1]
    if (!last?.dateAdded) break
    searchAfter = [last.dateAdded]
    page += 1
  }

  return all
}

/**
 * Fetch the most recent call message (inbound or outbound) with a recording
 * URL for a given contact. Used to attach call recordings to phone leads
 * during backfill.
 */
export async function findRecordingForContact({
  token,
  locationId,
  contactId,
}: {
  token: string
  locationId: string
  contactId: string
}): Promise<{ recordingUrl: string; messageId: string } | null> {
  // List the contact's conversations.
  const convs = await callHL<{
    conversations: Array<{ id: string; type?: string; lastMessageDate?: string }>
  }>({
    token,
    path: '/conversations/search',
    query: { locationId, contactId, limit: 5 },
  })

  for (const conv of convs.conversations ?? []) {
    let messages: HighLevelMessage[] = []
    try {
      const msgRes = await callHL<{
        messages?: { messages?: HighLevelMessage[] }
      }>({
        token,
        path: `/conversations/${conv.id}/messages`,
        query: { limit: 50 },
      })
      messages = msgRes.messages?.messages ?? []
    } catch {
      continue
    }

    // Look for a call message with a recording URL. HighLevel's message types
    // map: 25 = TYPE_CALL (incoming/outgoing). Recording lives under
    // meta.call.recordingUrl. Some workflows also surface it at the top level.
    for (const m of messages) {
      const url = m.recordingUrl ?? m.meta?.call?.recordingUrl ?? null
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return { recordingUrl: url, messageId: m.id }
      }
    }
  }

  return null
}
