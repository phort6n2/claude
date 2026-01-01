'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Plus, Trash2, MapPin, Building2, Podcast } from 'lucide-react'

interface PodbeanPodcast {
  id: string
  title: string
  logo: string
  description: string
}

interface ServiceLocation {
  id?: string
  city: string
  state: string
  neighborhood: string
  isHeadquarters: boolean
}

interface ClientFormData {
  businessName: string
  contactPerson: string
  phone: string
  email: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  hasShopLocation: boolean
  offersMobileService: boolean
  hasAdasCalibration: boolean
  serviceAreas: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  brandVoice: string
  wordpressUrl: string
  wordpressUsername: string
  wordpressAppPassword: string
  ctaText: string
  ctaUrl: string
  preferredPublishTime: string
  timezone: string
  postsPerWeek: number
  socialPlatforms: string[]
  socialAccountIds: Record<string, string>
  podbeanPodcastId: string
  podbeanPodcastTitle: string
}

interface ClientFormProps {
  initialData?: Partial<ClientFormData> & { id?: string }
  isEditing?: boolean
}

const defaultData: ClientFormData = {
  businessName: '',
  contactPerson: '',
  phone: '',
  email: '',
  streetAddress: '',
  city: '',
  state: '',
  postalCode: '',
  hasShopLocation: true,
  offersMobileService: false,
  hasAdasCalibration: false,
  serviceAreas: '',
  logoUrl: '',
  primaryColor: '#1e40af',
  secondaryColor: '#3b82f6',
  accentColor: '#f59e0b',
  brandVoice: 'Professional, helpful, and knowledgeable',
  wordpressUrl: '',
  wordpressUsername: '',
  wordpressAppPassword: '',
  ctaText: 'Get a Free Quote',
  ctaUrl: '',
  preferredPublishTime: '09:00',
  timezone: 'America/Los_Angeles',
  postsPerWeek: 2,
  socialPlatforms: [],
  socialAccountIds: {},
  podbeanPodcastId: '',
  podbeanPodcastTitle: '',
}

const socialPlatformOptions = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'gbp', label: 'Google Business Profile' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'threads', label: 'Threads' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'telegram', label: 'Telegram' },
]

const timezones = [
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
]

