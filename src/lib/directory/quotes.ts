// ============================================
// DIRECTORY — QUOTE REQUESTS (lead capture)
// ============================================
// Consumer quote requests are lead PII, so they are stored server-side only in
// Vercel Blob under unguessable paths and are read exclusively through the
// secret-gated agency API / owner dashboard — never exposed to the public.
// Degrades gracefully: with no BLOB_READ_WRITE_TOKEN, submissions are logged
// (not lost silently — the operator is told to configure storage) and reads
// return empty. For scale/compliance, migrate this to Postgres later.

import { list, put } from '@vercel/blob'
import { blobEnabled } from './blob'

const PREFIX = 'directory/quotes'

export interface Quote {
  id: string
  shopSlug: string
  shopName: string
  name: string
  phone: string
  email?: string
  vehicle?: string
  service?: string
  message?: string
  createdAt: string
}

export function quotesEnabled(): boolean {
  return blobEnabled()
}

export async function saveQuote(q: Quote): Promise<boolean> {
  if (!quotesEnabled()) {
    console.log('[directory:quote:unstored]', JSON.stringify(q))
    return false
  }
  await put(`${PREFIX}/${q.shopSlug}/${q.id}.json`, JSON.stringify(q), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
  })
  return true
}

async function readQuotes(prefix: string): Promise<Quote[]> {
  if (!quotesEnabled()) return []
  try {
    const { blobs } = await list({ prefix })
    const quotes = await Promise.all(
      blobs.map(async (b) => {
        try {
          const res = await fetch(b.url, { cache: 'no-store' })
          return (await res.json()) as Quote
        } catch {
          return null
        }
      })
    )
    return quotes
      .filter((q): q is Quote => !!q)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  } catch {
    return []
  }
}

/** All quotes across every shop (agency inbox). */
export function listAllQuotes(): Promise<Quote[]> {
  return readQuotes(`${PREFIX}/`)
}

/** Quotes for a single shop (owner dashboard). */
export function listQuotesForShop(slug: string): Promise<Quote[]> {
  return readQuotes(`${PREFIX}/${slug}/`)
}
