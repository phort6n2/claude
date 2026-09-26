'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, Trash2, Upload } from 'lucide-react'
import { LOGO_FORMATS_SENTENCE } from '@/lib/image-formats'

/**
 * The two logos the site draws, set by hand when the importer's guess was
 * wrong or there was nothing to guess from.
 *
 * The importer scores logo candidates and returns nothing rather than risk
 * shipping a partner's badge as the shop's — which is right, and leaves a
 * shop with no logo at all. This is the way out of that, and the way to
 * correct it when the score picked wrong.
 *
 * Two slots because the footer band is dark. Most shop logos are dark ink on
 * transparency, so the one file that looks right in the header vanishes in
 * the footer. The footer slot is optional and falls back to the header's, so
 * a logo that works on both backgrounds is still one upload.
 *
 * Autosaves, like the other newer cards: each preview flips as soon as the
 * server answers, and there is no save button to leave unpressed.
 */
export interface HeaderState {
  /** The operator's override; null follows the logo. */
  headerTheme: string | null
  /** What the site draws now. */
  headerDark: boolean
  /** The measured reading for the CURRENT logo file, or null if none yet. */
  detected: string | null
}

export default function LogoCard({
  clientId,
  headerLogoUrl,
  footerLogoUrl,
  businessName,
  header: initialHeader,
}: {
  clientId: string
  headerLogoUrl: string | null
  footerLogoUrl: string | null
  businessName: string
  header: HeaderState
}) {
  const [urls, setUrls] = useState<Record<Slot, string | null>>({
    header: headerLogoUrl,
    footer: footerLogoUrl,
  })
  const [header, setHeader] = useState<HeaderState>(initialHeader)
  const [themeBusy, setThemeBusy] = useState(false)
  const [busy, setBusy] = useState<Slot | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  async function send(slot: Slot, init: RequestInit, query = '') {
    setBusy(slot)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/logo${query}`, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save that.')
      setUrls((prev) => ({ ...prev, [slot]: data.url ?? null }))
      if (data.header) setHeader(data.header)
      // The photo card reads the logo too — it is what watermarks an upload —
      // and says "no logo set" until this page is re-rendered.
      router.refresh()
      setMessage(
        data.warning
          ? { ok: false, text: data.warning }
          : { ok: true, text: 'Saved. The site updates within about 5 minutes.' }
      )
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save that.' })
    } finally {
      setBusy(null)
    }
  }

  const upload = (slot: Slot, file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('slot', slot)
    return send(slot, { method: 'POST', body: form })
  }

  const setFromUrl = (slot: Slot, url: string) =>
    send(slot, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, url }),
    })

  const clear = (slot: Slot) => send(slot, { method: 'DELETE' }, `?slot=${slot}`)

  // Optimistic, like the other autosaving cards: the preview flips at once
  // and comes back if the save fails.
  async function setTheme(choice: 'auto' | 'light' | 'dark') {
    const before = header
    const headerTheme = choice === 'auto' ? null : choice
    setHeader({
      ...header,
      headerTheme,
      headerDark: headerTheme ? headerTheme === 'dark' : header.detected === 'dark',
    })
    setThemeBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/logo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headerTheme: choice }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save that.')
      if (data.header) setHeader(data.header)
      setMessage({ ok: true, text: 'Saved. The site updates within about 5 minutes.' })
    } catch (err) {
      setHeader(before)
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save that.' })
    } finally {
      setThemeBusy(false)
    }
  }

  const choice = header.headerTheme === 'light' || header.headerTheme === 'dark' ? header.headerTheme : 'auto'
  const detectedLabel =
    header.detected === 'dark'
      ? 'this logo is drawn for a dark background'
      : header.detected === 'light'
        ? 'this logo reads on white'
        : urls.header
          ? 'not measured yet — white until it is'
          : 'no logo'

  return (
    <div className="p-6 pt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <LogoSlot
          slot="header"
          title="Header logo"
          hint={
            header.headerDark
              ? 'Drawn on a dark header, at the top of every page.'
              : 'Drawn on white, at the top of every page.'
          }
          url={urls.header}
          onDark={header.headerDark}
          busy={busy === 'header'}
          onUpload={upload}
          onUrl={setFromUrl}
          onClear={clear}
          businessName={businessName}
        />
        <LogoSlot
          slot="footer"
          title="Footer logo"
          hint="Optional. Only for a logo that disappears on the dark footer — a white or knocked-out version. Empty uses the header logo."
          url={urls.footer}
          fallback={urls.header}
          onDark
          busy={busy === 'footer'}
          onUpload={upload}
          onUrl={setFromUrl}
          onClear={clear}
          businessName={businessName}
        />
      </div>
      {/* WHICH HEADER. Automatic reads the logo's pixels when it is saved: a
          logo drawn for a dark background — white lettering on transparency —
          gets a dark header, because on white it simply is not there. The
          buttons exist for the case the measurement gets wrong. */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Header background</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Automatic: {detectedLabel}
              {choice === 'auto' && urls.header ? ` — so the header is ${header.headerDark ? 'dark' : 'white'}.` : '.'}
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Header background"
            className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-0.5"
          >
            {(['auto', 'light', 'dark'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={choice === opt}
                disabled={themeBusy}
                onClick={() => choice !== opt && setTheme(opt)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-60 ${
                  choice === opt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {opt === 'auto' ? 'Automatic' : opt === 'light' ? 'White' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {message && (
        <p className={`text-sm flex items-start gap-1.5 ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
          {message.ok ? (
            <Check className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          {message.text}
        </p>
      )}
    </div>
  )
}

