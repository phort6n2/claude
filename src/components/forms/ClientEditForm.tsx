'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import {
  ChevronDown,
  ChevronRight,
  Building2,
  MapPin,
  Palette,
  Globe,
  Share2,
  Podcast,
  Video,
  FileQuestion,
  Clock,
  Save,
  Loader2,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Zap,
  Calendar,
  Search,
  ExternalLink,
} from 'lucide-react'

interface PodbeanPodcast {
  id: string
  title: string
  logo: string
  description: string
  website: string
}

interface YouTubePlaylist {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  itemCount: number
}

interface ServiceLocation {
  id?: string
  city: string
  state: string
  neighborhood: string
  isHeadquarters: boolean
}

interface FetchedPAA {
  original: string
  formatted: string
  answer?: string
  source?: string
  selected: boolean
}

interface ClientData {
  id: string
  businessName: string
  contactPerson: string | null
  phone: string
  email: string
  streetAddress: string
  city: string
  state: string
  postalCode: string
  googlePlaceId: string | null
  googleMapsUrl: string | null
  wrhqDirectoryUrl: string | null
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
  brandVoice: string | null
  wordpressUrl: string | null
  wordpressUsername: string | null
  wordpressAppPassword: string | null
  ctaText: string
  ctaUrl: string | null
  creatifyTemplateId: string | null
  preferredPublishTime: string
  timezone: string
  socialPlatforms: string[]
  socialAccountIds: Record<string, string> | null
  podbeanPodcastId: string | null
  podbeanPodcastTitle: string | null
  podbeanPodcastUrl: string | null
  wrhqYoutubePlaylistId?: string | null
  wrhqYoutubePlaylistTitle?: string | null
  // Automation fields
  autoScheduleEnabled?: boolean
  autoScheduleFrequency?: number
}

interface ClientEditFormProps {
  client: ClientData
  hasWordPressPassword?: boolean
}

const socialPlatformOptions = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'gbp', label: 'Google Business' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'threads', label: 'Threads' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'telegram', label: 'Telegram' },
]

type SectionKey = 'business' | 'location' | 'serviceLocations' | 'branding' | 'wordpress' | 'social' | 'integrations' | 'automation'

