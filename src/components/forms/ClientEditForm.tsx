'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import {
  ChevronDown,
  ChevronRight,
  Building2,
  MapPin,
  Palette,
  Save,
  Loader2,
  Check,
  AlertCircle,
  Search,
  Users,
  Copy,
  Webhook,
  PhoneCall,
  Send,
  Plus,
  Trash2,
  Globe,
  Star,
} from 'lucide-react'

interface PlacePrediction {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

interface ClientData {
  id: string
  slug?: string
  businessName: string
  contactPerson: string | null
  phone: string
  email: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  country: string
  googlePlaceId: string | null
  googleMapsUrl: string | null
  hasShopLocation: boolean
  offersMobileService: boolean
  // Services offered
  offersWindshieldRepair: boolean
  offersWindshieldReplacement: boolean
  offersSideWindowRepair: boolean
  offersBackWindowRepair: boolean
  offersSunroofRepair: boolean
  offersRockChipRepair: boolean
  offersAdasCalibration: boolean
  serviceAreas: string[]
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  timezone: string
  // Browser origins allowed to POST leads directly to the webhook (CORS)
  allowedOrigins: string[]
  // Short subdomain for the hosted site (collision → collision.glassleads.app)
  siteSubdomain?: string | null
  // Call Coaching feature toggle
  callCoachingEnabled?: boolean
}

interface ClientEditFormProps {
  client?: ClientData | null
}

// Default values for a new client
const defaultClientData: ClientData = {
  id: '',
  businessName: '',
  contactPerson: null,
  phone: '',
  email: '',
  streetAddress: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  googlePlaceId: null,
  googleMapsUrl: null,
  hasShopLocation: true,
  offersMobileService: false,
  offersWindshieldRepair: true,
  offersWindshieldReplacement: true,
  offersSideWindowRepair: false,
  offersBackWindowRepair: false,
  offersSunroofRepair: false,
  offersRockChipRepair: true,
  offersAdasCalibration: false,
  serviceAreas: [],
  logoUrl: null,
  primaryColor: '#1e40af',
  secondaryColor: '#3b82f6',
  accentColor: '#f59e0b',
  timezone: 'America/Denver',
  allowedOrigins: [],
  callCoachingEnabled: true,
}

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
]

type SectionKey = 'business' | 'location' | 'branding' | 'website' | 'leadForwarding' | 'callCoaching'