type Slot = 'header' | 'footer'

function LogoSlot({
  slot,
  title,
  hint,
  url,
  fallback,
  onDark,
  busy,
  onUpload,
  onUrl,
  onClear,
  businessName,
}: {
  slot: Slot
  title: string
  hint: string
  url: string | null
  /** Shown greyed when this slot is empty but something else stands in. */
  fallback?: string | null
  onDark?: boolean
  busy: boolean
  onUpload: (slot: Slot, file: File) => void
  onUrl: (slot: Slot, url: string) => void
  onClear: (slot: Slot) => void
  businessName: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pasted, setPasted] = useState('')
  // A pasted address that 404s draws an empty box, which reads as "saved
  // fine" — the one outcome the paste path most needs to report.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const shown = url || fallback || null
  // Keyed on the address, not a bare flag: setting a new one has to clear the
  // last one's failure, and the <img> that would report success is the very
  // thing a bare flag stops rendering.
  const broken = !!shown && brokenUrl === shown

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
      </div>

      {/* The preview stands on the background the site will actually draw it
          on. A logo checked against white and then dropped on the dark band
          is how an invisible footer logo gets signed off. */}
      <div
        className={`h-24 rounded-lg border flex items-center justify-center px-3 ${
          onDark ? 'bg-[#0f172a] border-gray-700' : 'bg-white border-gray-200'
        }`}
      >
        {shown && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            onError={() => setBrokenUrl(shown)}
            onLoad={() => setBrokenUrl(null)}
            className={`max-h-16 max-w-full object-contain ${url ? '' : 'opacity-60'}`}
          />
        ) : shown ? (
          <span className="text-xs text-red-600">That address did not load an image.</span>
        ) : (
          <span className="text-xs text-gray-400">
            No logo — the site draws a wordmark from &ldquo;{businessName}&rdquo;
          </span>
        )}
      </div>
      {!url && fallback && (
        <p className="text-xs text-gray-500">Showing the header logo, which is what the site uses.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          // NO accept filter — see image-formats.ts. This input is where the
          // problem was first reported, twice.
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Cleared so picking the same file twice fires again — after a
            // failed upload that is exactly what someone does.
            e.target.value = ''
            if (file) onUpload(slot, file)
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </button>
        {url && (
          <button
            type="button"
            onClick={() => onClear(slot)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        )}
      </div>

      {/* Named on the card, not only in the failure message: a format that is
          accepted but never mentioned gets converted to PNG by hand first, or
          not tried at all. */}
      <p className="text-xs text-gray-500">
        {LOGO_FORMATS_SENTENCE}, stored as PNG so transparency survives.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="or paste an image address"
          className="flex-1 min-w-0 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => {
            if (!pasted.trim()) return
            onUrl(slot, pasted.trim())
            setPasted('')
          }}
          disabled={busy || !pasted.trim()}
          className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Use
        </button>
      </div>
    </div>
  )
}
