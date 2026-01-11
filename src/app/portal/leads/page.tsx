'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone,
  Mail,
  Calendar,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  LogOut,
  X,
  Save,
  Loader2,
  User,
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
  saleValue: number | null
  saleDate: string | null
  saleNotes: string | null
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

export default function PortalLeadsPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [showCalendar, setShowCalendar] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [mobilePageIndex, setMobilePageIndex] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Lead detail form state
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editSaleValue, setEditSaleValue] = useState('')
  const [editSaleDate, setEditSaleDate] = useState('')
  const [editSaleNotes, setEditSaleNotes] = useState('')
  const [saving, setSaving] = useState(false)

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
    setMobilePageIndex(0)
    fetch(`/api/portal/leads?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.leads || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, selectedDate])

  // When lead is selected, populate form
  useEffect(() => {
    if (selectedLead) {
      setEditFirstName(selectedLead.firstName || '')
      setEditLastName(selectedLead.lastName || '')
      setEditEmail(selectedLead.email || '')
      setEditPhone(selectedLead.phone || '')
      setEditStatus(selectedLead.status)
      setEditSaleValue(selectedLead.saleValue?.toString() || '')
      setEditSaleDate(selectedLead.saleDate?.split('T')[0] || '')
      setEditSaleNotes(selectedLead.saleNotes || '')
    }
  }, [selectedLead])

  function changeDate(days: number) {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + days)
    setSelectedDate(date.toISOString().split('T')[0])
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

  function formatTime(dateString: string) {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatPhoneDisplay(phone: string) {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
  }

  async function handleLogout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.push('/portal/login')
  }

  async function handleSaveLead() {
    if (!selectedLead) return
    setSaving(true)

    try {
      const response = await fetch(`/api/portal/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editFirstName || null,
          lastName: editLastName || null,
          email: editEmail || null,
          phone: editPhone || null,
          status: editStatus,
          saleValue: editSaleValue ? parseFloat(editSaleValue) : null,
          saleDate: editSaleDate || null,
          saleNotes: editSaleNotes || null,
        }),
      })

      if (!response.ok) throw new Error('Failed to save')

      const updated = await response.json()
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedLead.id ? { ...l, ...updated } : l))
      )
      setSelectedLead(null)
    } catch (err) {
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // Mobile pagination
  const cardsPerPage = 6
  const totalPages = Math.ceil(leads.length / cardsPerPage)
  const mobileLeads = leads.slice(
    mobilePageIndex * cardsPerPage,
    (mobilePageIndex + 1) * cardsPerPage
  )

  // Handle swipe
  function handleSwipe(direction: 'left' | 'right') {
    if (direction === 'left' && mobilePageIndex < totalPages - 1) {
      setMobilePageIndex(mobilePageIndex + 1)
    } else if (direction === 'right' && mobilePageIndex > 0) {
      setMobilePageIndex(mobilePageIndex - 1)
    }
  }

  // Touch handling for swipe (page navigation)
  const touchStart = useRef<number | null>(null)
  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart.current === null) return
    const touchEnd = e.changedTouches[0].clientX
    const diff = touchStart.current - touchEnd
    if (Math.abs(diff) > 50) {
      handleSwipe(diff > 0 ? 'left' : 'right')
    }
    touchStart.current = null
  }

  // Modal swipe navigation between leads
  const modalTouchStart = useRef<number | null>(null)
  function handleModalTouchStart(e: React.TouchEvent) {
    modalTouchStart.current = e.touches[0].clientX
  }
  function handleModalTouchEnd(e: React.TouchEvent) {
    if (modalTouchStart.current === null || !selectedLead) return
    const touchEnd = e.changedTouches[0].clientX
    const diff = modalTouchStart.current - touchEnd
    if (Math.abs(diff) > 50) {
      const currentIndex = leads.findIndex(l => l.id === selectedLead.id)
      if (diff > 0 && currentIndex < leads.length - 1) {
        // Swipe left = next lead
        setSelectedLead(leads[currentIndex + 1])
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe right = previous lead
        setSelectedLead(leads[currentIndex - 1])
      }
    }
    modalTouchStart.current = null
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
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{session.user?.businessName}</h1>
              <p className="text-xs text-gray-600">Lead Portal</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Date Navigation */}
      <div className="bg-white border-b sticky top-[57px] z-30">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors min-w-[160px] justify-center text-gray-900"
            >
              <Calendar className="h-4 w-4" />
              <span className="font-medium">{formatDateDisplay(selectedDate)}</span>
            </button>

            <button
              onClick={() => changeDate(1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Calendar Popup */}
          {showCalendar && (
            <div className="absolute left-1/2 -translate-x-1/2 mt-2 bg-white rounded-lg shadow-lg border p-4 z-50">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value)
                  setShowCalendar(false)
                }}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    setSelectedDate(new Date().toISOString().split('T')[0])
                    setShowCalendar(false)
                  }}
                  className="flex-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Today
                </button>
                <button
                  onClick={() => setShowCalendar(false)}
                  className="flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lead Count */}
      <div className="max-w-6xl mx-auto px-4 py-2">
        <p className="text-sm text-gray-700">
          {loading ? 'Loading...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} on ${formatDateDisplay(selectedDate)}`}
        </p>
      </div>

      {/* Leads Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : leads.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">No leads on this date</p>
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="mt-3 text-blue-600 hover:underline text-sm"
            >
              Go to today
            </button>
          </div>
        ) : (
          <>
            {/* Mobile View - Swipeable Cards */}
            <div
              className="md:hidden"
              ref={scrollContainerRef}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="grid grid-cols-2 gap-3">
                {mobileLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={() => setSelectedLead(lead)}
                  />
                ))}
              </div>

              {/* Pagination Dots */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setMobilePageIndex(i)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === mobilePageIndex ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Swipe hint */}
              {totalPages > 1 && (
                <p className="text-center text-xs text-gray-600 mt-2">
                  Swipe or tap dots to see more
                </p>
              )}
            </div>

            {/* Desktop View - All Cards */}
            <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-4">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => setSelectedLead(lead)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-hidden">
          <div
            className="bg-white w-full md:max-w-lg rounded-xl max-h-[85vh] overflow-y-auto overflow-x-hidden"
            onTouchStart={handleModalTouchStart}
            onTouchEnd={handleModalTouchEnd}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-xl">
              <div>
                <h2 className="font-semibold text-lg text-gray-900">Lead Details</h2>
                <p className="text-xs text-gray-500">
                  {leads.findIndex(l => l.id === selectedLead.id) + 1} of {leads.length} • Swipe to navigate
                </p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Source indicator for phone leads */}
              {selectedLead.source === 'PHONE' && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-orange-800 font-medium">Phone Call Lead</span>
                </div>
              )}

              {/* Contact Info - Editable */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">Contact Info</h4>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(selectedLead.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Name fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">First Name</label>
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                    className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                  />
                </div>

                {/* Quick contact actions */}
                {(editPhone || editEmail) && (
                  <div className="flex gap-2 pt-2">
                    {editPhone && (
                      <a
                        href={`tel:${editPhone}`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200"
                      >
                        <Phone className="h-4 w-4" />
                        Call
                      </a>
                    )}
                    {editEmail && (
                      <a
                        href={`mailto:${editEmail}`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200"
                      >
                        <Mail className="h-4 w-4" />
                        Email
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Form Data / Lead Details */}
              {selectedLead.formData && Object.keys(selectedLead.formData).length > 0 && (() => {
                const fd = selectedLead.formData as Record<string, unknown>
                const hasDetails = fd.interested_in || fd.vehicle_year || fd.vehicle_make || fd.vehicle_model || fd.vin || fd.radio_3s0t || fd.postal_code
                if (!hasDetails) return null
                return (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Lead Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {fd.interested_in ? (
                        <div>
                          <span className="text-gray-500">Interested In</span>
                          <p className="font-medium text-gray-900">{String(fd.interested_in)}</p>
                        </div>
                      ) : null}
                      {fd.postal_code ? (
                        <div>
                          <span className="text-gray-500">Zip Code</span>
                          <p className="font-medium text-gray-900">{String(fd.postal_code)}</p>
                        </div>
                      ) : null}
                      {fd.vehicle_year ? (
                        <div>
                          <span className="text-gray-500">Year</span>
                          <p className="font-medium text-gray-900">{String(fd.vehicle_year)}</p>
                        </div>
                      ) : null}
                      {fd.vehicle_make ? (
                        <div>
                          <span className="text-gray-500">Make</span>
                          <p className="font-medium text-gray-900">{String(fd.vehicle_make)}</p>
                        </div>
                      ) : null}
                      {fd.vehicle_model ? (
                        <div>
                          <span className="text-gray-500">Model</span>
                          <p className="font-medium text-gray-900">{String(fd.vehicle_model)}</p>
                        </div>
                      ) : null}
                      {fd.vin ? (
                        <div>
                          <span className="text-gray-500">VIN</span>
                          <p className="font-medium font-mono text-gray-900 text-xs break-all">{String(fd.vin)}</p>
                        </div>
                      ) : null}
                      {fd.radio_3s0t ? (
                        <div>
                          <span className="text-gray-500">Insurance Help</span>
                          <p className="font-medium text-gray-900">{String(fd.radio_3s0t)}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })()}

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sale Value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Value
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    value={editSaleValue}
                    onChange={(e) => setEditSaleValue(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900 placeholder:text-gray-500"
                  />
                </div>
              </div>

              {/* Sale Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Date
                </label>
                <input
                  type="date"
                  value={editSaleDate}
                  onChange={(e) => setEditSaleDate(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={editSaleNotes}
                  onChange={(e) => setEditSaleNotes(e.target.value)}
                  placeholder="Add notes about this sale..."
                  rows={3}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-base text-gray-900 resize-none placeholder:text-gray-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSelectedLead(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveLead}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside calendar to close */}
      {showCalendar && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowCalendar(false)}
        />
      )}
    </div>
  )
}

// Lead Card Component
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
  const StatusIcon = statusConfig.icon
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  const isPhoneLead = lead.source === 'PHONE'
  const interestedIn = lead.formData?.interested_in as string | undefined

  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl p-4 text-left shadow-sm hover:shadow-md transition-shadow w-full border-2 ${
        isPhoneLead ? 'border-orange-400' : 'border-transparent'
      }`}
    >
      {/* Source & Status Badge */}
      <div className="flex items-center gap-2 mb-2">
        {isPhoneLead && (
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            <Phone className="h-3 w-3" />
            Call
          </div>
        )}
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </div>
      </div>

      {/* Name */}
      <h3 className="font-medium text-gray-900 truncate mb-1">{fullName}</h3>

      {/* Interested In */}
      {interestedIn && (
        <p className="text-sm text-blue-700 font-medium truncate mb-1">{interestedIn}</p>
      )}

      {/* Contact */}
      <div className="space-y-1 text-xs text-gray-700">
        {lead.phone && (
          <p className="flex items-center gap-1 truncate">
            <Phone className="h-3 w-3 flex-shrink-0" />
            {lead.phone}
          </p>
        )}
        {lead.email && (
          <p className="flex items-center gap-1 truncate">
            <Mail className="h-3 w-3 flex-shrink-0" />
            {lead.email}
          </p>
        )}
      </div>

      {/* Missing info indicator for phone leads */}
      {isPhoneLead && (!lead.firstName || !lead.email) && (
        <div className="mt-2 text-orange-600 text-xs">+ Add missing info</div>
      )}

      {/* Sale Value */}
      {lead.saleValue ? (
        <div className="mt-2 text-emerald-600 font-semibold">
          ${lead.saleValue.toLocaleString()}
        </div>
      ) : lead.status === 'SOLD' ? (
        <div className="mt-2 text-amber-600 text-xs">+ Add sale value</div>
      ) : null}

      {/* Time */}
      <p className="text-xs text-gray-600 mt-2">
        {new Date(lead.createdAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </p>
    </button>
  )
}
