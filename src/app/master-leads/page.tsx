'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  X,
  Save,
  Loader2,
  User,
  Building2,
  ShieldX,
  MousePointerClick,
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
  gclid: string | null // Google Ads Click ID
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

const STORAGE_KEY = 'masterLeads_selectedClientId'
const REFRESH_INTERVAL = 30000 // 30 seconds

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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [mobilePageIndex, setMobilePageIndex] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
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

  // Vehicle/service info (editable for phone leads)
  const [editVehicleYear, setEditVehicleYear] = useState('')
  const [editVehicleMake, setEditVehicleMake] = useState('')
  const [editVehicleModel, setEditVehicleModel] = useState('')
  const [editInterestedIn, setEditInterestedIn] = useState('')

  // Modal slide animation state
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

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
          // User is logged in but not authorized
          setAuthenticated(false)
          setClientsLoading(false) // Don't wait for clients if not authorized
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => setAuthChecking(false))
  }, [router])

  // Load clients on mount and restore selected client from localStorage
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClients(data)
          // Restore selected client from localStorage
          const savedClientId = localStorage.getItem(STORAGE_KEY)
          if (savedClientId && data.some((c: Client) => c.id === savedClientId)) {
            setSelectedClientId(savedClientId)
          }
        }
      })
      .catch(console.error)
      .finally(() => setClientsLoading(false))
  }, [authenticated])

  // Save selected client to localStorage when it changes
  useEffect(() => {
    if (selectedClientId) {
      localStorage.setItem(STORAGE_KEY, selectedClientId)
    }
  }, [selectedClientId])

  // Update selected client when ID changes
  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId)
      setSelectedClient(client || null)
    } else {
      setSelectedClient(null)
    }
  }, [selectedClientId, clients])

  // Fetch leads function (reusable for initial load and polling)
  const fetchLeads = useCallback(async (showLoadingSpinner = true) => {
    if (!selectedClientId || !authenticated) {
      setLeads([])
      setSales(null)
      return
    }

    if (showLoadingSpinner) {
      setLoading(true)
      setMobilePageIndex(0)
    }

    // Fetch leads for the selected date (full day range in user's timezone)
    const [year, month, day] = selectedDate.split('-').map(Number)
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    try {
      const [leadsRes, statsRes] = await Promise.all([
        fetch(`/api/leads?clientId=${selectedClientId}&startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`),
        fetch(`/api/admin/master-leads/stats?clientId=${selectedClientId}`)
      ])

      const leadsData = await leadsRes.json()
      const statsData = await statsRes.json()

      setLeads(leadsData.leads || [])
      if (statsData.sales) {
        setSales(statsData.sales)
      }
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      if (showLoadingSpinner) {
        setLoading(false)
      }
    }
  }, [selectedClientId, selectedDate, authenticated])

  // Initial load when client/date changes
  useEffect(() => {
    fetchLeads(true)
  }, [fetchLeads])

  // Auto-refresh polling (every 30 seconds)
  useEffect(() => {
    if (!selectedClientId || !authenticated) return

    const interval = setInterval(() => {
      // Only auto-refresh if user is not editing a lead
      if (!selectedLead) {
        fetchLeads(false) // Don't show loading spinner for background refresh
      }
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [selectedClientId, authenticated, selectedLead, fetchLeads])

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

      // Populate vehicle/service info from formData
      const details = getLeadDetails(selectedLead)
      setEditVehicleYear(details.year || '')
      setEditVehicleMake(details.make || '')
      setEditVehicleModel(details.model || '')
      setEditInterestedIn(details.service || '')
    }
  }, [selectedLead])

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

  async function handleSaveLead() {
    if (!selectedLead) return
    setSaving(true)

    try {
      const response = await fetch(`/api/leads/${selectedLead.id}`, {
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
          // Vehicle/service info
          vehicleYear: editVehicleYear || null,
          vehicleMake: editVehicleMake || null,
          vehicleModel: editVehicleModel || null,
          interestedIn: editInterestedIn || null,
        }),
      })

      if (!response.ok) throw new Error('Failed to save')

      const updated = await response.json()
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedLead.id ? { ...l, ...updated } : l))
      )
      setSelectedLead(null)

      // Refresh sales stats after save
      if (selectedClientId) {
        fetch(`/api/admin/master-leads/stats?clientId=${selectedClientId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.sales) {
              setSales(data.sales)
            }
          })
          .catch(() => {})
      }
    } catch {
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

  // Modal swipe navigation between leads with animation
  const modalTouchStart = useRef<number | null>(null)
  function handleModalTouchStart(e: React.TouchEvent) {
    modalTouchStart.current = e.touches[0].clientX
  }
  function handleModalTouchEnd(e: React.TouchEvent) {
    if (modalTouchStart.current === null || !selectedLead || isAnimating) return
    const touchEnd = e.changedTouches[0].clientX
    const diff = modalTouchStart.current - touchEnd
    if (Math.abs(diff) > 50) {
      const currentIndex = leads.findIndex(l => l.id === selectedLead.id)
      if (diff > 0 && currentIndex < leads.length - 1) {
        // Swipe left = next lead
        navigateToLead(leads[currentIndex + 1], 'left')
      } else if (diff < 0 && currentIndex > 0) {
        // Swipe right = previous lead
        navigateToLead(leads[currentIndex - 1], 'right')
      }
    }
    modalTouchStart.current = null
  }

  // Animated navigation between leads
  function navigateToLead(newLead: Lead, direction: 'left' | 'right') {
    if (isAnimating) return
    setIsAnimating(true)
    setSlideDirection(direction)

    // After slide-out animation, change the lead
    setTimeout(() => {
      setSelectedLead(newLead)
      // Brief pause then slide in from opposite direction
      setTimeout(() => {
        setSlideDirection(null)
        setIsAnimating(false)
      }, 50)
    }, 150)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 overflow-x-hidden">
      {/* Header with Client Selector */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {selectedClient ? (
                <ClientLogo
                  logoUrl={selectedClient.logoUrl}
                  businessName={selectedClient.businessName}
                  primaryColor={selectedClient.primaryColor}
                />
              ) : (
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0 border border-indigo-200">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {/* Client Selector Dropdown */}
                <div className="relative">
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full pr-8 py-1 text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent bg-transparent border-0 focus:ring-0 focus:outline-none appearance-none cursor-pointer truncate"
                    style={{ paddingLeft: 0, WebkitTextFillColor: 'inherit' }}
                  >
                    <option value="">Select Client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.businessName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-500 font-medium">Master Lead Portal</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Show content only when client is selected */}
      {selectedClientId ? (
        <>
          {/* Date Navigation */}
          <div className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-[57px] z-30">
            <div className="max-w-6xl mx-auto px-4 py-3">
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => changeDate(-1)}
                  className="p-2.5 hover:bg-gray-100 rounded-xl transition-all text-gray-600 hover:text-gray-900 hover:scale-105"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 rounded-xl transition-all min-w-[180px] justify-center text-gray-900 border border-indigo-100"
                >
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <span className="font-semibold">{formatDateDisplay(selectedDate)}</span>
                  <ChevronDown className={`h-4 w-4 text-indigo-600 transition-transform ${showCalendar ? 'rotate-180' : ''}`} />
                </button>

                <button
                  onClick={() => changeDate(1)}
                  className="p-2.5 hover:bg-gray-100 rounded-xl transition-all text-gray-600 hover:text-gray-900 hover:scale-105"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Sales Stats */}
          {sales && (
            <div className="max-w-6xl mx-auto px-4 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-4 text-center border border-emerald-100 shadow-sm">
                  <p className="text-xs text-emerald-600 font-medium mb-1">Today</p>
                  <p className="text-xl font-bold text-emerald-700">${sales.today.total.toLocaleString()}</p>
                  <p className="text-xs text-emerald-600/70">{sales.today.count} sale{sales.today.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 text-center border border-blue-100 shadow-sm">
                  <p className="text-xs text-blue-600 font-medium mb-1">This Week</p>
                  <p className="text-xl font-bold text-blue-700">${sales.week.total.toLocaleString()}</p>
                  <p className="text-xs text-blue-600/70">{sales.week.count} sale{sales.week.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl p-4 text-center border border-violet-100 shadow-sm">
                  <p className="text-xs text-violet-600 font-medium mb-1">This Month</p>
                  <p className="text-xl font-bold text-violet-700">${sales.month.total.toLocaleString()}</p>
                  <p className="text-xs text-violet-600/70">{sales.month.count} sale{sales.month.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          )}

          {/* Lead Count & Auto-refresh indicator */}
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
            <p className="text-sm text-gray-700">
              {loading ? 'Loading...' : `${leads.length} lead${leads.length !== 1 ? 's' : ''} on ${formatDateDisplay(selectedDate)}`}
            </p>
            <div className="flex items-center gap-2">
              {lastRefresh && (
                <span className="text-xs text-gray-400">
                  Updated {lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={() => fetchLeads(false)}
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Refresh leads"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Leads Grid */}
          <div className="max-w-6xl mx-auto px-4 pb-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                  <p className="text-sm text-gray-500">Loading leads...</p>
                </div>
              </div>
            ) : leads.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center">
                  <User className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No leads on this date</h3>
                <p className="text-gray-500 text-sm mb-4">Try selecting a different date</p>
                <button
                  onClick={() => {
                    const today = new Date()
                    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                    setSelectedDate(localDate)
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm"
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
        </>
      ) : (
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
            <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center border border-indigo-200">
              <Building2 className="h-10 w-10 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">Select a Client</h2>
            <p className="text-gray-500">Choose a client from the dropdown above to view their leads</p>
          </div>
        </div>
      )}

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-hidden">
          <div
            className={`bg-white w-full md:max-w-lg rounded-xl max-h-[85vh] overflow-y-auto overflow-x-hidden transition-all duration-150 ease-out ${
              slideDirection === 'left'
                ? '-translate-x-full opacity-0'
                : slideDirection === 'right'
                ? 'translate-x-full opacity-0'
                : 'translate-x-0 opacity-100'
            }`}
            onTouchStart={handleModalTouchStart}
            onTouchEnd={handleModalTouchEnd}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-2">
                {/* Previous button */}
                <button
                  onClick={() => {
                    const currentIndex = leads.findIndex(l => l.id === selectedLead.id)
                    if (currentIndex > 0) {
                      navigateToLead(leads[currentIndex - 1], 'right')
                    }
                  }}
                  disabled={leads.findIndex(l => l.id === selectedLead.id) === 0 || isAnimating}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                  <h2 className="font-semibold text-lg text-gray-900">Lead Details</h2>
                  <p className="text-xs text-gray-500">
                    {leads.findIndex(l => l.id === selectedLead.id) + 1} of {leads.length}
                  </p>
                </div>
                {/* Next button */}
                <button
                  onClick={() => {
                    const currentIndex = leads.findIndex(l => l.id === selectedLead.id)
                    if (currentIndex < leads.length - 1) {
                      navigateToLead(leads[currentIndex + 1], 'left')
                    }
                  }}
                  disabled={leads.findIndex(l => l.id === selectedLead.id) === leads.length - 1 || isAnimating}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
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
              {/* Source indicators */}
              <div className="flex flex-wrap gap-2">
                {selectedLead.gclid && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                    <MousePointerClick className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-800 font-medium">Google Ads Lead</span>
                  </div>
                )}
                {selectedLead.source === 'PHONE' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-orange-600" />
                    <span className="text-sm text-orange-800 font-medium">Phone Call Lead</span>
                  </div>
                )}
              </div>

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
                    {editPhone && (
                      <a
                        href={`sms:${editPhone}`}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Text
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

              {/* Vehicle & Service Info - Editable */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-gray-900">Vehicle & Service Info</h4>

                {/* Interested In / Service */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Interested In</label>
                  <select
                    value={editInterestedIn}
                    onChange={(e) => setEditInterestedIn(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select service...</option>
                    <option value="Windshield Replacement">Windshield Replacement</option>
                    <option value="Windshield Repair">Windshield Repair</option>
                    <option value="Side Window">Side Window</option>
                    <option value="Back Glass">Back Glass</option>
                    <option value="Other Auto Glass">Other Auto Glass</option>
                  </select>
                </div>

                {/* Vehicle Year/Make/Model */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Year</label>
                    <input
                      type="text"
                      value={editVehicleYear}
                      onChange={(e) => setEditVehicleYear(e.target.value)}
                      placeholder="2024"
                      maxLength={4}
                      className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Make</label>
                    <input
                      type="text"
                      value={editVehicleMake}
                      onChange={(e) => setEditVehicleMake(e.target.value)}
                      placeholder="Toyota"
                      className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Model</label>
                    <input
                      type="text"
                      value={editVehicleModel}
                      onChange={(e) => setEditVehicleModel(e.target.value)}
                      placeholder="Camry"
                      className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Read-only details if present */}
                {(() => {
                  const details = getLeadDetails(selectedLead)
                  const hasReadOnlyDetails = details.vin || details.zipCode || details.insuranceHelp
                  if (!hasReadOnlyDetails) return null
                  return (
                    <div className="pt-2 border-t border-blue-100 grid grid-cols-2 gap-3 text-sm">
                      {details.vin && (
                        <div>
                          <span className="text-gray-500">VIN</span>
                          <p className="font-medium font-mono text-gray-900 text-xs break-all">{details.vin}</p>
                        </div>
                      )}
                      {details.zipCode && (
                        <div>
                          <span className="text-gray-500">Zip Code</span>
                          <p className="font-medium text-gray-900">{details.zipCode}</p>
                        </div>
                      )}
                      {details.insuranceHelp && (
                        <div>
                          <span className="text-gray-500">Insurance Help</span>
                          <p className="font-medium text-gray-900">{details.insuranceHelp}</p>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

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
            <div className="h-safe-area-inset-bottom md:hidden" />
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

// Helper to extract lead details from formData with _rawPayload fallback
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

// Lead Card Component
function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
  const StatusIcon = statusConfig.icon
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  const isPhoneLead = lead.source === 'PHONE'
  const isGoogleAdsLead = !!lead.gclid
  const details = getLeadDetails(lead)

  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-2xl p-4 text-left shadow-sm hover:shadow-lg transition-all duration-200 w-full border-2 hover:scale-[1.02] ${
        isPhoneLead ? 'border-orange-300 bg-gradient-to-br from-orange-50/50 to-white' : 'border-gray-100 hover:border-indigo-200'
      }`}
    >
      {/* Source & Status Badge */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {isGoogleAdsLead && (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-100 to-sky-100 text-blue-700 border border-blue-200">
            <MousePointerClick className="h-3 w-3" />
            Google Ads
          </div>
        )}
        {isPhoneLead && (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 border border-orange-200">
            <Phone className="h-3 w-3" />
            Call
          </div>
        )}
        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${statusConfig.bgColor} ${statusConfig.color}`}>
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </div>
      </div>

      {/* Name */}
      <h3 className="font-semibold text-gray-900 truncate mb-1">{fullName}</h3>

      {/* Service/Vehicle Details */}
      {(details.service || details.vehicle) && (
        <div className="mb-2">
          {details.service && (
            <p className="text-sm text-indigo-700 font-medium truncate">{details.service}</p>
          )}
          {details.vehicle && (
            <p className="text-xs text-gray-500 truncate">{details.vehicle}</p>
          )}
        </div>
      )}

      {/* Zip & Insurance */}
      {(details.zipCode || details.insuranceHelp) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {details.zipCode && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">ZIP: {details.zipCode}</span>
          )}
          {details.insuranceHelp && details.insuranceHelp.toLowerCase() === 'yes' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-md font-medium">Insurance</span>
          )}
        </div>
      )}

      {/* Contact */}
      <div className="space-y-1 text-xs text-gray-600">
        {lead.phone && (
          <p className="flex items-center gap-1.5 truncate">
            <Phone className="h-3 w-3 text-gray-400 flex-shrink-0" />
            {lead.phone}
          </p>
        )}
        {lead.email && (
          <p className="flex items-center gap-1.5 truncate">
            <Mail className="h-3 w-3 text-gray-400 flex-shrink-0" />
            {lead.email}
          </p>
        )}
      </div>

      {/* Missing info indicator */}
      {isPhoneLead && (!lead.firstName || !lead.email) && (
        <div className="mt-2 text-orange-600 text-xs font-medium">+ Add missing info</div>
      )}

      {/* Sale Value */}
      {lead.saleValue ? (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <span className="text-lg font-bold text-emerald-600">${lead.saleValue.toLocaleString()}</span>
        </div>
      ) : lead.status === 'SOLD' ? (
        <div className="mt-2 text-amber-600 text-xs font-medium">+ Add sale value</div>
      ) : null}

      {/* Time */}
      <p className="text-xs text-gray-400 mt-2 font-medium">
        {new Date(lead.createdAt).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </p>
    </button>
  )
}
