import { list, del } from '@vercel/blob'
import { prisma } from '@/lib/db'
import { blobConfigured } from '@/lib/photo-upload'

/**
 * Files in Blob storage that nothing in the database points at.
 *
 * They accumulate quietly: a delete whose storage call failed, a client
 * removed before the teardown existed, an upload whose row never got written.
 * Nothing surfaces them, and storage is billed by the gigabyte-month, so the
 * cost is small, permanent and invisible.
 *
 * ---------------------------------------------------------------------------
 * The thing this must never do
 * ---------------------------------------------------------------------------
 * Deleting a file that IS live takes a photo off a client's website with no
 * way back. Every guard below exists for that, and the ordering matters:
 *
 *  1. The reference set is built from the database and must be non-empty
 *     before anything is deleted. A transient query failure returning zero
 *     rows would otherwise mark EVERY file an orphan — the one bug in here
 *     that could wipe every photo on the platform in a single click.
 *  2. Files younger than MIN_AGE_HOURS are never candidates. An upload
 *     writes the object first and the row second; a file uploaded seconds ago
 *     is indistinguishable from an orphan and is simply too new to judge.
 *  3. Deletion re-derives the reference set rather than trusting the list it
 *     was handed. A photo uploaded between scanning and deleting must not be
 *     deleted because it wasn't there when we looked.
 */

/** An upload is object-then-row, so anything recent is unjudgeable. */
const MIN_AGE_HOURS = 24

export interface OrphanFile {
  url: string
  pathname: string
  size: number
  uploadedAt: string
  /** Folder it sits in, which is the client slug for normal uploads. */
  folder: string
}

export interface OrphanScan {
  ok: boolean
  error?: string
  totalFiles: number
  totalBytes: number
  referencedFiles: number
  orphans: OrphanFile[]
  orphanBytes: number
  /** Too recent to judge. Reported so the numbers reconcile. */
  tooRecent: number
}

/**
 * Every blob URL the database currently points at.
 *
 * Photos are the only thing we upload, but a logo can also be a blob URL if
 * one was ever stored there, so both are collected. Over-collecting is safe
 * here; under-collecting deletes live files.
 */
async function referencedUrls(): Promise<Set<string>> {
  const [photos, clients] = await Promise.all([
    prisma.clientSitePhoto.findMany({ select: { url: true } }),
    prisma.client.findMany({ select: { logoUrl: true } }),
  ])
  const set = new Set<string>()
  for (const p of photos) if (p.url) set.add(p.url)
  for (const c of clients) if (c.logoUrl) set.add(c.logoUrl)
  return set
}

export async function scanOrphans(): Promise<OrphanScan> {
  const empty: OrphanScan = {
    ok: false,
    totalFiles: 0,
    totalBytes: 0,
    referencedFiles: 0,
    orphans: [],
    orphanBytes: 0,
    tooRecent: 0,
  }
  if (!blobConfigured()) {
    return { ...empty, error: 'Vercel Blob is not connected to this deployment, so there is nothing to sweep. Connect the store in Vercel, then redeploy — the token is only injected at build time.' }
  }

  let referenced: Set<string>
  try {
    referenced = await referencedUrls()
  } catch (error) {
    return {
      ...empty,
      error: `Could not read the database: ${error instanceof Error ? error.message : 'failed'}`,
    }
  }

  const cutoff = Date.now() - MIN_AGE_HOURS * 3_600_000
  const orphans: OrphanFile[] = []
  let totalFiles = 0
  let totalBytes = 0
  let tooRecent = 0
  let cursor: string | undefined

  try {
    do {
      const page = await list({ cursor, limit: 1000 })
      for (const blob of page.blobs) {
        totalFiles += 1
        totalBytes += blob.size
        if (referenced.has(blob.url)) continue
        if (new Date(blob.uploadedAt).getTime() > cutoff) {
          tooRecent += 1
          continue
        }
        orphans.push({
          url: blob.url,
          pathname: blob.pathname,
          size: blob.size,
          uploadedAt: new Date(blob.uploadedAt).toISOString(),
          folder: blob.pathname.split('/').slice(0, 2).join('/'),
        })
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  } catch (error) {
    return {
      ...empty,
      error: `Could not list storage: ${error instanceof Error ? error.message : 'failed'}`,
    }
  }

  return {
    ok: true,
    totalFiles,
    totalBytes,
    referencedFiles: referenced.size,
    orphans: orphans.sort((a, b) => b.size - a.size),
    orphanBytes: orphans.reduce((sum, o) => sum + o.size, 0),
    tooRecent,
  }
}

export interface SweepResult {
  ok: boolean
  error?: string
  deleted: number
  freedBytes: number
  /** Asked for, but no longer safe to delete. */
  skipped: string[]
}

/**
 * Delete a specific list of orphans.
 *
 * Takes explicit URLs rather than re-running the scan and deleting whatever it
 * finds, so what gets deleted is what was reviewed. Every URL is re-checked
 * against a freshly-read reference set regardless — the list may be minutes
 * old, and a photo uploaded in between must survive.
 */
export async function sweepOrphans(urls: string[]): Promise<SweepResult> {
  if (!blobConfigured()) {
    return { ok: false, error: 'Vercel Blob is not connected to this deployment.', deleted: 0, freedBytes: 0, skipped: [] }
  }
  if (urls.length === 0) {
    return { ok: true, deleted: 0, freedBytes: 0, skipped: [] }
  }

  let referenced: Set<string>
  try {
    referenced = await referencedUrls()
  } catch (error) {
    return {
      ok: false,
      error: `Could not read the database: ${error instanceof Error ? error.message : 'failed'}`,
      deleted: 0,
      freedBytes: 0,
      skipped: [],
    }
  }

  // The guard that matters. An empty reference set means either a genuinely
  // empty platform or a query that silently returned nothing — and the second
  // is indistinguishable from the first here. Refusing costs a retry; being
  // wrong deletes every photo on every client site.
  if (referenced.size === 0) {
    return {
      ok: false,
      error:
        'The database reports no referenced files at all. That is either an empty platform or a failed read, and this cannot tell which — refusing to delete anything.',
      deleted: 0,
      freedBytes: 0,
      skipped: urls,
    }
  }

  const cutoff = Date.now() - MIN_AGE_HOURS * 3_600_000
  const requested = new Set(urls)
  const safe: string[] = []
  const skipped: string[] = []
  let freedBytes = 0
  let cursor: string | undefined

  // Re-derive from storage so size and age come from the file itself rather
  // than from whatever the browser sent back.
  try {
    do {
      const page = await list({ cursor, limit: 1000 })
      for (const blob of page.blobs) {
        if (!requested.has(blob.url)) continue
        if (referenced.has(blob.url) || new Date(blob.uploadedAt).getTime() > cutoff) {
          skipped.push(blob.url)
          continue
        }
        safe.push(blob.url)
        freedBytes += blob.size
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  } catch (error) {
    return {
      ok: false,
      error: `Could not list storage: ${error instanceof Error ? error.message : 'failed'}`,
      deleted: 0,
      freedBytes: 0,
      skipped: [],
    }
  }

  if (safe.length === 0) return { ok: true, deleted: 0, freedBytes: 0, skipped }

  try {
    // del() takes up to 1000 at a time.
    for (let i = 0; i < safe.length; i += 1000) {
      await del(safe.slice(i, i + 1000))
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Delete failed',
      deleted: 0,
      freedBytes: 0,
      skipped,
    }
  }

  return { ok: true, deleted: safe.length, freedBytes, skipped }
}
