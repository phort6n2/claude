'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  DollarSign,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  X,
  Loader2,
  User,
  Building2,
  ShieldX,
  CheckCircle2,
  PlayCircle,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Lead {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  status: string
  source: string
  gclid: string | null
  saleValue: number | null
  saleDate: string | null
  saleNotes: string | null
  callRecordingUrl: string | null
  createdAt: string
  formName: string | null
  formData: Record<string, unknown> | null
  enhancedConversionSent: boolean
  offlineConversionSent: boolean
}

interface Client {
  id: string
  businessName: string
  slug: string
  logoUrl: string | null
  primaryColor: string | null
  timezone?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  NEW: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONTACTED: { label: 'Contacted', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: MessageSquare },
  QUOTED: { label: 'Quoted', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: DollarSign },
  SOLD: { label: 'Sold', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: TrendingUp },
  LOST: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
}

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}))

interface SalesStats {
  today: { count: number; total: number }
  week: { count: number; total: number }
  month: { count: number; total: number }
}

export default function StandaloneMasterLeadsPage() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(true)
  const [sales, setSales] = useState<SalesStats | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [showCalendar, setShowCalendar] = useState(false)
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)

  // Check master leads authorization
  useEffect(() => {
    fetch('/api/admin/master-leads/auth')
      .then((res) => res.json())
      .then((data) => {
        if (data?.authorized) {
          setAuthenticated(true)
        } else if (data?.reason === 'not_authenticated') {
          router.push('/login')
        } else {
          setAuthenticated(false)
          setClientsLoading(false)
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => setAuthChecking(false))
  }, [router])

  // Load clients on mount
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClients(data)
        }
      })
      .catch(console.error)
      .finally(() => setClientsLoading(false))
  }, [authenticated])

  // Update selected client when ID changes
  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId)
      setSelectedClient(client || null)
    } else {
      setSelectedClient(null)
    }
  }, [selectedClientId, clients])

  // Load leads for selected client and date
  useEffect(() => {
    if (!selectedClientId || !authenticated) {
      setLeads([])
      setSales(null)
      return
    }

    setLoading(true)
    setExpandedLeadId(null)

    const [year, month, day] = selectedDate.split('-').map(Number)
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    fetch(`/api/leads?clientId=${selectedClientId}&startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.leads || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))

    fetch(`/api/admin/master-leads/stats?clientId=${selectedClientId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.sales) {
          setSales(data.sales)
        }
      })
      .catch(console.error)
  }, [selectedClientId, selectedDate, authenticated])

  function changeDate(days: number) {
    const date = new Date(selectedDate + 'T12:00:00')
    date.setDate(date.getDate() + days)
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    setSelectedDate(localDate)
  }

  function formatDateDisplay(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  function handleLeadUpdate(updatedLead: Lead) {
    setLeads((prev) =>
      prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
    )
    // Refresh sales stats
    if (selectedClientId) {
      fetch(`/api/admin/master-leads/stats?clientId=${selectedClientId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.sales) setSales(data.sales)
        })
        .catch(() => {})
    }
  }

  if (authChecking || clientsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 text-center max-w-md shadow-lg">
          <ShieldX className="h-16 w-16 mx-auto mb-4 text-red-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            You don&apos;t have permission to access this page.
          </p>
          <Button onClick={() => router.push('/admin')}>
            Go to Admin
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with Client Selector */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {selectedClient ? (
                <ClientLogo
                  logoUrl={selectedClient.logoUrl}
                  businessName={selectedClient.businessName}
                  primaryColor={selectedClient.primaryColor}
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-gray-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full pr-8 py-1 text-lg font-bold text-gray-900 bg-transparent border-0 focus:ring-0 focus:outline-none appearance-none cursor-pointer truncate"
                    style={{ paddingLeft: 0 }}
                  >
                    <option value="">Select Client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.businessName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-600">Master Leads</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {selectedClientId ? (
        <>
          {/* Date Navigation + Sales Stats - Compact */}
          <div className="bg-white border-b sticky top-[57px] z-30">
            <div className="max-w-3xl mx-auto px-4 py-2">
              <div className="flex items-center justify-between">
                {/* Date Nav */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeDate(-1)}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowCalendar(!showCalendar)}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-900"
                  >
                    <span className="text-sm font-medium">{formatDateDisplay(selectedDate)}</span>
                    <ChevronDown className={`h-3 w-3 transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    onClick={() => changeDate(1)}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Compact Sales Stats */}
                {sales && (
                  <div className="flex items-center gap-3 text-xs">
                    <div className="text-center">
                      <span className="text-gray-500">Today</span>
                      <span className="ml-1 font-semibold text-emerald-600">${sales.today.total.toLocaleString()}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-gray-500">Week</span>
                      <span className="ml-1 font-semibold text-emerald-600">${sales.week.total.toLocaleString()}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-gray-500">Month</span>
                      <span className="ml-1 font-semibold text-emerald-600">${sales.month.total.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lead Count */}
          <div className="max-w-3xl mx-auto px-4 py-1.5">
            <p className="text-xs text-gray-600">
              {loading ? 'Loading...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Leads List */}
          <div className="max-w-3xl mx-auto px-4 pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : leads.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center">
                <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No leads on this date</p>
                <button
                  onClick={() => {
                    const today = new Date()
                    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                    setSelectedDate(localDate)
                  }}
                  className="mt-3 text-blue-600 hover:underline text-sm"
                >
                  Go to today
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    isExpanded={expandedLeadId === lead.id}
                    isDimmed={expandedLeadId !== null && expandedLeadId !== lead.id}
                    onToggle={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                    onUpdate={handleLeadUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-20">
          <div className="bg-white rounded-xl p-8 text-center">
            <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a Client</h2>
            <p className="text-gray-500">Choose a client from the dropdown above to view their leads</p>
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      {showCalendar && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-50"
            onClick={() => setShowCalendar(false)}
          />
          <div className="fixed md:top-1/3 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 bottom-0 left-0 right-0 md:bottom-auto md:left-1/2 md:right-auto bg-white md:rounded-xl rounded-t-xl shadow-2xl md:w-[300px] w-full z-[51] overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80">Select Date</p>
                  <p className="text-xl font-semibold">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="md:hidden p-2 hover:bg-white/20 rounded-full"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value)
                  setShowCalendar(false)
                }}
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-gray-900 text-lg"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    const today = new Date()
                    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                    setSelectedDate(localDate)
                    setShowCalendar(false)
                  }}
                  className="flex-1 px-4 py-3 text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Today
                </button>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="flex-1 px-4 py-3 text-base bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Client Logo Component
function ClientLogo({
  logoUrl,
  businessName,
  primaryColor
}: {
  logoUrl: string | null | undefined
  businessName: string
  primaryColor: string | null | undefined
}) {
  const [imageError, setImageError] = useState(false)

  if (!logoUrl || imageError) {
    return (
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
        style={{ backgroundColor: primaryColor || '#1e40af' }}
      >
        {businessName[0] || '?'}
      </div>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={businessName}
      className="h-10 w-10 rounded-full object-cover flex-shrink-0"
      onError={() => setImageError(true)}
    />
  )
}

// Helper to extract lead details from formData
function getLeadDetails(lead: Lead) {
  const fd = lead.formData
  const raw = fd?._rawPayload as Record<string, unknown> | null

  const getField = (keys: string[]): string | null => {
    for (const key of keys) {
      if (fd?.[key]) return String(fd[key])
    }
    for (const key of keys) {
      if (raw?.[key]) return String(raw[key])
    }
    return null
  }

  const service = getField(['interested_in', 'Interested In:', 'Interested In'])
  const year = getField(['vehicle_year', 'Vehicle Year'])
  const make = getField(['vehicle_make', 'Vehicle Make'])
  const model = getField(['vehicle_model', 'Vehicle Model'])
  const vin = getField(['vin', 'VIN', 'Vin'])
  const zipCode = getField(['postal_code', 'postalCode'])
  const insuranceHelp = getField(['insurance_help', 'Would You Like Us To Help Navigate Your Insurance Claim For You?', 'radio_3s0t'])

  const vehicleParts = [year, make, model].filter(Boolean)
  const vehicle = vehicleParts.length > 0 ? vehicleParts.join(' ') : null

  return { service, vehicle, year, make, model, vin, zipCode, insuranceHelp }
}

// Helper to get all form data fields for display
function getAllFormFields(lead: Lead): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = []
  const fd = lead.formData
  if (!fd) return fields

  // Keys to skip (internal, already shown elsewhere, or not useful)
  const skipKeys = new Set([
    '_rawPayload', 'id', 'contactId', 'locationId', 'email', 'phone',
    'firstName', 'lastName', 'first_name', 'last_name', 'name', 'full_name',
    'source', 'type', 'dateAdded', 'date_added', 'timestamp',
    // Skip these per user request
    'tags', 'country', 'timezone', 'contact_type', 'contactType', 'contact_source', 'contactSource',
    // Skip recording URL (audio player is shown separately)
    'recordingUrl', 'recording_url', 'callRecordingUrl', 'call_recording_url', 'audioUrl', 'audio_url'
  ])

  // Label formatting helper
  const formatLabel = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim()
  }

  // Extract fields from formData
  for (const [key, value] of Object.entries(fd)) {
    if (skipKeys.has(key)) continue
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'object') continue

    fields.push({
      label: formatLabel(key),
      value: String(value)
    })
  }

  return fields
}

// Expandable Lead Row Component
function LeadRow({
  lead,
  isExpanded,
  isDimmed,
  onToggle,
  onUpdate,
}: {
  lead: Lead
  isExpanded: boolean
  isDimmed: boolean
  onToggle: () => void
  onUpdate: (lead: Lead) => void
}) {
  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  const isPhoneLead = lead.source === 'PHONE'
  const details = getLeadDetails(lead)

  // Edit state
  const [editStatus, setEditStatus] = useState(lead.status)
  const [editSaleValue, setEditSaleValue] = useState(lead.saleValue?.toString() || '')
  const [saving, setSaving] = useState(false)

  // Editable lead info state
  const [showEditInfo, setShowEditInfo] = useState(false)
  const [editFirstName, setEditFirstName] = useState(lead.firstName || '')
  const [editLastName, setEditLastName] = useState(lead.lastName || '')
  const [editVehicleYear, setEditVehicleYear] = useState(details.year || '')
  const [editVehicleMake, setEditVehicleMake] = useState(details.make || '')
  const [editVehicleModel, setEditVehicleModel] = useState(details.model || '')
  const [editService, setEditService] = useState(details.service || '')

  // Reset edit state when lead changes
  useEffect(() => {
    setEditStatus(lead.status)
    setEditSaleValue(lead.saleValue?.toString() || '')
    setEditFirstName(lead.firstName || '')
    setEditLastName(lead.lastName || '')
    setEditVehicleYear(details.year || '')
    setEditVehicleMake(details.make || '')
    setEditVehicleModel(details.model || '')
    setEditService(details.service || '')
  }, [lead, details.year, details.make, details.model, details.service])

  async function handleQuickSave() {
    setSaving(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          saleValue: editSaleValue ? parseFloat(editSaleValue) : null,
        }),
      })
      if (!response.ok) throw new Error('Failed to save')
      const updated = await response.json()
      onUpdate({ ...lead, ...updated })
    } catch {
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveInfo() {
    setSaving(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirstName || null,
          lastName: editLastName || null,
          vehicleYear: editVehicleYear || null,
          vehicleMake: editVehicleMake || null,
          vehicleModel: editVehicleModel || null,
          interestedIn: editService || null,
        }),
      })
      if (!response.ok) throw new Error('Failed to save')
      const updated = await response.json()
      onUpdate({ ...lead, ...updated })
      setShowEditInfo(false)
    } catch {
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const hasStatusChanges = editStatus !== lead.status ||
    (editSaleValue || '') !== (lead.saleValue?.toString() || '')

  const hasInfoChanges =
    editFirstName !== (lead.firstName || '') ||
    editLastName !== (lead.lastName || '') ||
    editVehicleYear !== (details.year || '') ||
    editVehicleMake !== (details.make || '') ||
    editVehicleModel !== (details.model || '') ||
    editService !== (details.service || '')

  // Border color: orange for calls, blue for forms
  const borderColor = isPhoneLead ? 'border-l-4 border-orange-400' : 'border-l-4 border-blue-400'

  return (
    <div className="rounded-xl overflow-hidden">
      {/* Main row */}
      <div
        className={`bg-white shadow-sm transition-all duration-200 ${borderColor} ${isDimmed ? 'opacity-40' : ''} ${isExpanded ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      >
        {/* Collapsed Row */}
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 flex items-center gap-3 text-left"
        >
          {/* Expand indicator */}
          <ChevronRight
            className={`h-5 w-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium text-gray-900 truncate">{fullName}</span>
              {lead.callRecordingUrl && (
                <PlayCircle className="h-4 w-4 text-violet-500 flex-shrink-0" />
              )}
              {lead.gclid && (
                <span className="text-xs text-green-600 font-medium">Ads</span>
              )}
              {lead.enhancedConversionSent && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {lead.phone && <span>{lead.phone}</span>}
              {details.service && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="truncate">{details.service}</span>
                </>
              )}
            </div>
          </div>

          {/* Status & Time */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            <span className="text-xs text-gray-500">
              {new Date(lead.createdAt).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
            {/* Call Recording */}
            {lead.callRecordingUrl && (
              <div className="pt-3">
                <div className="bg-violet-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <PlayCircle className="h-4 w-4 text-violet-600" />
                    <span className="text-sm text-violet-800 font-medium">Call Recording</span>
                  </div>
                  <audio
                    controls
                    className="w-full h-10"
                    src={lead.callRecordingUrl}
                  >
                    Your browser does not support audio.
                  </audio>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2">
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 active:bg-green-700"
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              )}
              {lead.phone && (
                <a
                  href={`sms:${lead.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 active:bg-purple-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  Text
                </a>
              )}
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 active:bg-blue-700"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              )}
            </div>

            {/* Edit Lead Info - Expandable */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowEditInfo(!showEditInfo)}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 text-sm text-gray-700"
              >
                <span className="font-medium">
                  {!lead.firstName && !lead.lastName ? '+ Add Name & Info' : 'Edit Lead Info'}
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showEditInfo ? 'rotate-180' : ''}`} />
              </button>
              {showEditInfo && (
                <div className="p-3 space-y-3 bg-white">
                  {/* Name fields */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">First Name</label>
                      <input
                        type="text"
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        placeholder="First"
                        className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        placeholder="Last"
                        className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  {/* Service */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Service Needed</label>
                    <input
                      type="text"
                      value={editService}
                      onChange={(e) => setEditService(e.target.value)}
                      placeholder="e.g., Windshield Replacement"
                      className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  {/* Vehicle fields */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Year</label>
                      <input
                        type="text"
                        value={editVehicleYear}
                        onChange={(e) => setEditVehicleYear(e.target.value)}
                        placeholder="2024"
                        className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Make</label>
                      <input
                        type="text"
                        value={editVehicleMake}
                        onChange={(e) => setEditVehicleMake(e.target.value)}
                        placeholder="Toyota"
                        className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Model</label>
                      <input
                        type="text"
                        value={editVehicleModel}
                        onChange={(e) => setEditVehicleModel(e.target.value)}
                        placeholder="Camry"
                        className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  {/* Save button */}
                  {hasInfoChanges && (
                    <button
                      onClick={handleSaveInfo}
                      disabled={saving}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Save Info
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Lead Details - All Available Info */}
            {getAllFormFields(lead).length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Lead Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {getAllFormFields(lead).map((field, idx) => (
                    <div key={idx} className={field.value.length > 30 ? 'col-span-2' : ''}>
                      <span className="text-gray-500 text-xs">{field.label}</span>
                      <p className="text-gray-900 font-medium break-words">{field.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Google Ads Sync Status */}
            {(lead.gclid || lead.enhancedConversionSent || lead.offlineConversionSent) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {lead.gclid && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    Google Ads Lead
                  </span>
                )}
                {lead.enhancedConversionSent && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Lead Synced
                  </span>
                )}
                {lead.offlineConversionSent && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <DollarSign className="h-3 w-3" />
                    <CheckCircle2 className="h-3 w-3" />
                    Sale Synced
                  </span>
                )}
              </div>
            )}

            {/* Status & Sale - Inline Edit */}
            <div className="flex gap-3 items-end pt-2 border-t border-gray-100">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Sale Value</label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    value={editSaleValue}
                    onChange={(e) => setEditSaleValue(e.target.value)}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              {hasStatusChanges && (
                <button
                  onClick={handleQuickSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save
                </button>
              )}
            </div>

            {/* Sale indicator */}
            {lead.saleValue && (
              <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                <TrendingUp className="h-4 w-4" />
                Sale: ${lead.saleValue.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
