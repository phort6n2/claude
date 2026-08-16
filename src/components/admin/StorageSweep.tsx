'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, HardDrive, Loader2, Search, Trash2, TriangleAlert } from 'lucide-react'

/**
 * Files in storage that nothing points at, and a way to delete them.
 *
 * Scan and delete are separate on purpose. The scan is read-only and always
 * runs first, so nothing is ever deleted that wasn't listed on screen — and
 * the delete names the exact files rather than asking the server to re-decide.
 */

interface OrphanFile {
  url: string
  pathname: string
  size: number
  uploadedAt: string
  folder: string
}

interface Scan {
  ok: boolean
  error?: string
  totalFiles: number
  totalBytes: number
  referencedFiles: number
  orphans: OrphanFile[]
  orphanBytes: number
  tooRecent: number
}

function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function StorageSweep() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [scanning, setScanning] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')

  const run = useCallback(async () => {
    setScanning(true)
    setError('')
    setDone(null)
    try {
      const data = await (await fetch('/api/admin/blob-orphans')).json()
      setScan(data)
      if (data.error) setError(data.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    run()
  }, [run])

  async function sweep() {
    if (!scan?.orphans.length) return
    setSweeping(true)
    setError('')
    try {
      const res = await fetch('/api/admin/blob-orphans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: scan.orphans.map((o) => o.url) }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Sweep failed')
      setDone(
        `Deleted ${data.deleted} file${data.deleted === 1 ? '' : 's'}, freeing ${mb(data.freedBytes)}.` +
          (data.skipped?.length
            ? ` ${data.skipped.length} were skipped — they became referenced or are too new.`
            : '')
      )
      await run()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sweep failed')
    } finally {
      setSweeping(false)
    }
  }

  return (
    <div className="space-y-4">
      <MirrorPhotosCard />
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-gray-400" /> Unreferenced files
            </h2>
            <p className="text-sm text-gray-600">
              Files in Blob storage that no client, photo or logo points at. They are billed every
              month and nothing surfaces them.
            </p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={scanning || sweeping}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Scan again
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        {done && (
          <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            {done}
          </p>
        )}

        {scanning && !scan && (
          <p className="mt-4 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading every file in storage…
          </p>
        )}

        {scan?.ok && (
          <>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-2xl font-bold text-gray-900">{scan.totalFiles}</div>
                <div className="text-gray-500">files stored · {mb(scan.totalBytes)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-2xl font-bold text-gray-900">{scan.referencedFiles}</div>
                <div className="text-gray-500">referenced in the database</div>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  scan.orphans.length ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                }`}
              >
                <div className="text-2xl font-bold text-gray-900">{scan.orphans.length}</div>
                <div className="text-gray-500">unreferenced · {mb(scan.orphanBytes)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-2xl font-bold text-gray-900">{scan.tooRecent}</div>
                <div className="text-gray-500">too new to judge (&lt;24h)</div>
              </div>
            </div>

            {scan.orphans.length === 0 ? (
              <p className="mt-4 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Nothing to clean up. Every stored file is in
                use.
              </p>
            ) : (
              <>
                <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {scan.orphans.map((o) => (
                    <div
                      key={o.url}
                      className="px-3 py-2 text-sm flex items-center justify-between gap-3"
                    >
                      <span className="font-mono text-xs text-gray-700 truncate">{o.pathname}</span>
                      <span className="text-gray-400 whitespace-nowrap text-xs">
                        {mb(o.size)} · {new Date(o.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={sweep}
                    disabled={sweeping}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
                  >
                    {sweeping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete these {scan.orphans.length} files and free {mb(scan.orphanBytes)}
                  </button>
                  <span className="text-xs text-gray-500 flex items-start gap-1.5 max-w-lg">
                    <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    Each file is re-checked against the database at the moment of deletion, so
                    anything that became referenced since this scan is left alone.
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}


/**
 * Copy hot-linked photos onto our own storage.
 *
 * Shops imported before the importer did this still serve every photo from
 * their old CMS, at whatever size was uploaded — measured at ~1MB into 358px
 * phone slots on one live site, and it breaks the day they redesign. Safe to
 * run repeatedly: anything already on Blob is skipped.
 */
function MirrorPhotosCard() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function run() {
    if (!confirm('Copy every hot-linked photo and logo onto our own storage?\n\nThis fetches and re-encodes each one, so it takes a while. Anything already copied is skipped, and anything that cannot be fetched keeps its current URL.')) {
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/mirror-photos', { method: 'POST' })
      const data = await res.json()
      setResult({ ok: !!data.success, text: data.message || 'Done.' })
    } catch {
      setResult({ ok: false, text: 'Could not run — try again.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h2 className="font-bold text-gray-900 flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-gray-400" /> Self-host imported photos
      </h2>
      <p className="text-sm text-gray-600 max-w-prose">
        Photos and logos taken from a shop&rsquo;s old website are served from that site until they
        are copied here. Copying them makes the pages lighter, stops them breaking when the shop
        redesigns, and stops billing someone else for the traffic.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
      >
        {running ? 'Copying…' : 'Copy imported photos'}
      </button>
      {result && (
        <p className={`mt-2 text-sm ${result.ok ? 'text-green-700' : 'text-red-600'}`}>{result.text}</p>
      )}
    </section>
  )
}