export default function ClientEditForm({ client, hasWordPressPassword = false }: ClientEditFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<ClientData>(client)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    new Set(['business', 'location', 'serviceLocations', 'branding', 'wordpress', 'social', 'integrations', 'automation'])
  )

  // WordPress connection test state
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'success' | 'error' | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Podbean state
  const [podbeanPodcasts, setPodbeanPodcasts] = useState<PodbeanPodcast[]>([])
  const [podbeanConnected, setPodbeanConnected] = useState(false)
  const [loadingPodcasts, setLoadingPodcasts] = useState(false)

  // YouTube playlist state
  const [youtubePlaylists, setYoutubePlaylists] = useState<YouTubePlaylist[]>([])
  const [youtubeConnected, setYoutubeConnected] = useState(false)
  const [loadingYoutube, setLoadingYoutube] = useState(false)

  // Service locations state
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Auto-schedule status state
  const [autoScheduleStatus, setAutoScheduleStatus] = useState<{
    paaQueue: {
      unused: number
      total: number
      isRecycling: boolean
      custom: { unused: number; total: number }
      standard: { unused: number; total: number }
    }
    locations: { active: number; neverUsed: number }
    upcoming: { count: number }
    slot: { dayPair: string | null; dayPairLabel: string | null; timeSlot: number | null; timeSlotLabel: string | null }
  } | null>(null)
  const [loadingAutoSchedule, setLoadingAutoSchedule] = useState(false)

  // Test run state
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message?: string
    error?: string
    contentItemId?: string
    reviewUrl?: string
    details?: {
      client: string
      paa: string
      location: string
    }
  } | null>(null)

  // PAA management state
  const [paaText, setPaaText] = useState('')
  const [paaValidation, setPaaValidation] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    errors: [] as string[],
  })
  const [savingPaas, setSavingPaas] = useState(false)
  const [paaMessage, setPaaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loadingPaas, setLoadingPaas] = useState(false)
  const [existingPaaCount, setExistingPaaCount] = useState(0)
  const [existingPaaQuestions, setExistingPaaQuestions] = useState<Set<string>>(new Set())

  // Google PAA fetch state
  const [fetchingGooglePaas, setFetchingGooglePaas] = useState(false)
  const [fetchedPaas, setFetchedPaas] = useState<FetchedPAA[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchCost, setFetchCost] = useState<number | null>(null)
  const [duplicatesSkipped, setDuplicatesSkipped] = useState(0)
  const [dataForSeoBalance, setDataForSeoBalance] = useState<number | null>(null)
  const [dataForSeoConfigured, setDataForSeoConfigured] = useState<boolean | null>(null)

  // Load Podbean podcasts
  useEffect(() => {
    setLoadingPodcasts(true)
    fetch('/api/integrations/podbean/podcasts')
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.podcasts) {
          setPodbeanConnected(true)
          setPodbeanPodcasts(data.podcasts)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPodcasts(false))
  }, [])

  // Load YouTube playlists
  useEffect(() => {
    setLoadingYoutube(true)
    fetch('/api/settings/wrhq/youtube/playlists')
      .then((res) => res.json())
      .then((data) => {
        if (data.connected && data.playlists) {
          setYoutubeConnected(true)
          setYoutubePlaylists(data.playlists)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingYoutube(false))
  }, [])

  // Load service locations
  useEffect(() => {
    setLoadingLocations(true)
    fetch(`/api/clients/${client.id}/locations`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setServiceLocations(data.map((loc: ServiceLocation) => ({
            id: loc.id,
            city: loc.city,
            state: loc.state,
            neighborhood: loc.neighborhood || '',
            isHeadquarters: loc.isHeadquarters || false,
          })))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingLocations(false))
  }, [client.id])

  // Load DataForSEO balance
  useEffect(() => {
    fetch('/api/settings/dataforseo/balance')
      .then((res) => res.json())
      .then((data) => {
        setDataForSeoConfigured(data.configured)
        if (data.balance !== undefined) {
          setDataForSeoBalance(data.balance)
        }
      })
      .catch(() => setDataForSeoConfigured(false))
  }, [])

  // Load existing PAAs
  useEffect(() => {
    setLoadingPaas(true)
    fetch(`/api/clients/${client.id}/paas`)
      .then((res) => res.json())
      .then((data) => {
        if (data.paas && Array.isArray(data.paas)) {
          setExistingPaaCount(data.paas.length)
          // Store normalized questions for duplicate checking
          const questions = new Set<string>(
            data.paas.map((p: { question: string }) => p.question.toLowerCase().trim())
          )
          setExistingPaaQuestions(questions)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPaas(false))
  }, [client.id])

  // Validate PAA text as user types
  useEffect(() => {
    const lines = paaText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    let valid = 0
    let invalid = 0
    const errors: string[] = []

    for (const line of lines) {
      const hasLocation = /\{location\}/i.test(line)
      const hasQuestionMark = line.endsWith('?')

      if (hasLocation && hasQuestionMark) {
        valid++
      } else {
        invalid++
        const issues: string[] = []
        if (!hasLocation) issues.push('missing {location}')
        if (!hasQuestionMark) issues.push('missing ?')
        errors.push(`"${line.slice(0, 40)}..." - ${issues.join(', ')}`)
      }
    }

    setPaaValidation({
      total: lines.length,
      valid,
      invalid,
      errors,
    })
  }, [paaText])

  // Load auto-schedule status
  useEffect(() => {
    setLoadingAutoSchedule(true)
    fetch(`/api/clients/${client.id}/auto-schedule`)
      .then((res) => res.json())
      .then((data) => {
        if (data.paaQueue && data.locations) {
          setAutoScheduleStatus({
            paaQueue: data.paaQueue,
            locations: data.locations,
            upcoming: data.upcoming,
            slot: data.slot || { dayPair: null, dayPairLabel: null, timeSlot: null, timeSlotLabel: null },
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAutoSchedule(false))
  }, [client.id])

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

  function toggleSocialPlatform(platform: string) {
    const platforms = formData.socialPlatforms || []
    if (platforms.includes(platform)) {
      updateField('socialPlatforms', platforms.filter((p) => p !== platform))
    } else {
      updateField('socialPlatforms', [...platforms, platform])
    }
  }

  function updateSocialAccountId(platform: string, value: string) {
    const ids = formData.socialAccountIds || {}
    updateField('socialAccountIds', { ...ids, [platform]: value })
  }

  function addServiceLocation() {
    setServiceLocations((prev) => [
      ...prev,
      { city: '', state: formData.state, neighborhood: '', isHeadquarters: false },
    ])
  }

  function updateServiceLocation(index: number, field: keyof ServiceLocation, value: string | boolean) {
    setServiceLocations((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }

      // If setting this as headquarters, unset others
      if (field === 'isHeadquarters' && value === true) {
        return updated.map((loc, i) => ({
          ...loc,
          isHeadquarters: i === index,
        }))
      }

      return updated
    })
  }

  function removeServiceLocation(index: number) {
    setServiceLocations((prev) => prev.filter((_, i) => i !== index))
  }

  async function testWordPressConnection() {
    setTestingConnection(true)
    setConnectionStatus(null)
    setConnectionError(null)
    try {
      const response = await fetch('/api/wordpress/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formData.wordpressUrl,
          username: formData.wordpressUsername,
          password: formData.wordpressAppPassword,
          clientId: client.id,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        setConnectionStatus('success')
      } else {
        setConnectionStatus('error')
        setConnectionError(data.details || data.error || 'Connection failed')
      }
    } catch (err) {
      setConnectionStatus('error')
      setConnectionError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setTestingConnection(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          serviceAreas: formData.serviceAreas,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }

      // Save service locations
      const validLocations = serviceLocations.filter((loc) => loc.city && loc.state)
      if (validLocations.length > 0) {
        const locResponse = await fetch(`/api/clients/${client.id}/locations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: validLocations }),
        })

        if (!locResponse.ok) {
          const locData = await locResponse.json()
          throw new Error(locData.error || 'Failed to save locations')
        }
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function savePaas(append: boolean = false) {
    if (paaValidation.valid === 0) {
      setPaaMessage({ type: 'error', text: 'No valid PAA questions to save' })
      return
    }

    setSavingPaas(true)
    setPaaMessage(null)

    try {
      const response = await fetch(`/api/clients/${client.id}/paas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paaText, append }),
      })

      const data = await response.json()

      if (response.ok) {
        setPaaMessage({ type: 'success', text: data.message || 'PAAs saved successfully' })
        setPaaText('') // Clear the textarea after saving
        setExistingPaaCount(data.total || paaValidation.valid)
        // Refresh auto-schedule status to update PAA queue count
        fetch(`/api/clients/${client.id}/auto-schedule`)
          .then(res => res.json())
          .then(statusData => {
            if (statusData.paaQueue && statusData.locations) {
              setAutoScheduleStatus({
                paaQueue: statusData.paaQueue,
                locations: statusData.locations,
                upcoming: statusData.upcoming || { count: 0 },
                slot: statusData.slot || { dayPair: null, dayPairLabel: null, timeSlot: null, timeSlotLabel: null },
              })
            }
          })
      } else {
        setPaaMessage({ type: 'error', text: data.error || 'Failed to save PAAs' })
      }
    } catch {
      setPaaMessage({ type: 'error', text: 'Failed to save PAAs' })
    } finally {
      setSavingPaas(false)
    }
  }

  async function fetchGooglePaas() {
    setFetchingGooglePaas(true)
    setFetchError(null)
    setFetchedPaas([])
    setFetchCost(null)
    setDuplicatesSkipped(0)

    try {
      const response = await fetch(`/api/clients/${client.id}/fetch-paas`, {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        // Check if API returned a message (e.g., no results)
        if (data.message && (!data.paas || data.paas.length === 0)) {
          setFetchError(data.message)
          setFetchCost(data.cost)
          return
        }

        // Get current questions from textarea for duplicate checking
        const textareaQuestions = new Set(
          paaText.split('\n')
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 0)
        )

        // Filter out duplicates
        let skipped = 0
        const newPaas = (data.paas || []).filter((paa: { formatted: string }) => {
          const normalized = paa.formatted.toLowerCase().trim()
          const isDuplicate = existingPaaQuestions.has(normalized) || textareaQuestions.has(normalized)
          if (isDuplicate) skipped++
          return !isDuplicate
        })

        setDuplicatesSkipped(skipped)
        setFetchedPaas(newPaas.map((paa: { original: string; formatted: string; answer?: string; source?: string }) => ({
          ...paa,
          selected: true, // Select all by default
        })))
        setFetchCost(data.cost)

        if (newPaas.length === 0 && skipped === 0) {
          setFetchError('No PAA questions found for this search.')
        }

        // Refresh balance after fetch
        fetch('/api/settings/dataforseo/balance')
          .then((res) => res.json())
          .then((balanceData) => {
            if (balanceData.balance !== undefined) {
              setDataForSeoBalance(balanceData.balance)
            }
          })
      } else {
        setFetchError(data.error || 'Failed to fetch PAAs')
      }
    } catch {
      setFetchError('Failed to connect to DataForSEO')
    } finally {
      setFetchingGooglePaas(false)
    }
  }

  function togglePaaSelection(index: number) {
    setFetchedPaas(prev => prev.map((paa, i) =>
      i === index ? { ...paa, selected: !paa.selected } : paa
    ))
  }

  function selectAllPaas() {
    setFetchedPaas(prev => prev.map(paa => ({ ...paa, selected: true })))
  }

  function deselectAllPaas() {
    setFetchedPaas(prev => prev.map(paa => ({ ...paa, selected: false })))
  }

  function addSelectedPaasToTextarea() {
    const selected = fetchedPaas.filter(paa => paa.selected)
    if (selected.length === 0) return

    const newText = selected.map(paa => paa.formatted).join('\n')
    setPaaText(prev => prev ? `${prev}\n${newText}` : newText)
    setFetchedPaas([]) // Clear after adding
    setPaaMessage({ type: 'success', text: `Added ${selected.length} questions - click "Add to Queue" to save` })
  }

  async function addSelectedPaasAndSave() {
    const selected = fetchedPaas.filter(paa => paa.selected)
    if (selected.length === 0) return

    setSavingPaas(true)
    try {
      const questions = selected.map(paa => paa.formatted)
      const response = await fetch(`/api/clients/${client.id}/paas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, mode: 'append' }),
      })
      const data = await response.json()
      if (response.ok) {
        setFetchedPaas([])
        setExistingPaaCount(prev => prev + data.added)
        // Add to existing questions set for duplicate checking
        setExistingPaaQuestions(prev => {
          const updated = new Set(prev)
          questions.forEach(q => updated.add(q.toLowerCase().trim()))
          return updated
        })
        setPaaMessage({ type: 'success', text: `Saved ${data.added} questions to queue` })
      } else {
        setPaaMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch {
      setPaaMessage({ type: 'error', text: 'Failed to save PAAs' })
    } finally {
      setSavingPaas(false)
    }
  }

  async function runAutomationTest() {
    setTestRunning(true)
    setTestResult(null)

    try {
      const response = await fetch(`/api/clients/${client.id}/auto-schedule/test`, {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        // Redirect immediately to the review page
        if (data.reviewUrl) {
          router.push(data.reviewUrl)
          return
        }

        setTestResult({
          success: true,
          message: data.message,
          contentItemId: data.contentItemId,
          reviewUrl: data.reviewUrl,
          details: data.details,
        })
        // Refresh the auto-schedule status after test
        fetch(`/api/clients/${client.id}/auto-schedule`)
          .then((res) => res.json())
          .then((statusData) => {
            if (statusData.paaQueue && statusData.locations) {
              setAutoScheduleStatus({
                paaQueue: statusData.paaQueue,
                locations: statusData.locations,
                upcoming: statusData.upcoming,
                slot: statusData.slot || { dayPair: null, dayPairLabel: null, timeSlot: null, timeSlotLabel: null },
              })
            }
          })
      } else {
        setTestResult({
          success: false,
          error: data.error || 'Test failed',
        })
      }
    } catch (err) {
      setTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Test failed',
      })
    } finally {
      setTestRunning(false)
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
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg border-b"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-gray-600" />
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
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm -mx-6 -mt-6 px-6 py-3 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{formData.businessName}</h1>
          {saveSuccess && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Business Information */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="business"
          icon={Building2}
          title="Business Information"
          subtitle="Name, contact, and service details"
        />
        {expandedSections.has('business') && (
          <div className="p-6 space-y-4">
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
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="location"
          icon={MapPin}
          title="Location & Address"
          subtitle="Address and Google Maps integration"
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
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => updateField('postalCode', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
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

      {/* Service Locations */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="serviceLocations"
          icon={MapPin}
          title="Service Locations"
          subtitle="Cities and areas you serve"
        />
        {expandedSections.has('serviceLocations') && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Add the cities/areas this client serves. Content will be generated for each location.
            </p>

            {loadingLocations ? (
              <div className="py-8 text-center text-gray-500">Loading locations...</div>
            ) : (
              <div className="space-y-3">
                {serviceLocations.map((location, index) => (
                  <div
                    key={location.id || index}
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

            {serviceLocations.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>Note:</strong> Content is generated for each service location. You have{' '}
                {serviceLocations.length} location{serviceLocations.length !== 1 ? 's' : ''} configured.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Branding */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="branding"
          icon={Palette}
          title="Branding"
          subtitle="Logo, colors, and brand voice"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Voice</label>
              <textarea
                value={formData.brandVoice || ''}
                onChange={(e) => updateField('brandVoice', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Professional, helpful, and knowledgeable"
              />
            </div>
          </div>
        )}
      </div>

      {/* WordPress */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="wordpress"
          icon={Globe}
          title="WordPress Connection"
          subtitle="Website and CMS integration"
        />
        {expandedSections.has('wordpress') && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WordPress URL</label>
                <input
                  type="url"
                  value={formData.wordpressUrl || ''}
                  onChange={(e) => updateField('wordpressUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={formData.wordpressUsername || ''}
                  onChange={(e) => updateField('wordpressUsername', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Application Password
                {hasWordPressPassword && (
                  <span className="ml-2 text-xs text-green-600 font-normal">✓ Saved</span>
                )}
              </label>
              <input
                type="password"
                value={formData.wordpressAppPassword || ''}
                onChange={(e) => updateField('wordpressAppPassword', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder={hasWordPressPassword ? "Leave blank to keep existing password" : "Enter application password"}
              />
              <p className="text-xs text-gray-500 mt-1">
                {hasWordPressPassword
                  ? "Only enter a new password if you want to change it."
                  : "Generate in WordPress: Users → Profile → Application Passwords"
                }
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={testWordPressConnection}
                  disabled={testingConnection || !formData.wordpressUrl || !formData.wordpressUsername}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
                {connectionStatus === 'success' && (
                  <span className="text-green-600 text-sm">✓ Connection successful!</span>
                )}
                {connectionStatus === 'error' && (
                  <span className="text-red-600 text-sm">✗ Connection failed</span>
                )}
              </div>
              {connectionStatus === 'error' && connectionError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <strong>Error:</strong> {connectionError}
                </div>
              )}
            </div>
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Call to Action</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CTA Text</label>
                  <input
                    type="text"
                    value={formData.ctaText}
                    onChange={(e) => updateField('ctaText', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CTA URL</label>
                  <input
                    type="url"
                    value={formData.ctaUrl || ''}
                    onChange={(e) => updateField('ctaUrl', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Social Media */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="social"
          icon={Share2}
          title="Social Media"
          subtitle="Connected platforms and Late account IDs"
        />
        {expandedSections.has('social') && (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Enabled Platforms</label>
              <div className="flex flex-wrap gap-2">
                {socialPlatformOptions.map((platform) => (
                  <button
                    key={platform.value}
                    type="button"
                    onClick={() => toggleSocialPlatform(platform.value)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      formData.socialPlatforms?.includes(platform.value)
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    {platform.label}
                  </button>
                ))}
              </div>
            </div>

            {formData.socialPlatforms && formData.socialPlatforms.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Late Account IDs</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {formData.socialPlatforms.map((platform) => {
                    const platformInfo = socialPlatformOptions.find((p) => p.value === platform)
                    return (
                      <div key={platform}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {platformInfo?.label || platform}
                        </label>
                        <input
                          type="text"
                          value={formData.socialAccountIds?.[platform] || ''}
                          onChange={(e) => updateSocialAccountId(platform, e.target.value)}
                          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                          placeholder={`Late ${platformInfo?.label} ID`}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Integrations */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="integrations"
          icon={Podcast}
          title="Integrations"
          subtitle="Podbean, YouTube, WRHQ, and video templates"
        />
        {expandedSections.has('integrations') && (
          <div className="p-6 space-y-6">
            {/* Podbean */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Podcast className="h-4 w-4 text-orange-600" />
                <h4 className="text-sm font-medium text-gray-700">Podbean Podcast</h4>
              </div>
              {loadingPodcasts ? (
                <div className="text-sm text-gray-500">Loading podcasts...</div>
              ) : !podbeanConnected ? (
                <div className="text-sm text-amber-600">Podbean not connected</div>
              ) : (
                <select
                  value={formData.podbeanPodcastId || ''}
                  onChange={(e) => {
                    const podcast = podbeanPodcasts.find((p) => p.id === e.target.value)
                    updateField('podbeanPodcastId', e.target.value)
                    updateField('podbeanPodcastTitle', podcast?.title || null)
                    updateField('podbeanPodcastUrl', podcast?.website || null)
                  }}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select podcast --</option>
                  {podbeanPodcasts.map((podcast) => (
                    <option key={podcast.id} value={podcast.id}>
                      {podcast.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* YouTube Playlist */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Video className="h-4 w-4 text-red-600" />
                <h4 className="text-sm font-medium text-gray-700">WRHQ YouTube Playlist</h4>
              </div>
              {loadingYoutube ? (
                <div className="text-sm text-gray-500">Loading playlists...</div>
              ) : !youtubeConnected ? (
                <div className="text-sm text-amber-600">
                  YouTube not connected.{' '}
                  <a href="/admin/settings/wrhq" className="underline">
                    Configure in WRHQ Settings
                  </a>
                </div>
              ) : (
                <select
                  value={formData.wrhqYoutubePlaylistId || ''}
                  onChange={(e) => {
                    const playlist = youtubePlaylists.find((p) => p.id === e.target.value)
                    updateField('wrhqYoutubePlaylistId', e.target.value)
                    updateField('wrhqYoutubePlaylistTitle', playlist?.title || null)
                  }}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select playlist --</option>
                  {youtubePlaylists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.title} ({playlist.itemCount} videos)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* WRHQ Directory */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-orange-600" />
                <h4 className="text-sm font-medium text-gray-700">WRHQ Directory</h4>
              </div>
              <input
                type="url"
                value={formData.wrhqDirectoryUrl || ''}
                onChange={(e) => updateField('wrhqDirectoryUrl', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="https://windshieldreplacementhq.com/directory/..."
              />
            </div>

            {/* Creatify Template */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Video className="h-4 w-4 text-purple-600" />
                <h4 className="text-sm font-medium text-gray-700">Creatify Template ID</h4>
              </div>
              <input
                type="text"
                value={formData.creatifyTemplateId || ''}
                onChange={(e) => updateField('creatifyTemplateId', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Template UUID for branded short videos"
              />
            </div>
          </div>
        )}
      </div>

      {/* Automation */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <SectionHeader
          section="automation"
          icon={Zap}
          title="Automated Content Scheduling"
          subtitle={autoScheduleStatus?.slot.dayPairLabel ? `Posts on ${autoScheduleStatus.slot.dayPairLabel}` : "Automatic weekly content generation"}
        />
        {expandedSections.has('automation') && (
          <div className="p-6 space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Enable Automatic Scheduling</h4>
                <p className="text-sm text-gray-500 mt-1">
                  {autoScheduleStatus?.slot.dayPairLabel
                    ? `Automatically create and generate content on ${autoScheduleStatus.slot.dayPairLabel}`
                    : 'Automatically create and generate content weekly (slot assigned on enable)'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoScheduleEnabled ?? false}
                  onChange={(e) => updateField('autoScheduleEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Posts per Week</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="frequency"
                    value="1"
                    checked={(formData.autoScheduleFrequency ?? 2) === 1}
                    onChange={() => updateField('autoScheduleFrequency', 1)}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">1 post per week</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="frequency"
                    value="2"
                    checked={(formData.autoScheduleFrequency ?? 2) === 2}
                    onChange={() => updateField('autoScheduleFrequency', 2)}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">2 posts per week</span>
                </label>
              </div>
            </div>

            {/* Assigned Slot Info */}
            {autoScheduleStatus?.slot.dayPairLabel && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Assigned Schedule</span>
                </div>
                <p className="text-blue-800 font-semibold">{autoScheduleStatus.slot.dayPairLabel}</p>
                {autoScheduleStatus.slot.timeSlotLabel && (
                  <p className="text-sm text-blue-600 mt-1">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {autoScheduleStatus.slot.timeSlotLabel} UTC
                  </p>
                )}
              </div>
            )}

            {/* Status Info */}
            {loadingAutoSchedule ? (
              <div className="text-sm text-gray-500">Loading status...</div>
            ) : autoScheduleStatus && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileQuestion className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">PAA Queue</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {autoScheduleStatus.paaQueue.unused}/{autoScheduleStatus.paaQueue.total}
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    {autoScheduleStatus.paaQueue.custom.total > 0 && (
                      <div className="text-blue-600">
                        Custom: {autoScheduleStatus.paaQueue.custom.unused}/{autoScheduleStatus.paaQueue.custom.total}
                      </div>
                    )}
                    {autoScheduleStatus.paaQueue.standard.total > 0 && (
                      <div className="text-gray-500">
                        Standard: {autoScheduleStatus.paaQueue.standard.unused}/{autoScheduleStatus.paaQueue.standard.total}
                      </div>
                    )}
                    {autoScheduleStatus.paaQueue.isRecycling && (
                      <span className="text-amber-600">Recycling</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700">Locations</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {autoScheduleStatus.locations.active}
                  </div>
                  <div className="text-xs text-gray-500">
                    active service locations
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-purple-600" />
                    <span className="text-sm font-medium text-gray-700">Upcoming</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {autoScheduleStatus.upcoming.count}
                  </div>
                  <div className="text-xs text-gray-500">
                    content items scheduled
                  </div>
                </div>
              </div>
            )}

            {/* Custom PAA Management */}
            <div className="border-t pt-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-blue-600" />
                    <h4 className="text-sm font-medium text-gray-900">Custom PAA Questions</h4>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">PRIORITY</span>
                  </div>
                  {loadingPaas ? (
                    <span className="text-xs text-gray-500">Loading...</span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {existingPaaCount} custom questions
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mb-3">
                  Add custom PAA questions for this client. <strong>Custom PAAs are used first</strong>, before Standard PAAs.
                  Each must include <code className="bg-gray-100 px-1 rounded">{'{location}'}</code> and end with <code className="bg-gray-100 px-1 rounded">?</code>
                </p>

                {/* Fetch from Google Section */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-blue-600" />
                      <h5 className="text-sm font-medium text-blue-900">Fetch PAAs from Google</h5>
                      {dataForSeoConfigured === true && dataForSeoBalance !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          dataForSeoBalance < 0.10
                            ? 'bg-red-100 text-red-700'
                            : dataForSeoBalance < 0.50
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                        }`}>
                          ${dataForSeoBalance.toFixed(2)} credit
                        </span>
                      )}
                      {dataForSeoConfigured === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          Not configured
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={fetchGooglePaas}
                      disabled={fetchingGooglePaas || !formData.city || !formData.state || dataForSeoConfigured === false}
                      variant="outline"
                      className="text-sm"
                    >
                      {fetchingGooglePaas ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Fetch for {formData.city || 'location'}
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-blue-700">
                    Search Google for real &quot;People Also Ask&quot; questions about auto glass in your location.
                    Questions will be automatically formatted with {'{location}'} placeholder.
                  </p>

                  {/* Fetch Error */}
                  {fetchError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 inline mr-2" />
                      {fetchError}
                    </div>
                  )}

                  {/* Fetched Results */}
                  {(fetchedPaas.length > 0 || duplicatesSkipped > 0) && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-900">
                          Found {fetchedPaas.length} new question{fetchedPaas.length !== 1 ? 's' : ''}
                          {duplicatesSkipped > 0 && (
                            <span className="ml-2 text-xs text-amber-600">
                              ({duplicatesSkipped} duplicate{duplicatesSkipped !== 1 ? 's' : ''} skipped)
                            </span>
                          )}
                          {fetchCost !== null && (
                            <span className="ml-2 text-xs text-gray-500">
                              (API cost: ${fetchCost.toFixed(4)})
                            </span>
                          )}
                        </span>
                        {fetchedPaas.length > 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={selectAllPaas}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Select all
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={deselectAllPaas}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Deselect all
                            </button>
                          </div>
                        )}
                      </div>

                      {fetchedPaas.length > 0 ? (
                        <>
                          <div className="max-h-64 overflow-y-auto space-y-2 bg-white rounded-lg border p-2">
                            {fetchedPaas.map((paa, index) => (
                              <label
                                key={index}
                                className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                  paa.selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={paa.selected}
                                  onChange={() => togglePaaSelection(index)}
                                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-900">{paa.formatted}</div>
                                  {paa.original !== paa.formatted && (
                                    <div className="text-xs text-gray-400 mt-0.5">
                                      Original: {paa.original}
                                    </div>
                                  )}
                                  {paa.source && (
                                    <a
                                      href={paa.source}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      Source
                                    </a>
                                  )}
                                </div>
                              </label>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={addSelectedPaasAndSave}
                              disabled={!fetchedPaas.some(p => p.selected) || savingPaas}
                              className="flex-1"
                            >
                              {savingPaas ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-2" />
                                  Save {fetchedPaas.filter(p => p.selected).length} to Queue
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      ) : duplicatesSkipped > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                          All {duplicatesSkipped} questions from Google are already in your queue.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <textarea
                  value={paaText}
                  onChange={(e) => setPaaText(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  rows={6}
                  placeholder={`What is the cost of windshield repair in {location}?\nHow long does auto glass replacement take in {location}?\nCan rock chips be repaired in {location}?`}
                />

                {/* Validation Status */}
                {paaValidation.total > 0 && (
                  <div className="flex items-center gap-4 text-sm mt-2">
                    {paaValidation.valid > 0 && (
                      <span className="text-green-600 font-medium">
                        ✓ {paaValidation.valid} valid
                      </span>
                    )}
                    {paaValidation.invalid > 0 && (
                      <span className="text-amber-600 font-medium">
                        ⚠️ {paaValidation.invalid} invalid
                      </span>
                    )}
                  </div>
                )}

                {/* Error List */}
                {paaValidation.errors.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <p className="text-xs font-medium text-amber-800 mb-1">Issues to fix:</p>
                    <ul className="text-xs text-amber-700 space-y-0.5">
                      {paaValidation.errors.slice(0, 3).map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                      {paaValidation.errors.length > 3 && (
                        <li className="text-amber-600">... and {paaValidation.errors.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Save Buttons */}
                {paaValidation.valid > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      onClick={() => savePaas(true)}
                      disabled={savingPaas}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {savingPaas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add to Queue ({paaValidation.valid})
                    </Button>
                    <Button
                      onClick={() => savePaas(false)}
                      disabled={savingPaas}
                      variant="outline"
                      className="flex items-center gap-2 text-amber-600 hover:text-amber-700"
                    >
                      Replace All
                    </Button>
                  </div>
                )}

                {/* Message */}
                {paaMessage && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    paaMessage.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}>
                    {paaMessage.text}
                  </div>
                )}
              </div>
            </div>

            {/* Test Button */}
            <div className="border-t pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Test Automation</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Create a single test content item to verify everything works
                  </p>
                </div>
                <Button
                  onClick={runAutomationTest}
                  disabled={testRunning || (autoScheduleStatus?.paaQueue.total === 0)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  {testRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running Test...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Test Now
                    </>
                  )}
                </Button>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`rounded-lg p-4 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {testResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-green-800">
                        <Check className="h-4 w-4" />
                        <span className="font-medium">{testResult.message}</span>
                      </div>
                      {testResult.details && (
                        <div className="text-sm text-green-700 space-y-1">
                          <div><strong>PAA:</strong> {testResult.details.paa}</div>
                          <div><strong>Location:</strong> {testResult.details.location}</div>
                        </div>
                      )}
                      {testResult.reviewUrl && (
                        <a
                          href={testResult.reviewUrl}
                          className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                        >
                          View Content & Track Progress
                          <ChevronRight className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertCircle className="h-4 w-4" />
                      <span>{testResult.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <strong>How it works:</strong>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Each PAA question is used only once, then recycled from oldest</li>
                <li>Locations are rotated equally through all service areas</li>
                <li>Content is generated automatically (blog, podcast, images, social, short video)</li>
                <li>Long-form video is skipped (manual for now)</li>
                <li>Runs every Sunday evening for the upcoming week</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Save Button */}
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
