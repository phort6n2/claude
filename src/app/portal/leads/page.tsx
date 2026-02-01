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
  LogOut,
  X,
  Loader2,
  User,
  PlayCircle,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NotificationToggle } from '@/components/portal/NotificationToggle'

interface Lead {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  status: string
  source: string
  quoteValue: number | null
  saleValue: number | null
  saleDate: string | null
  saleNotes: string | null
  callRecordingUrl: string | null
  createdAt: string
  formName: string | null
  formData: Record<string, unknown> | null
}

interface Session {
  authenticated: boolean
  user?: {
    clientId: string
    businessName: string
    email: string
    name: string | null
    logoUrl: string | null
    primaryColor: string | null
  }
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

export default function PortalLeadsPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<SalesStats | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })
  const [showCalendar, setShowCalendar] = useState(false)
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)

  // Check session
  useEffect(() => {
    fetch('/api/portal/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push('/portal/login')
        } else {
          setSession(data)
        }
      })
      .catch(() => {
        router.push('/portal/login')
      })
  }, [router])

  // Load leads for selected date
  useEffect(() => {
    if (!session?.authenticated) return

    setLoading(true)
    setExpandedLeadId(null)
    fetch(`/api/portal/leads?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.leads || [])
        if (data.sales) {
          setSales(data.sales)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, selectedDate])

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

  async function handleLogout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.push('/portal/login')
  }

  function handleLeadUpdate(updatedLead: Lead) {
    setLeads((prev) =>
      prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
    )
    // Refresh sales stats
    fetch(`/api/portal/leads?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.sales) setSales(data.sales)
      })
      .catch(() => {})
  }

  if (!session?.authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Header - Compact */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeaderLogo
                logoUrl={session.user?.logoUrl}
                businessName={session.user?.businessName || ''}
                primaryColor={session.user?.primaryColor}
                size="sm"
              />
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">{session.user?.businessName}</h1>
                <p className="text-[10px] text-gray-500">Lead Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <NotificationToggle />
              <Button variant="outline" size="sm" onClick={handleLogout} className="h-8 px-2">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Date Navigation + Sales Stats - Compact */}
      <div className="bg-white border-b sticky top-[49px] z-30">
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

      {/* Powered by Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 z-40">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-xs">Powered by</span>
          <a
            href="https://autoglassmarketingpros.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="Auto Glass Marketing Pros"
              className="h-5 w-auto"
            />
            <span className="text-white text-xs font-medium">Auto Glass Marketing Pros</span>
          </a>
        </div>
      </div>

      {/* Spacer for fixed footer */}
      <div className="h-10" />
    </div>
  )
}

