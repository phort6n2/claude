'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, Loader2, Globe, Check, AlertCircle, Sparkles } from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * Editorial content for a client's hosted site. Owns its own load/save
 * against /api/clients/[id]/site-content. The parent supplies callbacks for
 * the two things the importer finds that live on the CLIENT record rather
 * than site content (logo, service areas), so both halves persist in the
 * same autosave — a separate save step is how imported data used to get lost.
 */

interface SitePhotoRow {
  url: string
  alt: string
  pool: 'GALLERY' | 'BODY'
}

interface FaqRow {
  q: string
  a: string
}

interface BulletRow {
  lead: string
  text: string
}

interface ChapterRow {
  heading: string
  body: string
  photoUrl: string
}

/**
 * Editorial content for the hosted site: warranty, FAQ, hero bullets, footer
 * blurb and the registration line. Every section on the site backed by this
 * data disappears when its content is empty — so an untouched editor simply
 * means a leaner site, never a broken one.
 *
 * NOT photos. There is one photo editor and it is the photo manager above
 * this card; a second list here wrote the whole table on every autosave from
 * a snapshot loaded on page load, so a reorder or a hero change made in the
 * manager was silently reverted by the next keystroke down here. The state
 * survives only to carry what an import finds through to its first save.
 */
export default function SiteContentEditor({
  clientId,
  onLogoFound,
  onAreasFound,
  persistClientFields,
}: {
  clientId: string
  onLogoFound?: (url: string) => void
  onAreasFound?: (areas: string[]) => void
  /**
   * Persists the fields the importer finds that live on the CLIENT record
   * (logo, service areas). Called as part of THIS editor's autosave so one
   * write commits everything the import produced — a separate save step is
   * exactly how imported data used to be lost. Must be a no-op when there is
   * nothing pending, because autosave calls it on every write.
   */
  persistClientFields?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Import feedback lives apart from save status: the found-items summary is
  // worth reading for longer than the 1.2s before autosave would replace it.
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saveStatus, setSaveStatus] = useState<{ kind: 'saved' | 'warning' | 'error'; text: string } | null>(null)
  const [importUrl, setImportUrl] = useState('')
  // The escape hatch for a site that refuses this app's server. Opened
  // automatically when a fetch is blocked, since that is the moment it is
  // the answer rather than clutter.
  const [pastedHtml, setPastedHtml] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  /** Which button is spinning, so only that one shows its progress. */
  const [importSource, setImportSource] = useState<'fetch' | 'paste'>('fetch')
  const [importing, setImporting] = useState(false)
  const [warrantyTitle, setWarrantyTitle] = useState('')
  const [warrantyText, setWarrantyText] = useState('')
  const [expandingWarranty, setExpandingWarranty] = useState(false)
  const [expandError, setExpandError] = useState<string | null>(null)

  async function expandWarranty() {
    setExpandingWarranty(true)
    setExpandError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/expand-warranty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: warrantyTitle, text: warrantyText }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'Could not expand it'))
      const data = await res.json()
      if (typeof data.text === 'string' && data.text.trim()) setWarrantyText(data.text.trim())
    } catch (err) {
      setExpandError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setExpandingWarranty(false)
    }
  }
  const [footerBlurb, setFooterBlurb] = useState('')
  const [registrationName, setRegistrationName] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [faq, setFaq] = useState<FaqRow[]>([])
  const [bullets, setBullets] = useState<BulletRow[]>([])
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [photos, setPhotos] = useState<SitePhotoRow[]>([])

  useEffect(() => {
    fetch(`/api/clients/${clientId}/site-content`)
      .then((res) => res.json())
      .then((data) => {
        const c = data.content
        if (c) {
          setWarrantyTitle(c.warrantyTitle || '')
          setWarrantyText(c.warrantyText || '')
          setFooterBlurb(c.footerBlurb || '')
          setRegistrationName(c.registrationName || '')
          setRegistrationNumber(c.registrationNumber || '')
          setFaq(Array.isArray(c.faq) ? c.faq : [])
          setBullets(Array.isArray(c.heroBullets) ? c.heroBullets : [])
          setChapters(Array.isArray(c.chapters) ? c.chapters : [])
        }
        if (Array.isArray(data.photos)) setPhotos(data.photos)
        // Seed the import field with the site Google knows about, but never
        // stamp over something already typed.
        if (data.websiteUrl) setImportUrl((prev) => prev || data.websiteUrl)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  // ---- Autosave. No save button: edits debounce ~1.2s then PUT the whole
  // document. Refs rather than closures throughout, so a save that fires
  // after further typing writes what is on screen, not what was on screen
  // when the timer was armed.
  const payload = {
    warrantyTitle,
    warrantyText,
    footerBlurb,
    registrationName,
    registrationNumber,
    faq,
    heroBullets: bullets,
    chapters,
    photos,
  }
  const payloadRef = useRef(payload)
  payloadRef.current = payload
  const snapshot = JSON.stringify(payload)
  // null = still hydrating; the first post-load render records the baseline
  // instead of saving it back, so loading a client never counts as an edit.
  const lastSavedRef = useRef<string | null>(null)
  const persistRef = useRef(persistClientFields)
  persistRef.current = persistClientFields
  const savingRef = useRef(false)
  const queuedRef = useRef(false)
  // True only between an import landing photos in state and the save that
  // persists them. Nothing else in this editor may write the photo table.
  const importedPhotosRef = useRef(false)

  async function saveNow() {
    if (savingRef.current) {
      queuedRef.current = true
      return
    }
    savingRef.current = true
    setSaving(true)
    const snap = JSON.stringify(payloadRef.current)
    // Photos travel ONLY on the save that follows an import. They are owned by
    // the photo manager above, which writes them one at a time through
    // /photos — so sending this editor's copy on every autosave meant a list
    // loaded minutes ago overwrote a reorder or a hero change made since, and
    // it did it silently. `photos` absent leaves them untouched server-side.
    const { photos: importedPhotos, ...rest } = payloadRef.current
    const body = importedPhotosRef.current ? { ...rest, photos: importedPhotos } : rest
    try {
      // Client-record fields first: if this fails the operator must know
      // before we report success on the content half.
      if (persistRef.current) await persistRef.current()
      const res = await fetch(`/api/clients/${clientId}/site-content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        importedPhotosRef.current = false
        lastSavedRef.current = snap
        setSaveStatus(
          data.warning
            ? { kind: 'warning', text: data.warning }
            : { kind: 'saved', text: 'Saved — the site updates within about 5 minutes.' }
        )
      } else {
        setSaveStatus({ kind: 'error', text: data.error || 'Failed to save' })
      }
    } catch {
      setSaveStatus({ kind: 'error', text: 'Failed to save — your edits are still here, keep typing to retry.' })
    } finally {
      savingRef.current = false
      setSaving(false)
      // Edits landed mid-flight: save again so the screen and the database
      // agree before the operator walks away.
      if (queuedRef.current) {
        queuedRef.current = false
        if (JSON.stringify(payloadRef.current) !== lastSavedRef.current) void saveNow()
      }
    }
  }

  useEffect(() => {
    if (loading) return
    if (lastSavedRef.current === null) {
      lastSavedRef.current = snapshot
      return
    }
    if (snapshot === lastSavedRef.current) return
    const timer = setTimeout(() => void saveNow(), 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, loading])

  /**
   * `source` is explicit rather than inferred from whether the paste box
   * happens to hold something: two buttons, two behaviours, no guessing
   * about which one a press meant.
   */
  async function importFromSite(source: 'fetch' | 'paste' = 'fetch') {
    if (!importUrl.trim() || importing) return
    if (source === 'paste' && !pastedHtml.trim()) return
    setImporting(true)
    setImportSource(source)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/import-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: importUrl,
          ...(source === 'paste' ? { html: pastedHtml } : {}),
        }),
      })
      // errorFrom, because a platform timeout answers with an HTML page and
      // res.json() on that throws — the admin then saw "Import failed" with
      // no hint the function simply ran out of time.
      if (!res.ok) {
        const text = await errorFrom(res, 'Import failed')
        // A block is not a dead end — it is the one failure the paste box
        // solves, so open it rather than leaving the admin to find it.
        if (/refused the request|blocking automated|did not respond/i.test(text)) {
          setShowPaste(true)
        }
        setMessage({ ok: false, text })
        return
      }
      const data = await res.json()
      const d = data.draft
      if (d.warrantyTitle) setWarrantyTitle(d.warrantyTitle)
      if (d.warrantyText) setWarrantyText(d.warrantyText)
      if (d.footerBlurb) setFooterBlurb(d.footerBlurb)
      if (Array.isArray(d.faq) && d.faq.length) setFaq(d.faq)
      if (Array.isArray(d.heroBullets) && d.heroBullets.length) setBullets(d.heroBullets)
      if (Array.isArray(d.chapters) && d.chapters.length) setChapters(d.chapters)
      if (Array.isArray(d.photos) && d.photos.length) {
        setPhotos(d.photos)
        importedPhotosRef.current = true
      }
      setPastedHtml('')
      if (d.logoUrl && onLogoFound) onLogoFound(d.logoUrl)
      if (Array.isArray(d.serviceAreas) && d.serviceAreas.length && onAreasFound) {
        onAreasFound(d.serviceAreas)
      }
      const found = [
        d.logoUrl ? 'logo' : null,
        d.serviceAreas?.length
          ? `${d.serviceAreas.length} service-area cities`
          : null,
        d.warrantyText ? 'warranty' : null,
        d.chapters?.length ? `${d.chapters.length} story sections` : null,
        d.faq?.length ? `${d.faq.length} FAQs` : null,
        d.heroBullets?.length ? `${d.heroBullets.length} bullets` : null,
        d.photos?.length ? `${d.photos.length} photos` : null,
        d.footerBlurb ? 'footer blurb' : null,
      ].filter(Boolean)
      const warnings = Array.isArray(d.warnings) && d.warnings.length ? ` ${d.warnings.join(' ')}` : ''
      setMessage({
        ok: true,
        text:
          (found.length
            ? `Imported (${found.join(', ')}) from ${d.pagesCrawled.length} page(s). Review below and delete anything wrong — it saves automatically.`
            : `Read ${d.pagesCrawled.length} page(s) but found nothing usable to import.`) + warnings,
      })
    } catch {
      setMessage({ ok: false, text: 'Import failed' })
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <div className="py-4 text-sm text-gray-500">Loading site content…</div>

  const inputCls = 'w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-6 border-t pt-4">
      <h4 className="text-sm font-medium text-gray-900">Site Content</h4>

      {/* Import from existing website */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Import from their current website
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Reads their site (plus warranty/FAQ/about pages) and pre-fills the fields below with
          what it actually says — warranty wording, FAQs, the story. It saves automatically, so
          review the fields after an import and delete anything that reads wrong.
        </p>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="https://theircurrentsite.com"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            disabled={importing}
          />
          <button
            type="button"
            onClick={() => importFromSite('fetch')}
            disabled={importing || !importUrl.trim()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {importing && importSource === 'fetch' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
            {importing && importSource === 'fetch' ? 'Reading site…' : 'Import'}
          </button>
        </div>
        {/* The import's own outcome, which used to be set on every path and
            rendered on none — so a refusal looked like the button simply
            stopping, and a successful import never showed what it found.
            It is deliberately NOT the autosave status line: that one clears
            itself after a moment, and the list of what was imported is worth
            reading for longer than that. */}
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowPaste((v) => !v)}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            {showPaste ? 'Hide the paste box' : "Site blocking us? Paste the page instead"}
          </button>
          {showPaste && (
            <div className="mt-1.5">
              <p className="text-xs text-gray-600 mb-1">
                Some sites (Cloudflare, security plugins) refuse this app&apos;s server while
                opening fine in your browser — that is about our server&apos;s address, not
                anything we can send. Open the site, press{' '}
                <strong>Ctrl/Cmd&nbsp;+&nbsp;U</strong> to view the source, select all, and paste
                it here. Keep the address above filled in: image and link paths are resolved
                against it. Only this one page is read — nothing else is crawled.
              </p>
              <textarea
                className={`${inputCls} font-mono text-[11px]`}
                rows={5}
                spellCheck={false}
                placeholder="Paste the page source here…"
                value={pastedHtml}
                onChange={(e) => setPastedHtml(e.target.value)}
                disabled={importing}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => importFromSite('paste')}
                  disabled={importing || !pastedHtml.trim() || !importUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing && importSource === 'paste' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  {importing && importSource === 'paste' ? 'Reading page…' : 'Import pasted page'}
                </button>
                {pastedHtml.trim() && (
                  <span className="text-xs text-gray-500">
                    {pastedHtml.length.toLocaleString()} characters
                  </span>
                )}
                {pastedHtml.trim() && !importUrl.trim() && (
                  <span className="text-xs text-amber-700">
                    Fill in the address above — image and link paths resolve against it.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {message && (
          <p
            className={`mt-2 mb-0 text-xs flex items-start gap-1.5 ${
              message.ok ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {message.ok ? (
              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <span>{message.text}</span>
          </p>
        )}
      </div>

      {/* Hero bullets */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Hero bullets (replace the generic trust chips; max 4)
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Only claims that are true for this business. No insurer names, no
          certifications they don&apos;t hold, no timing promises they can&apos;t keep.
        </p>
        {bullets.map((b, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              className={inputCls}
              style={{ maxWidth: '220px' }}
              placeholder="Bold lead (e.g. Mobile service at no extra charge)"
              value={b.lead}
              onChange={(e) =>
                setBullets((prev) => prev.map((x, j) => (j === i ? { ...x, lead: e.target.value } : x)))
              }
            />
            <input
              className={inputCls}
              placeholder="rest of the sentence"
              value={b.text}
              onChange={(e) =>
                setBullets((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
            />
            <button
              type="button"
              onClick={() => setBullets((prev) => prev.filter((_, j) => j !== i))}
              className="p-2 text-gray-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {bullets.length < 4 && (
          <button
            type="button"
            onClick={() => setBullets((prev) => [...prev, { lead: '', text: '' }])}
            className="text-sm text-blue-600 font-medium"
          >
            + Add bullet
          </button>
        )}
      </div>

      {/* Editorial chapters */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Story sections (between hero and services; max 5)
        </label>
        <p className="text-xs text-gray-400 mb-2">
          The long-form middle of the site — their history, their approach, what makes them
          different. In the client&apos;s own words and facts only; the importer drafts these from
          their existing site. Blank line = new paragraph. Optional photo shows beside the text.
        </p>
        {chapters.map((ch, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Section heading"
                value={ch.heading}
                onChange={(e) =>
                  setChapters((prev) => prev.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))
                }
              />
              <button
                type="button"
                onClick={() => setChapters((prev) => prev.filter((_, j) => j !== i))}
                className="p-2 text-gray-400 hover:text-red-600 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className={inputCls}
              rows={4}
              placeholder="Section text — 1-3 short paragraphs"
              value={ch.body}
              onChange={(e) =>
                setChapters((prev) => prev.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))
              }
            />
            <input
              className={inputCls}
              placeholder="Photo URL (optional, https)"
              value={ch.photoUrl}
              onChange={(e) =>
                setChapters((prev) => prev.map((x, j) => (j === i ? { ...x, photoUrl: e.target.value } : x)))
              }
            />
          </div>
        ))}
        {chapters.length < 5 && (
          <button
            type="button"
            onClick={() => setChapters((prev) => [...prev, { heading: '', body: '', photoUrl: '' }])}
            className="text-sm text-blue-600 font-medium"
          >
            + Add section
          </button>
        )}
      </div>

      {/* Warranty */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Warranty</label>
        <p className="text-xs text-gray-400 mb-2">
          Shown as its own band, always with the full terms beside the claim. Leave
          empty to omit the band entirely — never advertise a warranty without
          defining it.
        </p>
        <input
          className={`${inputCls} mb-2`}
          placeholder='Title, e.g. "Lifetime Workmanship Warranty"'
          value={warrantyTitle}
          onChange={(e) => setWarrantyTitle(e.target.value)}
        />
        <textarea
          className={inputCls}
          rows={3}
          placeholder="The full warranty terms, in the client's own words…"
          value={warrantyText}
          onChange={(e) => setWarrantyText(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={expandWarranty}
            disabled={expandingWarranty || (!warrantyText.trim() && !warrantyTitle.trim())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {expandingWarranty ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Expand into full terms
          </button>
          <span className="text-xs text-gray-400">
            Rewrites what&apos;s typed into plain terms — it never adds durations or coverage the
            shop didn&apos;t state. Read it before you move on.
          </span>
        </div>
        {expandError && <p className="text-xs text-red-600 mt-1">{expandError}</p>}
      </div>

      {/* FAQ */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">FAQ (max 12)</label>
        {faq.map((f, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Question"
                value={f.q}
                onChange={(e) =>
                  setFaq((prev) => prev.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))
                }
              />
              <button
                type="button"
                onClick={() => setFaq((prev) => prev.filter((_, j) => j !== i))}
                className="p-2 text-gray-400 hover:text-red-600 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className={inputCls}
              rows={2}
              placeholder="Answer"
              value={f.a}
              onChange={(e) =>
                setFaq((prev) => prev.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
              }
            />
          </div>
        ))}
        {faq.length < 12 && (
          <button
            type="button"
            onClick={() => setFaq((prev) => [...prev, { q: '', a: '' }])}
            className="text-sm text-blue-600 font-medium"
          >
            + Add question
          </button>
        )}
      </div>

      {/* Footer + registration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Footer blurb</label>
          <input
            className={inputCls}
            placeholder="One sentence about the business"
            value={footerBlurb}
            onChange={(e) => setFooterBlurb(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Registered name</label>
            <input
              className={inputCls}
              placeholder="Exactly as registered"
              value={registrationName}
              onChange={(e) => setRegistrationName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Registration #</label>
            <input
              className={inputCls}
              placeholder="e.g. ARD 123456"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Autosave status. Sticky so the operator can see a failed save from
          anywhere in this long form — a silent failure at the bottom of an
          off-screen footer is a lost afternoon of edits. */}
      <div className="sticky bottom-0 -mx-6 px-6 py-2 bg-white/95 border-t border-gray-100 flex items-center gap-2 text-sm">
        {saving ? (
          <span className="flex items-center gap-1.5 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </span>
        ) : saveStatus ? (
          <span
            className={`flex items-center gap-1.5 ${
              saveStatus.kind === 'saved'
                ? 'text-green-600'
                : saveStatus.kind === 'warning'
                  ? 'text-amber-600'
                  : 'text-red-600'
            }`}
          >
            {saveStatus.kind === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saveStatus.text}
          </span>
        ) : (
          <span className="text-gray-400">Changes save automatically.</span>
        )}
      </div>
    </div>
  )
}

/**
 * Manages a client's outbound webhook destinations. CRUD is immediate (own API
 * calls), independent of the main Save button.
 */
