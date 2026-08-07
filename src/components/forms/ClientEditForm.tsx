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
  callCoachingEnabled: true,
}

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
]

type SectionKey = 'business' | 'location' | 'branding' | 'callCoaching'

export default function ClientEditForm({ client }: ClientEditFormProps) {
  const router = useRouter()
  const isNewClient = !client?.id
  const [formData, setFormData] = useState<ClientData>(client || defaultClientData)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['business', 'location', 'branding', 'callCoaching'])
  )

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