// Header Logo Component
function HeaderLogo({
  logoUrl,
  businessName,
  primaryColor,
  size = 'md'
}: {
  logoUrl: string | null | undefined
  businessName: string
  primaryColor: string | null | undefined
  size?: 'sm' | 'md'
}) {
  const [imageError, setImageError] = useState(false)
  const sizeClasses = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-lg'

  if (!logoUrl || imageError) {
    return (
      <div
        className={`${sizeClasses} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
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
      className={`${sizeClasses} rounded-full object-cover flex-shrink-0`}
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
  // Check for combined vehicle field first, then fall back to separate fields
  let vehicle = getField(['vehicle', 'Vehicle'])
  if (!vehicle) {
    const year = getField(['vehicle_year', 'Vehicle Year'])
    const make = getField(['vehicle_make', 'Vehicle Make'])
    const model = getField(['vehicle_model', 'Vehicle Model'])
    const vehicleParts = [year, make, model].filter(Boolean)
    vehicle = vehicleParts.length > 0 ? vehicleParts.join(' ') : null
  }
  const vin = getField(['vin', 'VIN', 'Vin'])
  const zipCode = getField(['postal_code', 'postalCode'])
  const insuranceHelp = getField(['insurance_help', 'Would You Like Us To Help Navigate Your Insurance Claim For You?', 'radio_3s0t'])

  return { service, vehicle, vin, zipCode, insuranceHelp }
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
    'recordingUrl', 'recording_url', 'callRecordingUrl', 'call_recording_url', 'audioUrl', 'audio_url',
    // Skip vehicle/service fields (shown in Edit Lead Info section)
    'vehicle', 'Vehicle', 'vehicle_year', 'Vehicle Year', 'vehicle_make', 'Vehicle Make',
    'vehicle_model', 'Vehicle Model', 'interested_in', 'Interested In', 'Interested In:'
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
  const [editQuoteValue, setEditQuoteValue] = useState(lead.quoteValue?.toString() || '')
  const [editSaleValue, setEditSaleValue] = useState(lead.saleValue?.toString() || '')
  const [saving, setSaving] = useState(false)

  // Editable lead info state
  const [showEditInfo, setShowEditInfo] = useState(false)
  const [editFirstName, setEditFirstName] = useState(lead.firstName || '')
  const [editLastName, setEditLastName] = useState(lead.lastName || '')
  const [editVehicle, setEditVehicle] = useState(details.vehicle || '')
  const [editService, setEditService] = useState(details.service || '')

  // Determine which value field to show based on status
  const isQuotedStatus = editStatus === 'QUOTED'
  const isSoldStatus = editStatus === 'SOLD'
  const showValueField = isQuotedStatus || isSoldStatus

  // Reset edit state when lead changes
  useEffect(() => {
    setEditStatus(lead.status)
    setEditQuoteValue(lead.quoteValue?.toString() || '')
    setEditSaleValue(lead.saleValue?.toString() || '')
    setEditFirstName(lead.firstName || '')
    setEditLastName(lead.lastName || '')
    setEditVehicle(details.vehicle || '')
    setEditService(details.service || '')
  }, [lead, details.vehicle, details.service])

  async function handleQuickSave() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { status: editStatus }

      // Save quote value when status is QUOTED
      if (editStatus === 'QUOTED') {
        payload.quoteValue = editQuoteValue ? parseFloat(editQuoteValue) : null
      }
      // Save sale value when status is SOLD
      if (editStatus === 'SOLD') {
        payload.saleValue = editSaleValue ? parseFloat(editSaleValue) : null
      }

      const response = await fetch(`/api/portal/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      const response = await fetch(`/api/portal/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirstName || null,
          lastName: editLastName || null,
          vehicle: editVehicle || null,
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
    (editQuoteValue || '') !== (lead.quoteValue?.toString() || '') ||
    (editSaleValue || '') !== (lead.saleValue?.toString() || '')

  const hasInfoChanges =
    editFirstName !== (lead.firstName || '') ||
    editLastName !== (lead.lastName || '') ||
    editVehicle !== (details.vehicle || '') ||
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
                  {/* Vehicle field */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Vehicle</label>
                    <input
                      type="text"
                      value={editVehicle}
                      onChange={(e) => setEditVehicle(e.target.value)}
                      placeholder="2024 Toyota Camry"
                      className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
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

            {/* Status & Value - Inline Edit */}
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
              {showValueField && (
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">
                    {isQuotedStatus ? 'Quote Value' : 'Sale Value'}
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="number"
                      value={isQuotedStatus ? editQuoteValue : editSaleValue}
                      onChange={(e) => isQuotedStatus ? setEditQuoteValue(e.target.value) : setEditSaleValue(e.target.value)}
                      placeholder="0"
                      className="w-full pl-7 pr-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
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

            {/* Quote & Sale indicators */}
            {(lead.quoteValue || lead.saleValue) && (
              <div className="flex items-center gap-4">
                {lead.quoteValue && (
                  <div className="flex items-center gap-2 text-purple-600 font-semibold">
                    <DollarSign className="h-4 w-4" />
                    Quote: ${lead.quoteValue.toLocaleString()}
                  </div>
                )}
                {lead.saleValue && (
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                    <TrendingUp className="h-4 w-4" />
                    Sale: ${lead.saleValue.toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
