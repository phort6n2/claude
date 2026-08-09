'use client'

import { useState, useEffect } from 'react'
import { Trash2, Loader2, Globe, Save } from 'lucide-react'

/**
 * Editorial content for a client's hosted site. Owns its own load/save
 * against /api/clients/[id]/site-content. The parent supplies callbacks for
 * the two things the importer finds that live on the CLIENT record rather
 * than site content (logo, service areas), so the parent can save them in the
 * same action — a second save button is how imported data used to get lost.
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
 * blurb, registration line, and photo URLs. Every section on the site backed
 * by this data disappears when its content is empty — so an untouched editor
 * simply means a leaner site, never a broken one.
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
   * (logo, service areas). Called as part of THIS editor's save so one button
   * commits everything the import produced — a second save button is exactly
   * how imported data used to be lost.
   */
  persistClientFields?: () => Promise<void>
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [warrantyTitle, setWarrantyTitle] = useState('')
  const [warrantyText, setWarrantyText] = useState('')
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
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [clientId])

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      // Client-record fields first: if this fails the operator must know
      // before we report success on the content half.
      if (persistClientFields) await persistClientFields()
      const res = await fetch(`/api/clients/${clientId}/site-content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warrantyTitle,
          warrantyText,
          footerBlurb,
          registrationName,
          registrationNumber,
          faq,
          heroBullets: bullets,
          chapters,
          photos,
        }),
      })
      const data = await res.json()
      setMessage(
        res.ok
          ? {
              ok: !data.warning,
              text: data.warning || 'Saved — the site updates within about 5 minutes.',
            }
          : { ok: false, text: data.error || 'Failed to save' }
      )
    } catch {
      setMessage({ ok: false, text: 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  async function importFromSite() {
    if (!importUrl.trim() || importing) return
    setImporting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/import-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ ok: false, text: data.error || 'Import failed' })
        return
      }
      const d = data.draft
      if (d.warrantyTitle) setWarrantyTitle(d.warrantyTitle)
      if (d.warrantyText) setWarrantyText(d.warrantyText)
      if (d.footerBlurb) setFooterBlurb(d.footerBlurb)
      if (Array.isArray(d.faq) && d.faq.length) setFaq(d.faq)
      if (Array.isArray(d.heroBullets) && d.heroBullets.length) setBullets(d.heroBullets)
      if (Array.isArray(d.chapters) && d.chapters.length) setChapters(d.chapters)
      if (Array.isArray(d.photos) && d.photos.length) setPhotos(d.photos)
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
            ? `Imported draft (${found.join(', ')}) from ${d.pagesCrawled.length} page(s). Review below — nothing is live until you Save.`
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
          what it actually says — photos, warranty wording, FAQs. Everything lands here as a
          draft for you to review; nothing goes live until you hit Save.
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
            onClick={importFromSite}
            disabled={importing || !importUrl.trim()}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            {importing ? 'Reading site…' : 'Import'}
          </button>
        </div>
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

      {/* Photos */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Photos (https image URLs — real photos of this business only)
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Gallery photos build the &quot;Our Work&quot; grid (6 looks best). Body photos
          appear beside the text on service pages. Stock photography reads as fake
          and costs more trust than the polish gains.
        </p>
        {photos.map((photo, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              className={inputCls}
              placeholder="https://…/photo.jpg"
              value={photo.url}
              onChange={(e) =>
                setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
              }
            />
            <input
              className={inputCls}
              style={{ maxWidth: '200px' }}
              placeholder="Description (alt text)"
              value={photo.alt}
              onChange={(e) =>
                setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))
              }
            />
            <select
              className={`${inputCls}`}
              style={{ maxWidth: '110px' }}
              value={photo.pool}
              onChange={(e) =>
                setPhotos((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, pool: e.target.value as 'GALLERY' | 'BODY' } : x))
                )
              }
            >
              <option value="GALLERY">Gallery</option>
              <option value="BODY">Body</option>
            </select>
            <button
              type="button"
              onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              className="p-2 text-gray-400 hover:text-red-600 shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {photos.length < 24 && (
          <button
            type="button"
            onClick={() => setPhotos((prev) => [...prev, { url: '', alt: '', pool: 'GALLERY' }])}
            className="text-sm text-blue-600 font-medium"
          >
            + Add photo
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Site Content
        </button>
        {message && (
          <span className={`text-sm ${message.ok ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Manages a client's outbound webhook destinations. CRUD is immediate (own API
 * calls), independent of the main Save button.
 */
