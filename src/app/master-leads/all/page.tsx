'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  ShieldX,
  CheckCircle2,
  PlayCircle,
  Check,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/PullToRefresh'

interface Lead {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  status: string
  source: string
  gclid: string | null
  quoteValue: number | null
  saleValue: number | null
  saleDate: string | null
  saleNotes: string | null
  callRecordingUrl: string | null
  createdAt: string
  formName: string | null
  formData: Record<string, unknown> | null
  enhancedConversionSent: boolean
  offlineConversionSent: boolean
  client?: {
    id: string
    businessName: string
    slug: string
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

export default function AllLeadsPage() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
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
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => setAuthChecking(false))
  }, [router])

  // Function to load all leads
  const loadLeads = useCallback(async (showLoadingState = true) => {
    if (!authenticated) {
      setLeads([])
      return
    }

    if (showLoadingState) {
      setLoading(true)
      setExpandedLeadId(null)
    }

    const [year, month, day] = selectedDate.split('-').map(Number)
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    try {
      // Fetch leads from all clients
      const res = await fetch(`/api/admin/master-leads/all?startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`)
      const data = await res.json()
      setLeads(data.leads || [])
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      if (showLoadingState) {
        setLoading(false)
      }
    }
  }, [selectedDate, authenticated])

  // Load leads
  useEffect(() => {
    loadLeads(true)
  }, [loadLeads])

  // Auto-refresh every 30 seconds when viewing today's leads
  useEffect(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    if (selectedDate !== todayStr || !authenticated) {
      return
    }

    const interval = setInterval(() => {
      loadLeads(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [selectedDate, authenticated, loadLeads])

  // Pull-to-refresh
  const { isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh: async () => {
      await loadLeads(false)
    },
  })

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
      prev.map((l) => (l.id === updatedLead.id ? { ...updatedLead, client: l.client } : l))
    )
  }

  if (authChecking) {
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
    <div className="min-h-screen bg-gray-100 overflow-x-hidden overflow-y-auto">
      {/* Pull to Refresh Indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
      />

      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/master-leads"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">All Leads</h1>
              <p className="text-xs text-gray-600">All clients combined</p>
            </div>
          </div>
        </div>
      </header>

      {/* Date Navigation */}
      <div className="bg-white border-b sticky top-[57px] z-30">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-3">
              {leads.length > 0 && (() => {
                const adsLeads = leads.filter(l => l.gclid)
                const syncedLeads = leads.filter(l => l.enhancedConversionSent || l.offlineConversionSent)
                return (
                  <>
                    {/* Sync status for all leads */}
                    <span className={`text-xs font-medium ${syncedLeads.length === leads.length ? 'text-green-600' : 'text-orange-500'}`}>
                      {syncedLeads.length}/{leads.length} synced
                    </span>
                    {/* Google Ads leads count */}
                    {adsLeads.length > 0 && (
                      <span className="text-xs text-gray-500">
                        ({adsLeads.length} from Ads)
                      </span>
                    )}
                  </>
                )
              })()}
              <span className="text-sm text-gray-500">
                {leads.length} lead{leads.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Leads List */}
      <div className="max-w-3xl mx-auto px-4 py-3 pb-48">
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
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 z-50">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <span className="text-gray-400 text-xs">Powered by</span>
          <a href="https://autoglassmarketingpros.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Auto Glass Marketing Pros" className="h-5 w-auto" />
            <span className="text-white text-xs font-medium">Auto Glass Marketing Pros</span>
          </a>
        </div>
      </div>
    </div>
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
  const vehicleParts = [year, make, model].filter(Boolean)
  const vehicle = vehicleParts.length > 0 ? vehicleParts.join(' ') : null

  return { service, vehicle, year, make, model }
}

// Expandable Lead Row Component with Client Badge
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
  const rowRef = useRef<HTMLDivElement>(null)
  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  const isPhoneLead = lead.source === 'PHONE'
  const details = getLeadDetails(lead)

  // Scroll expanded lead into view
  useEffect(() => {
    if (isExpanded && rowRef.current) {
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    }
  }, [isExpanded])

  // Edit state
  const [editStatus, setEditStatus] = useState(lead.status)
  const [editQuoteValue, setEditQuoteValue] = useState(lead.quoteValue?.toString() || '')
  const [editSaleValue, setEditSaleValue] = useState(lead.saleValue?.toString() || '')
  const [saving, setSaving] = useState(false)

  const isQuotedStatus = editStatus === 'QUOTED'
  const isSoldStatus = editStatus === 'SOLD'
  const showValueField = isQuotedStatus || isSoldStatus

  useEffect(() => {
    setEditStatus(lead.status)
    setEditQuoteValue(lead.quoteValue?.toString() || '')
    setEditSaleValue(lead.saleValue?.toString() || '')
  }, [lead])

  async function handleQuickSave() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { status: editStatus }
      if (editStatus === 'QUOTED') {
        payload.quoteValue = editQuoteValue ? parseFloat(editQuoteValue) : null
      }
      if (editStatus === 'SOLD') {
        payload.saleValue = editSaleValue ? parseFloat(editSaleValue) : null
      }

      const response = await fetch(`/api/leads/${lead.id}`, {
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

  const hasStatusChanges = editStatus !== lead.status ||
    (editQuoteValue || '') !== (lead.quoteValue?.toString() || '') ||
    (editSaleValue || '') !== (lead.saleValue?.toString() || '')

  const borderColor = isPhoneLead ? 'border-l-4 border-orange-400' : 'border-l-4 border-blue-400'

  return (
    <div ref={rowRef} className="rounded-xl overflow-hidden">
      <div
        className={`bg-white shadow-sm transition-all duration-200 ${borderColor} ${isDimmed ? 'opacity-40' : ''} ${isExpanded ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      >
        {/* Collapsed Row */}
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 flex items-center gap-3 text-left"
        >
          <ChevronRight
            className={`h-5 w-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          />

          <div className="flex-1 min-w-0">
            {/* Client badge */}
            {lead.client && (
              <div className="mb-1">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white truncate max-w-[200px]"
                  style={{ backgroundColor: lead.client.primaryColor || '#3b82f6' }}
                >
                  {lead.client.businessName}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium text-gray-900 truncate">{fullName}</span>
              {lead.callRecordingUrl && (
                <PlayCircle className="h-4 w-4 text-violet-500 flex-shrink-0" />
              )}
              {/* Google Ads icon for leads from ads */}
              {lead.gclid && (
                <span title="Lead from Google Ads">
                  <img src="/google-ads-icon.svg" alt="From Google Ads" className="h-4 w-4 flex-shrink-0" />
                </span>
              )}
              {/* Sync status indicator for all leads */}
              {(lead.enhancedConversionSent || lead.offlineConversionSent) ? (
                <span title="Synced to Google">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                </span>
              ) : (
                <span title="Pending sync">
                  <Clock className="h-4 w-4 text-orange-400 flex-shrink-0" />
                </span>
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

            {/* Lead Details */}
            {(details.vehicle || details.service) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Lead Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {details.service && (
                    <div className="col-span-2">
                      <span className="text-gray-500 text-xs">Service</span>
                      <p className="text-gray-900 font-medium">{details.service}</p>
                    </div>
                  )}
                  {details.vehicle && (
                    <div>
                      <span className="text-gray-500 text-xs">Vehicle</span>
                      <p className="text-gray-900 font-medium">{details.vehicle}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status & Value */}
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
