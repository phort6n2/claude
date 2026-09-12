'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Star, Trash2, TriangleAlert } from 'lucide-react'

/**
 * Photo upload and management, shared by the admin and the client portal.
 *
 * The endpoint differs (the portal's is scoped by the signed session, the
 * admin's by the client in the URL) but the interaction is identical, so it
 * is one component with the endpoint passed in rather than two that drift.
 *
 * Alt text is a first-class field rather than an afterthought: it is what a
 * screen reader announces and what search engines read, and an empty one on a
 * photo of the work is a wasted description.
 */

export interface PhotoRow {
  id: string
  url: string
  alt: string
  pool: string
}

export default function PhotoManager({
  listUrl,
  uploadUrl,
  deleteUrl,
  patchUrl,
  hasLogo,
  emptyHint,
}: {
  listUrl: string
  uploadUrl: string
  /**
   * The endpoint that removes a photo; the id is appended as ?photoId=.
   *
   * A STRING, not a function that builds one. It was a function, which works
   * from the admin — that mount sits inside a 'use client' component — and
   * threw on the portal, where the page is a Server Component and React
   * cannot serialise a function across that boundary. The whole Photos tab
   * 500'd before rendering. A prop shape that is only valid from some callers
   * is a trap for the next caller, so it is data now.
   */
  deleteUrl: string
  /** Absent in the portal, where alt text is edited by us, not the client. */
  patchUrl?: string
  hasLogo: boolean
  emptyHint: string
}) {
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pasted, setPasted] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(listUrl)).json()
      setPhotos(data.photos || [])
    } catch {
      setPhotos([])
    }
  }, [listUrl])

  useEffect(() => {
    load()
  }, [load])

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setMessage(null)
    // One at a time: each upload decodes and re-encodes a full-size photo, and
    // firing six at once is how a serverless function times out.
    for (const file of Array.from(files)) {
      setBusy(`Uploading ${file.name}…`)
      try {
        const body = new FormData()
        body.append('file', file)
        const res = await fetch(uploadUrl, { method: 'POST', body })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        if (!data.watermarked && hasLogo) {
          setMessage({
            ok: false,
            text: "Uploaded, but the logo couldn't be read so this one isn't watermarked. Check the logo URL.",
          })
        }
      } catch (err) {
        setMessage({ ok: false, text: err instanceof Error ? err.message : 'Upload failed' })
        break
      }
    }
    setBusy(null)
    if (input.current) input.current.value = ''
    await load()
  }

  /**
   * Add photos by address.
   *
   * Several at once, split on newlines and commas, because the reason to be
   * pasting addresses at all is that somebody is copying them off a page —
   * and they arrive in a list. Posted one at a time for the same reason the
   * files are: each one is fetched, decoded, resized and stamped server-side.
   *
   * A failure does NOT stop the rest, unlike the file loop. A dead address in
   * the middle of eight is ordinary — one image has moved — and abandoning
   * the remaining seven would leave the operator to work out which went in.
   */
  async function addUrls(text: string) {
    const urls = text
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean)
    if (urls.length === 0) return
    setMessage(null)
    let added = 0
    const failed: string[] = []
    for (const [index, url] of urls.entries()) {
      setBusy(urls.length > 1 ? `Copying ${index + 1} of ${urls.length}…` : 'Copying…')
      try {
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not copy that address')
        added++
      } catch (err) {
        failed.push(err instanceof Error ? err.message : url)
      }
    }
    setBusy(null)
    // Says what happened to ALL of them: "3 added" while two silently vanished
    // is how a gallery ends up short and nobody knows which.
    setMessage(
      failed.length === 0
        ? { ok: true, text: `Added ${added} photo${added === 1 ? '' : 's'}.` }
        : {
            ok: false,
            text:
              (added ? `Added ${added}, but ${failed.length} could not be copied. ` : '') +
              failed[0],
          }
    )
    if (added > 0) setPasted('')
    await load()
  }

  async function remove(photo: PhotoRow) {
    if (!confirm('Remove this photo from the site?')) return
    setBusy(photo.id)
    try {
      const sep = deleteUrl.includes('?') ? '&' : '?'
      const res = await fetch(`${deleteUrl}${sep}photoId=${encodeURIComponent(photo.id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Could not remove')
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(null)
    }
  }

  async function makeHero(photo: PhotoRow) {
    if (!patchUrl) return
    setBusy(photo.id)
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: photo.id, action: 'hero' }),
    }).catch(() => {})
    await load()
    setBusy(null)
  }

  async function saveAlt(photo: PhotoRow, alt: string) {
    if (!patchUrl || alt === photo.alt) return
    await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: photo.id, alt }),
    }).catch(() => {})
  }

  if (photos === null) {
    return (
      <div className="p-6 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading photos…
      </div>
    )
  }

  return (
    <div className="p-6 pt-4 space-y-4">
      {!hasLogo && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            No logo set for this client, so uploads can&apos;t be watermarked. Add a logo first if
            you want the mark.
          </span>
        </div>
      )}

      <p className="text-sm text-gray-600">{emptyHint}</p>

      {photos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => {
            // The hero is whatever sits first in the gallery pool — the same
            // rule the page uses, so what is marked here is what renders.
            const isHero = photo.pool === 'GALLERY' && index === 0
            return (
            <div
              key={photo.id}
              className={`rounded-xl border overflow-hidden ${
                isHero ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-200'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.alt || ''}
                className="w-full aspect-[4/3] object-cover bg-gray-100"
                loading="lazy"
              />
              <div className="p-3 space-y-2">
                {isHero && (
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 flex items-center gap-1">
                    <Star size={12} className="fill-amber-400 text-amber-500" /> Hero background
                  </p>
                )}
                {patchUrl ? (
                  <input
                    type="text"
                    defaultValue={photo.alt}
                    onBlur={(e) => saveAlt(photo, e.target.value)}
                    placeholder="Describe the photo"
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  photo.alt && <p className="text-sm text-gray-600">{photo.alt}</p>
                )}
                <div className="flex items-center gap-4">
                  {patchUrl && !isHero && photo.pool === 'GALLERY' && (
                    <button
                      type="button"
                      onClick={() => makeHero(photo)}
                      disabled={busy === photo.id}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-amber-700"
                    >
                      <Star size={13} /> Use as hero
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(photo)}
                    disabled={busy === photo.id}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600"
                  >
                    {busy === photo.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                    Remove
                  </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer">
          <ImagePlus size={15} />
          Add photos
          <input
            ref={input}
            type="file"
            // NO accept filter — see image-formats.ts. The dialog resolves
            // it against the OS type registry, which twice hid a format this
            // app reads perfectly well. The server decides instead.
            multiple
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        {busy && !photos.some((p) => p.id === busy) && (
          <span className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> {busy}
          </span>
        )}
        <span className="text-xs text-gray-500">
          JPEG, PNG, WebP, AVIF or HEIC, up to 15 MB. Photos are resized, stripped of location data,
          and
          {hasLogo ? ' watermarked with the logo.' : ' stored as-is.'}
        </span>
      </div>

      {/* Addresses, for the common case: the photos are already on the site
          this one is replacing, and downloading eight of them to upload eight
          of them is work nobody should be doing by hand. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pasted.trim() && !busy) addUrls(pasted)
          }}
          placeholder="or paste image addresses, one per line or comma separated"
          className="flex-1 min-w-[16rem] px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => addUrls(pasted)}
          disabled={!!busy || !pasted.trim()}
          className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Pasted photos are copied onto this site&rsquo;s own storage, not linked — so they survive
        the old site being switched off.
      </p>

      {message && (
        <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}
    </div>
  )
}