interface WebhookDestinationRow {
  id: string
  label: string
  url: string
  enabled: boolean
  lastDelivery: {
    status: 'PENDING' | 'SUCCESS' | 'FAILED'
    attempts: number
    responseStatus: number | null
    lastError: string | null
    lastAttemptAt: string | null
    createdAt: string
  } | null
}

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
function SiteContentEditor({
  clientId,
  onLogoFound,
  onAreasFound,
}: {
  clientId: string
  onLogoFound?: (url: string) => void
  onAreasFound?: (areas: string[]) => void
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
              text: data.warning || 'Site content saved — live within about 5 minutes.',
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
        d.logoUrl ? 'logo (set in Branding above — hit the main Save)' : null,
        d.serviceAreas?.length
          ? `${d.serviceAreas.length} service-area cities (merged into Location above — hit the main Save)`
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
function WebhookDestinationsManager({ clientId }: { clientId: string }) {
  const [destinations, setDestinations] = useState<WebhookDestinationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  useEffect(() => {
    fetch(`/api/clients/${clientId}/webhooks`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.destinations)) setDestinations(data.destinations)
        else if (data.error) setError(data.error)
      })
      .catch(() => setError('Failed to load destinations'))
      .finally(() => setLoading(false))
  }, [clientId])

  async function addDestination() {
    if (!newLabel.trim() || !newUrl.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, url: newUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to add destination')
        return
      }
      setDestinations((prev) => [...prev, { ...data, lastDelivery: null }])
      setNewLabel('')
      setNewUrl('')
    } catch {
      setError('Failed to add destination')
    } finally {
      setAdding(false)
    }
  }

  async function toggleDestination(dest: WebhookDestinationRow) {
    setBusyId(dest.id)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks/${dest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !dest.enabled }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update destination')
        return
      }
      setDestinations((prev) =>
        prev.map((d) => (d.id === dest.id ? { ...d, enabled: data.enabled } : d))
      )
    } catch {
      setError('Failed to update destination')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteDestination(dest: WebhookDestinationRow) {
    if (!window.confirm(`Delete "${dest.label}"? New leads will no longer be forwarded there.`)) {
      return
    }
    setBusyId(dest.id)
    setError(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks/${dest.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to delete destination')
        return
      }
      setDestinations((prev) => prev.filter((d) => d.id !== dest.id))
    } catch {
      setError('Failed to delete destination')
    } finally {
      setBusyId(null)
    }
  }

  async function testDestination(dest: WebhookDestinationRow) {
    setBusyId(dest.id)
    setTestResults((prev) => ({ ...prev, [dest.id]: { success: false, message: 'Sending…' } }))
    try {
      const res = await fetch(`/api/clients/${clientId}/webhooks/${dest.id}/test`, {
        method: 'POST',
      })
      const data = await res.json()
      setTestResults((prev) => ({
        ...prev,
        [dest.id]: data.success
          ? { success: true, message: `Delivered (HTTP ${data.responseStatus})` }
          : { success: false, message: data.error || 'Delivery failed' },
      }))
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [dest.id]: { success: false, message: 'Delivery failed' },
      }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-gray-500 text-sm">Loading destinations…</div>
      ) : destinations.length === 0 ? (
        <p className="text-sm text-gray-500">
          No destinations configured. Leads are stored here either way — add a destination
          (like this client&apos;s HighLevel inbound webhook) to have every lead forwarded
          there automatically.
        </p>
      ) : (
        <div className="space-y-3">
          {destinations.map((dest) => {
            const test = testResults[dest.id]
            const last = dest.lastDelivery
            return (
              <div
                key={dest.id}
                className={`p-4 border rounded-lg ${dest.enabled ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-75'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{dest.label}</span>
                      {!dest.enabled && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
                          Disabled
                        </span>
                      )}
                    </div>
                    <code className="block text-xs text-gray-500 truncate mt-1">{dest.url}</code>
                    {last && (
                      <p className="text-xs mt-1">
                        <span
                          className={
                            last.status === 'SUCCESS'
                              ? 'text-green-600'
                              : last.status === 'FAILED'
                                ? 'text-red-600'
                                : 'text-amber-600'
                          }
                        >
                          Last delivery: {last.status.toLowerCase()}
                          {last.responseStatus ? ` (HTTP ${last.responseStatus})` : ''}
                        </span>
                        {last.status === 'FAILED' && last.lastError && (
                          <span className="text-gray-400"> — {last.lastError}</span>
                        )}
                      </p>
                    )}
                    {test && (
                      <p className={`text-xs mt-1 ${test.success ? 'text-green-600' : 'text-red-600'}`}>
                        Test: {test.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => testDestination(dest)}
                      disabled={busyId === dest.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                      title="Send a test payload"
                    >
                      <Send className="h-3 w-3" />
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDestination(dest)}
                      disabled={busyId === dest.id}
                      className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {dest.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDestination(dest)}
                      disabled={busyId === dest.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete destination"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      <div className="border-t pt-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="HighLevel — main workflow"
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Webhook URL (https)</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://services.leadconnectorhq.com/hooks/..."
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={addDestination}
            disabled={adding || !newLabel.trim() || !newUrl.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Use the Test button after adding — it sends a clearly-marked test contact so you can
          confirm it arrives before real leads depend on it.
        </p>
      </div>
    </div>
  )
}

export default function ClientEditForm({ client }: ClientEditFormProps) {
  const router = useRouter()
  const isNewClient = !client?.id
  const [formData, setFormData] = useState<ClientData>(client || defaultClientData)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['business', 'location', 'branding', 'website', 'leadForwarding', 'callCoaching'])
  )
  const [reviewsMessage, setReviewsMessage] = useState<string | null>(null)

  // Subdomain provisioning state
  const [subdomainInput, setSubdomainInput] = useState(client?.siteSubdomain || '')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionMessage, setProvisionMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function connectSubdomain() {
    if (!subdomainInput.trim() || isNewClient) return
    setProvisioning(true)
    setProvisionMessage(null)
    try {
      const res = await fetch(`/api/clients/${client!.id}/provision-subdomain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: subdomainInput }),
      })
      const data = await res.json()
      if (data.error) {
        setProvisionMessage({ ok: false, text: data.error })
      } else {
        const failed = (data.steps || []).filter((s: { ok: boolean }) => !s.ok)
        setProvisionMessage(
          data.ok
            ? { ok: true, text: `Connected — https://${data.domain} will be live within a few minutes.` }
            : {
                ok: false,
                text: failed
                  .map((s: { step: string; detail: string }) => `${s.step}: ${s.detail}`)
                  .join(' · '),
              }
        )
      }
    } catch {
      setProvisionMessage({ ok: false, text: 'Provisioning failed' })
    } finally {
      setProvisioning(false)
    }
  }

  // Google Places search state
  const [placeSearch, setPlaceSearch] = useState('')
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([])
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false)
  const [showPredictions, setShowPredictions] = useState(false)
  const [placeSelected, setPlaceSelected] = useState(false)

  // Place search with debounce
  useEffect(() => {
    if (!placeSearch || placeSearch.length < 3 || placeSelected) {
      setPlacePredictions([])
      return
    }

    const timer = setTimeout(async () => {
      setPlaceSearchLoading(true)
      try {
        const response = await fetch(`/api/integrations/google-places/search?query=${encodeURIComponent(placeSearch)}`)
        const data = await response.json()
        if (data.predictions) {
          setPlacePredictions(data.predictions)
          setShowPredictions(true)
        }
      } catch (err) {
        console.error('Place search error:', err)
      } finally {
        setPlaceSearchLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [placeSearch, placeSelected])

  async function selectPlace(prediction: PlacePrediction) {
    setPlaceSearchLoading(true)
    setShowPredictions(false)
    setPlaceSelected(true)

    try {
      const response = await fetch(`/api/integrations/google-places/details?placeId=${prediction.placeId}`)
      const details = await response.json()

      if (!response.ok) {
        console.error('Failed to fetch place details:', details.error)
        return
      }

      // Update form with place details
      setFormData((prev) => ({
        ...prev,
        businessName: details.businessName || prev.businessName,
        phone: details.phone || prev.phone,
        streetAddress: details.streetAddress || prev.streetAddress,
        city: details.city || prev.city,
        state: details.state || prev.state,
        postalCode: details.postalCode || prev.postalCode,
        googlePlaceId: details.placeId,
        googleMapsUrl: details.googleMapsUrl,
      }))

      setPlaceSearch(details.businessName)
    } catch (err) {
      console.error('Error fetching place details:', err)
    } finally {
      setPlaceSearchLoading(false)
    }
  }

  function clearPlaceSelection() {
    setPlaceSearch('')
    setPlaceSelected(false)
    setPlacePredictions([])
    setFormData((prev) => ({
      ...prev,
      googlePlaceId: null,
      googleMapsUrl: null,
    }))
  }

  function toggleSection(section: SectionKey) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  function updateField<K extends keyof ClientData>(field: K, value: ClientData[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      // Determine the API endpoint and method
      const url = isNewClient ? '/api/clients' : `/api/clients/${client!.id}`
      const method = isNewClient ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }

      const clientData = await response.json()
      const clientId = clientData.id || client?.id

      if (isNewClient) {
        // Redirect to the new client's edit page
        router.push(`/admin/clients/${clientId}`)
      } else {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function SectionHeader({
    section,
    icon: Icon,
    title,
    subtitle,
  }: {
    section: SectionKey
    icon: React.ElementType
    title: string
    subtitle: string
  }) {
    const isExpanded = expandedSections.has(section)
    return (
      <button
        onClick={() => toggleSection(section)}
        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-all border-b border-gray-100"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400" />
        )}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sticky Save Bar */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-lg rounded-2xl -mx-2 px-6 py-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {isNewClient ? 'New Client' : formData.businessName || 'Edit Client'}
              </h1>
              {saveSuccess && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="h-4 w-4" /> Changes saved successfully
                </span>
              )}
              {error && (
                <span className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {error}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push('/admin/clients')}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isNewClient ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isNewClient ? 'Create Client' : 'Save Changes'}
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Quick Links - only show for existing clients */}
        {!isNewClient && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            <Link
              href={`/admin/clients/${client!.id}/users`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
            >
              <Users className="h-4 w-4" />
              Users
            </Link>
            {client?.slug && (
              <a
                href={`/sites/${client.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Globe className="h-4 w-4" />
                Landing Page
              </a>
            )}
            <button
              type="button"
              onClick={async () => {
                setReviewsMessage('Refreshing…')
                try {
                  const res = await fetch(`/api/clients/${client!.id}/refresh-reviews`, { method: 'POST' })
                  const data = await res.json()
                  setReviewsMessage(data.message || data.error || 'Done')
                } catch {
                  setReviewsMessage('Refresh failed')
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            >
              <Star className="h-4 w-4" />
              Refresh Google Reviews
            </button>
            {reviewsMessage && (
              <span className="text-xs text-gray-500">{reviewsMessage}</span>
            )}
          </div>
        )}

        {/* Webhook URL - only show for existing clients */}
        {!isNewClient && client?.slug && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm">
              <Webhook className="h-4 w-4 text-cyan-500" />
              <span className="text-gray-500 font-medium">Webhook:</span>
              <code className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 flex-1 truncate">
                https://glassleads.app/api/webhooks/highlevel/lead?client={client.slug}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `https://glassleads.app/api/webhooks/highlevel/lead?client=${client.slug}`
                  )
                }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Copy webhook URL"
              >
                <Copy className="h-4 w-4 text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Business Information */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader
          section="business"
          icon={Building2}
          title="Business Information"
          subtitle="Name, contact, and service details"
        />
        {expandedSections.has('business') && (
          <div className="p-6 space-y-4">
            {/* Google Places Search */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Search size={18} className="text-blue-600" />
                <label className="block text-sm font-medium text-blue-900">
                  Search for Business on Google
                </label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={placeSearch}
                  onChange={(e) => {
                    setPlaceSearch(e.target.value)
                    setPlaceSelected(false)
                  }}
                  placeholder="Start typing business name..."
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {placeSearchLoading && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  </div>
                )}
                {showPredictions && placePredictions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                    {placePredictions.map((prediction) => (
                      <button
                        key={prediction.placeId}
                        type="button"
                        onClick={() => selectPlace(prediction)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
                      >
                        <div className="font-medium text-gray-900">{prediction.mainText}</div>
                        <div className="text-sm text-gray-500">{prediction.secondaryText}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {formData.googlePlaceId && (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-green-600 flex items-center gap-1">
                    ✓ Business found - details populated below
                  </span>
                  <button
                    type="button"
                    onClick={clearPlaceSelection}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Clear & search again
                  </button>
                </div>
              )}
              <p className="text-xs text-blue-700 mt-2">
                Search to auto-fill business info from Google, or enter manually below.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => updateField('businessName', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={formData.contactPerson || ''}
                  onChange={(e) => updateField('contactPerson', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Services Offered</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersWindshieldRepair}
                    onChange={(e) => updateField('offersWindshieldRepair', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Windshield Repair</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersWindshieldReplacement}
                    onChange={(e) => updateField('offersWindshieldReplacement', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Windshield Replacement</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersSideWindowRepair}
                    onChange={(e) => updateField('offersSideWindowRepair', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Side Window Repair</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersBackWindowRepair}
                    onChange={(e) => updateField('offersBackWindowRepair', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Back Window Repair</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersSunroofRepair}
                    onChange={(e) => updateField('offersSunroofRepair', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Sunroof Repair</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersRockChipRepair}
                    onChange={(e) => updateField('offersRockChipRepair', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Rock Chip Repair</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersAdasCalibration}
                    onChange={(e) => updateField('offersAdasCalibration', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">ADAS Calibration</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersMobileService}
                    onChange={(e) => updateField('offersMobileService', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Mobile Service</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Location */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader
          section="location"
          icon={MapPin}
          title="Location & Address"
          subtitle="Address, timezone, and Google Maps integration"
        />
        {expandedSections.has('location') && (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={formData.streetAddress}
                onChange={(e) => updateField('streetAddress', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => updateField('postalCode', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <select
                  value={formData.country || 'US'}
                  onChange={(e) => updateField('country', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => updateField('timezone', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Used for same-day lead deduplication and date display.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Areas</label>
                <textarea
                  value={(formData.serviceAreas || []).join('\n')}
                  onChange={(e) =>
                    updateField(
                      'serviceAreas',
                      e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                    )
                  }
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder={'One city or neighborhood per line'}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Place ID</label>
                <input
                  type="text"
                  value={formData.googlePlaceId || ''}
                  onChange={(e) => updateField('googlePlaceId', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="ChIJ..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps URL</label>
                <input
                  type="url"
                  value={formData.googleMapsUrl || ''}
                  onChange={(e) => updateField('googleMapsUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="https://maps.google.com/..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Branding */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader
          section="branding"
          icon={Palette}
          title="Branding"
          subtitle="Logo and colors shown in the client portal"
        />
        {expandedSections.has('branding') && (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input
                type="url"
                value={formData.logoUrl || ''}
                onChange={(e) => updateField('logoUrl', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor || '#1e40af'}
                    onChange={(e) => updateField('primaryColor', e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor || '#1e40af'}
                    onChange={(e) => updateField('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.secondaryColor || '#3b82f6'}
                    onChange={(e) => updateField('secondaryColor', e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.secondaryColor || '#3b82f6'}
                    onChange={(e) => updateField('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.accentColor || '#f59e0b'}
                    onChange={(e) => updateField('accentColor', e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.accentColor || '#f59e0b'}
                    onChange={(e) => updateField('accentColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Website */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader
          section="website"
          icon={Globe}
          title="Hosted Website"
          subtitle={
            client?.siteSubdomain
              ? `Live at ${client.siteSubdomain}.glassleads.app`
              : 'Landing site rendered from this client record'
          }
        />
        {expandedSections.has('website') && (
          <div className="p-6 space-y-4">
            {isNewClient ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Save the client first, then connect a subdomain here.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  The site is always available at{' '}
                  <a
                    href={`/sites/${client!.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 text-blue-600"
                  >
                    /sites/{client!.slug}
                  </a>
                  . Connecting a short subdomain creates the Cloudflare DNS record and
                  attaches the domain to Vercel automatically.
                </p>
                <div className="flex items-end gap-2 flex-wrap">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Short subdomain</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={subdomainInput}
                        onChange={(e) => setSubdomainInput(e.target.value.toLowerCase())}
                        placeholder="collision"
                        className="w-44 px-3 py-2 border rounded-l-md text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="px-3 py-2 border border-l-0 rounded-r-md bg-gray-50 text-sm text-gray-500">
                        .glassleads.app
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={connectSubdomain}
                    disabled={provisioning || !subdomainInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {provisioning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    {client?.siteSubdomain ? 'Reconnect' : 'Connect'}
                  </button>
                  {client?.siteSubdomain && (
                    <a
                      href={`https://${client.siteSubdomain}.glassleads.app`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      Open site ↗
                    </a>
                  )}
                </div>
                {provisionMessage && (
                  <p className={`text-sm ${provisionMessage.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {provisionMessage.text}
                  </p>
                )}
                <SiteContentEditor
                  clientId={client!.id}
                  onLogoFound={(url) => updateField('logoUrl', url)}
                  onAreasFound={(found) => {
                    // Union with what's already set — the import adds cities,
                    // never removes ones the admin entered.
                    const existing = formData.serviceAreas || []
                    const lower = new Set(existing.map((a) => a.toLowerCase()))
                    const merged = [...existing, ...found.filter((a) => !lower.has(a.toLowerCase()))]
                    updateField('serviceAreas', merged)
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Lead Forwarding */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader
          section="leadForwarding"
          icon={Webhook}
          title="Lead Forwarding"
          subtitle="Outbound webhooks and browser origins for this client's forms"
        />
        {expandedSections.has('leadForwarding') && (
          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-1">Outbound Webhooks</h4>
              <p className="text-sm text-gray-500 mb-3">
                Every lead received for this client is forwarded to each enabled destination
                (for example, this client&apos;s HighLevel inbound webhook). Forms then only
                need to post to glassleads.app. Failed forwards are retried automatically for
                24 hours.
              </p>
              {isNewClient ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Save the client first, then add webhook destinations here.
                </p>
              ) : (
                <WebhookDestinationsManager clientId={client!.id} />
              )}
            </div>

            {!isNewClient && client?.slug && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-1">Quote Widget Embed</h4>
                <p className="text-sm text-gray-500 mb-3">
                  Paste this on any page of the client&apos;s website. Add a{' '}
                  <code className="bg-gray-100 px-1 rounded">&lt;div data-glassleads-widget&gt;&lt;/div&gt;</code>{' '}
                  where the form should appear inline; without one, a floating
                  &quot;Free Quote&quot; button shows in the corner. The site&apos;s domain must be
                  listed in Allowed Browser Origins below or submissions will be blocked.
                </p>
                <div className="flex items-start gap-2">
                  <code className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">
                    {`<script src="https://glassleads.app/widget.js" data-client="${client.slug}" async></script>`}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `<script src="https://glassleads.app/widget.js" data-client="${client.slug}" async></script>`
                      )
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                    title="Copy embed code"
                  >
                    <Copy className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-1">Allowed Browser Origins</h4>
              <p className="text-sm text-gray-500 mb-3">
                Websites allowed to post leads to the webhook directly from a visitor&apos;s
                browser (CORS). One per line, e.g.{' '}
                <code className="bg-gray-100 px-1 rounded">https://collisionglass.co</code>.
                List both the www and non-www versions of a domain. Saved with the Save button.
              </p>
              <textarea
                value={(formData.allowedOrigins || []).join('\n')}
                onChange={(e) =>
                  updateField(
                    'allowedOrigins',
                    e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                  )
                }
                rows={4}
                className="w-full px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={'https://example.com\nhttps://www.example.com'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Call Coaching */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <SectionHeader
          section="callCoaching"
          icon={PhoneCall}
          title="Call Coaching"
          subtitle={
            (formData.callCoachingEnabled ?? true)
              ? 'Phone calls are transcribed and scored against the sales rubric'
              : 'Disabled — phone calls are not analyzed'
          }
        />
        {expandedSections.has('callCoaching') && (
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="pr-4">
                <h4 className="text-sm font-medium text-gray-900">Enable Call Coaching</h4>
                <p className="text-sm text-gray-500 mt-1">
                  When on, every phone lead with a recording gets a 0–100 coaching
                  score, missed-opportunity moments, and a coaching note. Turn off
                  to skip transcription and analysis for this client. Existing
                  reports are not deleted.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.callCoachingEnabled ?? true}
                  onChange={(e) => updateField('callCoachingEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Save Button */}
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => router.push('/admin/clients')}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {isNewClient ? 'Creating...' : 'Saving...'}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isNewClient ? 'Create Client' : 'Save Changes'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
