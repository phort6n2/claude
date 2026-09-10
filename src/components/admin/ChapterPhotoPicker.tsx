'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ImageOff, Images, Loader2 } from 'lucide-react'

interface PhotoRow {
  id: string
  url: string
  alt: string
  pool: string
}

/**
 * Is this file on our own storage, or somebody else's server?
 *
 * Inline rather than shared: the server has its own copy of this question in
 * photo-mirror, and giving a client component a path into that module would
 * pull sharp and the Blob SDK into the browser bundle to answer one string
 * comparison.
 */
function isHostedHere(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.blob.vercel-storage.com')
  } catch {
    return false
  }
}

/**
 * Choose the photo for a content section, from the ones already uploaded.
 *
 * WHAT THIS REPLACES, and why it mattered. The field was a bare "Photo URL
 * (optional, https)" text box, so a section's image was a string with no
 * relationship to the client's photo library at all. The importer fills it in
 * with whatever it found on the shop's existing site, and NOTHING afterwards
 * connects the two: deleting every photo in the manager above leaves those
 * sections rendering exactly as before, because the manager owns rows in a
 * table and this owns a URL in a JSON column. A shop owner who has just
 * replaced all their photos and watched the old ones stay put has no way to
 * tell that those are two different things, and no way from this screen to
 * pick one of the photos they did upload.
 *
 * NorthStar is the case: four sections still pulling images off the Wix site
 * this platform replaced — and pulling THUMBNAILS, 82 to 187 pixels wide,
 * because those were the crops on the page the importer read. They also
 * vanish the day that Wix site is switched off, which is the week the new one
 * goes live.
 *
 * It still accepts a pasted address, because an image that is not in the
 * library is a real case and taking the option away would be a downgrade.
 * What it adds is the library, and a warning on anything hosted elsewhere.
 *
 * It reads photos and never writes them. The manager above owns that table —
 * a second thing writing photo rows from a snapshot is a bug this file's
 * parent already carries a comment about — and choosing here only ever sets
 * a string on the chapter.
 */
export default function ChapterPhotoPicker({
  clientId,
  value,
  onChange,
}: {
  clientId: string
  value: string
  onChange: (url: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null)
  const [pasting, setPasting] = useState(false)

  /**
   * Fetched when the picker is OPENED, not once on mount.
   *
   * The parent loads its own copy of the photo list on page load, and the
   * whole reason somebody is here is that they have just uploaded new
   * photos — a list captured before that upload is a picker that cannot
   * offer the very files it exists to offer.
   */
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/photos`)
      const data = await res.json()
      setPhotos(Array.isArray(data.photos) ? data.photos : [])
    } catch {
      setPhotos([])
    }
  }, [clientId])

  useEffect(() => {
    if (open && photos === null) load()
  }, [open, photos, load])

  const foreign = !!value && !isHostedHere(value)

  return (
    <div className="rounded-lg border border-gray-200 p-2.5 space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-14 w-20 shrink-0 rounded object-cover bg-gray-100"
          />
        ) : (
          <span className="h-14 w-20 shrink-0 rounded bg-gray-100 grid place-items-center text-gray-400">
            <ImageOff className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-700 m-0">
            {value ? 'Section photo' : 'No photo chosen'}
          </p>
          <p className="text-[11px] text-gray-500 m-0 truncate">
            {value || 'The site uses the next gallery photo, or no photo at all.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v)
            // Reopening after an upload has to re-ask, or the picker keeps
            // showing the library as it stood the first time it was opened.
            if (!open) setPhotos(null)
          }}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium hover:bg-gray-50"
        >
          <Images className="h-3.5 w-3.5" />
          {open ? 'Close' : 'Choose'}
        </button>
      </div>

      {foreign && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 m-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            This is loaded from another site, not from here — it disappears if that site is
            switched off. Choose one of the uploaded photos instead.
          </span>
        </p>
      )}

      {open && (
        <div className="space-y-2 border-t border-gray-100 pt-2">
          {photos === null ? (
            <p className="flex items-center gap-2 text-xs text-gray-500 m-0">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading photos…
            </p>
          ) : photos.length === 0 ? (
            <p className="text-xs text-gray-500 m-0">
              No photos uploaded yet — add them in Photos above, then choose one here.
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {/* "None" is a real choice, not the absence of one: it hands the
                  section back to the gallery fallback, which is what an
                  operator wants after clearing an imported image. */}
              <button
                type="button"
                onClick={() => onChange('')}
                className={`aspect-[4/3] rounded grid place-items-center text-[10px] font-medium border-2 ${
                  value ? 'border-gray-200 text-gray-500' : 'border-blue-600 text-blue-700'
                }`}
              >
                None
              </button>
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => onChange(photo.url)}
                  title={photo.alt || photo.pool}
                  className={`aspect-[4/3] overflow-hidden rounded border-2 ${
                    value === photo.url ? 'border-blue-600' : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.alt} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {pasting ? (
            <input
              autoFocus
              className="w-full px-2 py-1.5 border rounded text-xs"
              placeholder="https://…"
              defaultValue={value}
              onBlur={(e) => {
                onChange(e.target.value.trim())
                setPasting(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setPasting(false)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="text-xs text-blue-600 font-medium"
            >
              or paste an address
            </button>
          )}
        </div>
      )}
    </div>
  )
}