export default function ClientForm({ initialData, isEditing = false }: ClientFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'success' | 'error' | null>(null)

  // Service Locations state
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Podbean state
  const [podbeanPodcasts, setPodbeanPodcasts] = useState<PodbeanPodcast[]>([])
  const [podbeanConnected, setPodbeanConnected] = useState(false)
  const [loadingPodcasts, setLoadingPodcasts] = useState(false)
  const [podbeanError, setPodbeanError] = useState<string | null>(null)

  const [formData, setFormData] = useState<ClientFormData>({
    ...defaultData,
    ...initialData,
    serviceAreas: Array.isArray(initialData?.serviceAreas)
      ? (initialData.serviceAreas as string[]).join(', ')
      : initialData?.serviceAreas || '',
  } as ClientFormData)

  const updateField = (field: keyof ClientFormData, value: string | boolean | number | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Load service locations if editing
  useEffect(() => {
    if (isEditing && initialData?.id) {
      setLoadingLocations(true)
      fetch(`/api/clients/${initialData.id}/locations`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setServiceLocations(data.map((loc: ServiceLocation) => ({
              id: loc.id,
              city: loc.city,
              state: loc.state,
              neighborhood: loc.neighborhood || '',
              isHeadquarters: loc.isHeadquarters,
            })))
          }
        })
        .catch(console.error)
        .finally(() => setLoadingLocations(false))
    }
  }, [isEditing, initialData?.id])

  // Add location from headquarters (auto-create first location)
  useEffect(() => {
    if (!isEditing && formData.city && formData.state && serviceLocations.length === 0) {
      setServiceLocations([{
        city: formData.city,
        state: formData.state,
        neighborhood: '',
        isHeadquarters: true,
      }])
    }
  }, [formData.city, formData.state, isEditing, serviceLocations.length])

  // Load Podbean podcasts
  useEffect(() => {
    setLoadingPodcasts(true)
    setPodbeanError(null)
    fetch('/api/integrations/podbean/podcasts')
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.podcasts) {
          setPodbeanConnected(true)
          setPodbeanPodcasts(data.podcasts)
          setPodbeanError(null)
        } else {
          setPodbeanConnected(false)
          setPodbeanError(data.error || null)
        }
      })
      .catch((err) => {
        setPodbeanConnected(false)
        setPodbeanError(err.message || 'Failed to connect')
      })
      .finally(() => setLoadingPodcasts(false))
  }, [])

  const addServiceLocation = () => {
    setServiceLocations((prev) => [
      ...prev,
      { city: '', state: formData.state, neighborhood: '', isHeadquarters: false },
    ])
  }

  const updateServiceLocation = (index: number, field: keyof ServiceLocation, value: string | boolean) => {
    setServiceLocations((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      // If setting as headquarters, unset others
      if (field === 'isHeadquarters' && value === true) {
        updated.forEach((loc, i) => {
          if (i !== index) loc.isHeadquarters = false
        })
      }

      return updated
    })
  }

  const removeServiceLocation = (index: number) => {
    setServiceLocations((prev) => prev.filter((_, i) => i !== index))
  }

  const toggleSocialPlatform = (platform: string) => {
    setFormData((prev) => ({
      ...prev,
      socialPlatforms: prev.socialPlatforms.includes(platform)
        ? prev.socialPlatforms.filter((p) => p !== platform)
        : [...prev.socialPlatforms, platform],
    }))
  }

  const updateSocialAccountId = (platform: string, accountId: string) => {
    setFormData((prev) => ({
      ...prev,
      socialAccountIds: {
        ...prev.socialAccountIds,
        [platform]: accountId,
      },
    }))
  }

  const selectPodbeanPodcast = (podcastId: string) => {
    const podcast = podbeanPodcasts.find((p) => p.id === podcastId)
    setFormData((prev) => ({
      ...prev,
      podbeanPodcastId: podcastId,
      podbeanPodcastTitle: podcast?.title || '',
    }))
  }

  const testWordPressConnection = async () => {
    setTestingConnection(true)
    setConnectionStatus(null)
    try {
      const response = await fetch('/api/wordpress/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formData.wordpressUrl,
          username: formData.wordpressUsername,
          password: formData.wordpressAppPassword,
          clientId: initialData?.id, // Pass clientId to update wordpressConnected status
        }),
      })
      if (response.ok) {
        setConnectionStatus('success')
      } else {
        setConnectionStatus('error')
      }
    } catch {
      setConnectionStatus('error')
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    try {
      const url = isEditing ? `/api/clients/${initialData?.id}` : '/api/clients'
      const method = isEditing ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          serviceAreas: formData.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save client')
      }

      const clientData = await response.json()
      const clientId = clientData.id || initialData?.id

      // Save service locations if we have any with valid data
      const validLocations = serviceLocations.filter((loc) => loc.city && loc.state)
      if (validLocations.length > 0 && clientId) {
        const locResponse = await fetch(`/api/clients/${clientId}/locations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: validLocations }),
        })

        if (!locResponse.ok) {
          console.error('Failed to save service locations')
        }
      }

      router.push('/admin/clients')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => updateField('businessName', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) => updateField('contactPerson', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    value={formData.streetAddress}
                    onChange={(e) => updateField('streetAddress', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP *
                    </label>
                    <input
                      type="text"
                      value={formData.postalCode}
                      onChange={(e) => updateField('postalCode', e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Service Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.hasShopLocation}
                    onChange={(e) => updateField('hasShopLocation', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Has physical shop location</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.offersMobileService}
                    onChange={(e) => updateField('offersMobileService', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Offers mobile service</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.hasAdasCalibration}
                    onChange={(e) => updateField('hasAdasCalibration', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Has ADAS calibration</span>
                </label>
              </div>
            </CardContent>
          </Card>
        )

      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Service Locations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Add the cities/areas you serve. Content will be generated for each location.
              </p>

              {loadingLocations ? (
                <div className="py-8 text-center text-gray-500">Loading locations...</div>
              ) : (
                <div className="space-y-3">
                  {serviceLocations.map((location, index) => (
                    <div
                      key={index}
                      className={`p-4 border rounded-lg ${
                        location.isHeadquarters ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {location.isHeadquarters ? (
                            <Building2 size={18} className="text-blue-600" />
                          ) : (
                            <MapPin size={18} className="text-gray-400" />
                          )}
                          <span className="text-sm font-medium">
                            {location.isHeadquarters ? 'Headquarters' : `Location ${index + 1}`}
                          </span>
                        </div>
                        {!location.isHeadquarters && (
                          <button
                            type="button"
                            onClick={() => removeServiceLocation(index)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">City *</label>
                          <input
                            type="text"
                            value={location.city}
                            onChange={(e) => updateServiceLocation(index, 'city', e.target.value)}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="City name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">State *</label>
                          <input
                            type="text"
                            value={location.state}
                            onChange={(e) => updateServiceLocation(index, 'state', e.target.value)}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="State"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Neighborhood</label>
                          <input
                            type="text"
                            value={location.neighborhood}
                            onChange={(e) => updateServiceLocation(index, 'neighborhood', e.target.value)}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                            placeholder="Optional"
                          />
                        </div>
                      </div>

                      {!location.isHeadquarters && (
                        <label className="flex items-center gap-2 mt-3">
                          <input
                            type="checkbox"
                            checked={location.isHeadquarters}
                            onChange={(e) => updateServiceLocation(index, 'isHeadquarters', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-xs text-gray-600">Set as headquarters</span>
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={addServiceLocation}
                className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
              >
                <Plus size={16} />
                Add Another Location
              </button>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Pro tip:</strong> Adding multiple locations creates unique, location-specific
                content for each area. With 200 PAA questions × {serviceLocations.length || 1} locations,
                you&apos;ll have {200 * (serviceLocations.length || 1)} unique content pieces.
              </div>
            </CardContent>
          </Card>
        )

      case 4:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 4: Brand Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={(e) => updateField('logoUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="h-10 w-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.primaryColor}
                      onChange={(e) => updateField('primaryColor', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Secondary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.secondaryColor}
                      onChange={(e) => updateField('secondaryColor', e.target.value)}
                      className="h-10 w-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.secondaryColor}
                      onChange={(e) => updateField('secondaryColor', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.accentColor}
                      onChange={(e) => updateField('accentColor', e.target.value)}
                      className="h-10 w-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.accentColor}
                      onChange={(e) => updateField('accentColor', e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md text-sm"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand Voice Description
                </label>
                <textarea
                  value={formData.brandVoice}
                  onChange={(e) => updateField('brandVoice', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Professional, helpful, and knowledgeable"
                />
              </div>
            </CardContent>
          </Card>
        )

      case 5:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 5: Integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WordPress Site URL
                </label>
                <input
                  type="url"
                  value={formData.wordpressUrl}
                  onChange={(e) => updateField('wordpressUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WordPress Username
                </label>
                <input
                  type="text"
                  value={formData.wordpressUsername}
                  onChange={(e) => updateField('wordpressUsername', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Application Password
                </label>
                <input
                  type="password"
                  value={formData.wordpressAppPassword}
                  onChange={(e) => updateField('wordpressAppPassword', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Generate in WordPress: Users → Profile → Application Passwords
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={testWordPressConnection}
                  disabled={testingConnection || !formData.wordpressUrl}
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </Button>
                {connectionStatus === 'success' && (
                  <span className="text-green-600 text-sm">Connection successful!</span>
                )}
                {connectionStatus === 'error' && (
                  <span className="text-red-600 text-sm">Connection failed</span>
                )}
              </div>

              {/* Podbean Podcast Section */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <Podcast size={20} className="text-purple-600" />
                  <h3 className="text-sm font-medium text-gray-700">Podcast Publishing</h3>
                </div>

                {loadingPodcasts ? (
                  <div className="text-sm text-gray-500">Loading podcasts...</div>
                ) : !podbeanConnected ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    {podbeanError ? (
                      <>
                        <strong>Podbean Error:</strong> {podbeanError}
                        <br />
                        <span className="text-xs mt-1 block">
                          Check your credentials in{' '}
                          <a href="/admin/settings/api" className="underline font-medium">
                            Settings → API
                          </a>
                        </span>
                      </>
                    ) : (
                      <>
                        Podbean is not connected. Configure Podbean API credentials in{' '}
                        <a href="/admin/settings/api" className="underline font-medium">
                          Settings → API
                        </a>{' '}
                        to enable podcast publishing.
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Select Podcast
                    </label>
                    <select
                      value={formData.podbeanPodcastId}
                      onChange={(e) => selectPodbeanPodcast(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">-- Select a podcast --</option>
                      {podbeanPodcasts.map((podcast) => (
                        <option key={podcast.id} value={podcast.id}>
                          {podcast.title}
                        </option>
                      ))}
                    </select>
                    {formData.podbeanPodcastId && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <span>✓</span>
                        <span>Podcasts will be published to: {formData.podbeanPodcastTitle}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )

      case 6:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 6: CTA & Publishing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CTA Text
                  </label>
                  <input
                    type="text"
                    value={formData.ctaText}
                    onChange={(e) => updateField('ctaText', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CTA URL
                  </label>
                  <input
                    type="url"
                    value={formData.ctaUrl}
                    onChange={(e) => updateField('ctaUrl', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/quote"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preferred Publish Time
                  </label>
                  <input
                    type="time"
                    value={formData.preferredPublishTime}
                    onChange={(e) => updateField('preferredPublishTime', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => updateField('timezone', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {timezones.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Posts Per Week
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={formData.postsPerWeek}
                    onChange={(e) => updateField('postsPerWeek', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )

      case 7:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 7: Social Media Platforms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Select the platforms to publish content to
              </p>
              <div className="grid grid-cols-2 gap-3">
                {socialPlatformOptions.map((platform) => (
                  <label
                    key={platform.value}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.socialPlatforms.includes(platform.value)
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.socialPlatforms.includes(platform.value)}
                      onChange={() => toggleSocialPlatform(platform.value)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium">{platform.label}</span>
                  </label>
                ))}
              </div>
              {formData.socialPlatforms.length > 0 && (
                <div className="mt-6 pt-6 border-t space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Late Account IDs</p>
                    <p className="text-xs text-gray-500">
                      Enter the unique Late account ID for each platform from getlate.dev
                    </p>
                  </div>
                  {formData.socialPlatforms.map((platform) => {
                    const platformLabel = socialPlatformOptions.find(p => p.value === platform)?.label || platform
                    return (
                      <div key={platform}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {platformLabel} Account ID
                        </label>
                        <input
                          type="text"
                          value={formData.socialAccountIds[platform] || ''}
                          onChange={(e) => updateSocialAccountId(platform, e.target.value)}
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="694f35914207e06f4ca82b79"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )

      case 8:
        return (
          <Card>
            <CardHeader>
              <CardTitle>Step 8: Review & Save</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Business Name:</span>
                  <span className="font-medium">{formData.businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Location:</span>
                  <span className="font-medium">{formData.city}, {formData.state}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Service Locations:</span>
                  <span className="font-medium">{serviceLocations.length} areas</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Services:</span>
                  <span className="font-medium">
                    {[
                      formData.hasShopLocation && 'Shop',
                      formData.offersMobileService && 'Mobile',
                      formData.hasAdasCalibration && 'ADAS',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Standard'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">WordPress:</span>
                  <span className="font-medium">
                    {formData.wordpressUrl ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Podcast:</span>
                  <span className="font-medium">
                    {formData.podbeanPodcastTitle || 'Not configured'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Social Platforms:</span>
                  <span className="font-medium">
                    {formData.socialPlatforms.length} selected
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Publishing:</span>
                  <span className="font-medium">
                    {formData.postsPerWeek}x/week at {formData.preferredPublishTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Content Potential:</span>
                  <span className="font-medium text-green-600">
                    {200 * serviceLocations.length} unique pieces
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
          <div key={s} className="flex items-center">
            <button
              onClick={() => setStep(s)}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                s === step
                  ? 'bg-blue-600 text-white'
                  : s < step
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s}
            </button>
            {s < 8 && (
              <div
                className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {renderStep()}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          Previous
        </Button>
        {step < 8 ? (
          <Button onClick={() => setStep((s) => Math.min(8, s + 1))}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : isEditing ? 'Update Client' : 'Create Client'}
          </Button>
        )}
      </div>
    </div>
  )
}
