'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { useDirtyForm, confirmDiscard } from '@/hooks/useDirtyForm'
import SaveBar from '@/components/forms/SaveBar'
import ClientLocationsManager from '@/components/admin/ClientLocationsManager'

/**
 * "Business" tab — the facts about the shop: identity, address, what they
 * sell, where they sell it, and their brand. One save covers everything on
 * this route; nothing here applies until Save is pressed.
 */

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


interface PlacePrediction {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
]

export default function ClientBusinessForm({ client }: { client: ClientData }) {
  const { values: formData, setValues: setFormData, setField, dirtyFields, isDirty, changedPayload, commit, discard } =
    useDirtyForm<ClientData>(client)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const updateField = <K extends keyof ClientData>(field: K, value: ClientData[K]) => {
    setField(field, value)
    setMessage(null)
  }

  // --- Google Places search -------------------------------------------------
  const [placeSearch, setPlaceSearch] = useState('')
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([])
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false)
  const [showPredictions, setShowPredictions] = useState(false)
  const [placeSelected, setPlaceSelected] = useState(false)

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
      if (!response.ok) return
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
    setFormData((prev) => ({ ...prev, googlePlaceId: null, googleMapsUrl: null }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changedPayload()),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      commit()
      setMessage({ ok: true, text: 'Saved. Site updates within about 5 minutes.' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const areaCount = (formData.serviceAreas || []).length

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Business</h2>
          <p className="text-sm text-gray-500">Name, contact, and the services this shop sells</p>
        </div>
        <div className="p-6 pt-4 space-y-4">
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
      </section>
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Location &amp; hours</h2>
          <p className="text-sm text-gray-500">Address, timezone, and Google listing</p>
        </div>
        <div className="p-6 pt-4 space-y-4">
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
      </section>
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Shops</h2>
          <p className="text-sm text-gray-500">
            For clients who run more than one location, each with its own Google Business Profile
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Saved separately from the rest of this tab. Each shop&apos;s city gets its own location
            page with its own map.
          </p>
        </div>
        <ClientLocationsManager
          clientId={client.id}
          fallback={{
            streetAddress: formData.streetAddress,
            city: formData.city,
            state: formData.state,
            postalCode: formData.postalCode,
            country: formData.country || 'US',
            phone: formData.phone,
            googlePlaceId: formData.googlePlaceId,
            googleMapsUrl: formData.googleMapsUrl,
          }}
        />
      </section>
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Service Areas</h2>
          <p className="text-sm text-gray-500">The cities on their site, coverage band, and location pages</p>
          <p className="text-xs text-gray-400 mt-1">{areaCount} {areaCount === 1 ? 'city' : 'cities'} · the first 5 also get their own location page.</p>
        </div>
        <div className="p-6 pt-4 space-y-4">
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
      </section>
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Branding</h2>
          <p className="text-sm text-gray-500">Logo and the colors the whole site derives from</p>
        </div>
        <div className="p-6 pt-4 space-y-4">
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
      </section>

      <SaveBar
        dirtyCount={dirtyFields.size}
        saving={saving}
        message={message}
        onSave={handleSave}
        onDiscard={() => { if (confirmDiscard(isDirty)) discard() }}
      />
    </div>
  )
}
