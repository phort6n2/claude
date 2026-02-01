'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone,
  Mail,
  Calendar,
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HeaderLogo
                logoUrl={session.user?.logoUrl}
                businessName={session.user?.businessName || ''}
                primaryColor={session.user?.primaryColor}
              />
              <div>
                <h1 className="text-lg font-bold text-gray-900">{session.user?.businessName}</h1>
                <p className="text-xs text-gray-600">Lead Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationToggle />
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Date Navigation */}
      <div className="bg-white border-b sticky top-[57px] z-30">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors min-w-[160px] justify-center text-gray-900"
            >
              <Calendar className="h-4 w-4" />
              <span className="font-medium">{formatDateDisplay(selectedDate)}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={() => changeDate(1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sales Stats */}
      {sales && (
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white rounded-lg p-3 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Today</p>
              <p className="text-lg font-bold text-emerald-600">${sales.today.total.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{sales.today.count} sale{sales.today.count !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">This Week</p>
              <p className="text-lg font-bold text-emerald-600">${sales.week.total.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{sales.week.count} sale{sales.week.count !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">This Month</p>
              <p className="text-lg font-bold text-emerald-600">${sales.month.total.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{sales.month.count} sale{sales.month.count !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* Lead Count */}
      <div className="max-w-3xl mx-auto px-4 py-2">
        <p className="text-sm text-gray-700">
          {loading ? 'Loading...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} on ${formatDateDisplay(selectedDate)}`}
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
    </div>
  )
}

// Header Logo Component
function HeaderLogo({
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

// Expandable Lead Row Component
function LeadRow({
  lead,
  isExpanded,
  onToggle,
  onUpdate,
}: {
  lead: Lead
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (lead: Lead) => void
}) {
  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
  const StatusIcon = statusConfig.icon
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  const isPhoneLead = lead.source === 'PHONE'
  const details = getLeadDetails(lead)

  // Edit state
  const [editStatus, setEditStatus] = useState(lead.status)
  const [editSaleValue, setEditSaleValue] = useState(lead.saleValue?.toString() || '')
  const [saving, setSaving] = useState(false)

  // Swipe state for quick actions
  const rowRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)

  // Reset edit state when lead changes
  useEffect(() => {
    setEditStatus(lead.status)
    setEditSaleValue(lead.saleValue?.toString() || '')
  }, [lead])

  async function handleQuickSave() {
    setSaving(true)
    try {
      const response = await fetch(`/api/portal/leads/${lead.id}`, {
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

  // Touch handlers for swipe
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.touches[0].clientX
    // Only allow left swipe (positive diff) up to 100px
    if (diff > 0 && diff < 100) {
      setSwipeOffset(diff)
    }
  }

  function handleTouchEnd() {
    if (swipeOffset > 50) {
      // Trigger call action
      if (lead.phone) {
        window.location.href = `tel:${lead.phone}`
      }
    }
    setSwipeOffset(0)
    touchStartX.current = null
  }

  const hasChanges = editStatus !== lead.status ||
    (editSaleValue || '') !== (lead.saleValue?.toString() || '')

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe action background */}
      <div
        className="absolute inset-y-0 right-0 bg-green-500 flex items-center justify-end pr-4"
        style={{ width: swipeOffset > 0 ? '100px' : 0 }}
      >
        <Phone className="h-6 w-6 text-white" />
      </div>

      {/* Main row */}
      <div
        ref={rowRef}
        className={`bg-white shadow-sm transition-transform ${isPhoneLead ? 'border-l-4 border-orange-400' : ''}`}
        style={{ transform: `translateX(-${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              <StatusIcon className="h-3 w-3" />
              {statusConfig.label}
            </div>
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

            {/* Lead Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {details.vehicle && (
                <div>
                  <span className="text-gray-500 text-xs">Vehicle</span>
                  <p className="text-gray-900 font-medium">{details.vehicle}</p>
                </div>
              )}
              {details.zipCode && (
                <div>
                  <span className="text-gray-500 text-xs">ZIP Code</span>
                  <p className="text-gray-900 font-medium">{details.zipCode}</p>
                </div>
              )}
              {details.insuranceHelp && (
                <div>
                  <span className="text-gray-500 text-xs">Insurance Help</span>
                  <p className="text-gray-900 font-medium">{details.insuranceHelp}</p>
                </div>
              )}
              {details.vin && (
                <div className="col-span-2">
                  <span className="text-gray-500 text-xs">VIN</span>
                  <p className="text-gray-900 font-medium font-mono text-xs">{details.vin}</p>
                </div>
              )}
            </div>

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
              {hasChanges && (
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
