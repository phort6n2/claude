'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  Search,
  X,
  PlayCircle,
  Check,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { STATUS_CONFIG, STATUS_OPTIONS, displayNameIsPhone, formatFieldValue, formatPhoneDisplay, getLeadDisplayName, relativeAge, waitingLevel } from '@/lib/lead-display'
import { Button } from '@/components/ui/Button'
import {
  PageContainer,
  PageHeader,
  GradientStatCard,
  StatCardGrid,
  ContentCard,
  EmptyState,
  ListPageSkeleton,
} from '@/components/ui/theme'
import { PoweredByFooter } from '@/components/ui/PoweredByFooter'
import { SourceIcon } from '@/components/leads/SourceIcon'
import { LeadQuickActions } from '@/components/leads/LeadQuickActions'
import { DamagePhoto, damagePhotoOf, VehicleDecode } from '@/components/leads/DamagePhoto'
import { useLeadStream } from '@/hooks/useLeadStream'

interface Lead {
  id: string
  email: string | null
  phone: string | null
  firstName: string | null
  lastName: string | null
  status: string
  source: string
  gclid: string | null
  utmCampaign: string | null
  utmKeyword: string | null
  saleValue: number | null
  saleDate: string | null
  saleNotes: string | null
  callRecordingUrl: string | null
  createdAt: string
  formName: string | null
  formData: Record<string, unknown> | null
  client: {
    id: string
    businessName: string
    slug: string
  }
}

interface Client {
  id: string
  businessName: string
  slug: string
}


export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ byStatus: Record<string, number>; soldValue?: number }>({ byStatus: {} })

  // Filters
  // Seeded from the URL so "Open leads" from inside a client shows THAT
  // client's leads. It linked to the unfiltered list, which from a page about
  // one shop reads as that shop having every other shop's leads.
  const searchParams = useSearchParams()
  const [selectedClient, setSelectedClient] = useState<string>(searchParams.get('clientId') || '')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)


  // Refresh state (manual button + visibility-change catch-up)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now())
  const filterRef = useRef({ selectedClient, selectedStatus, searchQuery })
  filterRef.current = { selectedClient, selectedStatus, searchQuery }
  // The offset for "load more" is the number of rows already held, read at
  // click time rather than closed over.
  const leadsRef = useRef(leads)
  leadsRef.current = leads

  // Load clients for filter dropdown
  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClients(data)
        }
      })
      .catch(console.error)
  }, [])

  // Fetch the list from REST. `mode === 'initial'` shows the skeleton; otherwise
  // the spinner on the Refresh button signals progress without blowing away
  // expanded rows / in-progress edits.
  const fetchLeads = useCallback(async (mode: 'initial' | 'manual' | 'more' = 'initial') => {
    const { selectedClient, selectedStatus, searchQuery } = filterRef.current
    const params = new URLSearchParams()
    if (selectedClient) params.set('clientId', selectedClient)
    if (selectedStatus) params.set('status', selectedStatus)
    // Searched server-side. Filtering in the browser only ever searched the
    // page that happened to be loaded, so a customer past the newest 50 came
    // back as "no leads found".
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (mode === 'more') params.set('offset', String(leadsRef.current.length))

    if (mode === 'initial') {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const res = await fetch(`/api/leads?${params.toString()}`)
      const data = await res.json()
      setLeads((prev) => (mode === 'more' ? [...prev, ...(data.leads || [])] : data.leads || []))
      setTotal(data.total || 0)
      setStats(data.stats || { byStatus: {} })
      setLastRefreshAt(Date.now())
    } catch (err) {
      console.error(err)
    } finally {
      if (mode === 'initial') {
        setLoading(false)
      } else {
        setRefreshing(false)
      }
    }
  }, [])

  // Initial / filter-change load (shows skeleton)
  useEffect(() => {
    fetchLeads('initial')
  }, [selectedClient, selectedStatus, fetchLeads])

  // Typing re-queries the server, debounced. Skips the very first run so the
  // load above is not immediately duplicated.
  const searchedRef = useRef(searchQuery)
  useEffect(() => {
    if (searchedRef.current === searchQuery) return
    const timer = setTimeout(() => {
      searchedRef.current = searchQuery
      void fetchLeads('manual')
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery, fetchLeads])

  // Real-time push: new leads arrive over SSE and are prepended directly.
  const streamUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (selectedClient) params.set('clientId', selectedClient)
    if (selectedStatus) params.set('status', selectedStatus)
    return `/api/leads/stream?${params.toString()}`
  }, [selectedClient, selectedStatus])

  const handleStreamedLead = useCallback((lead: Lead) => {
    setLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]))
    setTotal((t) => t + 1)
    setStats((s) => ({
      ...s,
      byStatus: {
        ...s.byStatus,
        [lead.status]: (s.byStatus[lead.status] || 0) + 1,
      },
    }))
  }, [])

  useLeadStream<Lead>({ url: streamUrl, onLead: handleStreamedLead })

  // Catch up via REST when the tab returns to the foreground — covers the small
  // window where the SSE connection was dropped while backgrounded.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchLeads('manual')
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchLeads])

  // The server has already applied the search; these are the rows to draw.
  const filteredLeads = leads

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

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

    // Form controls submit their slug value ("door-side-glass"), not the
    // text the visitor saw. Applied only to the human-facing answers —
    // vehicle, VIN and zip are already prose or identifiers.
    const toDisplay = (keys: string[]): string | null => {
      const value = getField(keys)
      return value ? formatFieldValue(value) : null
    }

    const service = toDisplay(['interested_in', 'Interested In:', 'Interested In'])
    const year = getField(['vehicle_year', 'Vehicle Year'])
    const make = getField(['vehicle_make', 'Vehicle Make'])
    const model = getField(['vehicle_model', 'Vehicle Model'])
    const vin = getField(['vin', 'VIN', 'Vin'])
    const zipCode = getField(['postal_code', 'postalCode'])
    const insuranceHelp = toDisplay(['insurance_help', 'Would You Like Us To Help Navigate Your Insurance Claim For You?', 'radio_3s0t'])

    const vehicleParts = [year, make, model].filter(Boolean)
    const vehicle = vehicleParts.length > 0 ? vehicleParts.join(' ') : null

    return { service, vehicle, year, make, model, vin, zipCode, insuranceHelp }
  }

  // Calculate totals
  // From the server, over every matching row. Summing the loaded page made
  // the money number a function of how far you had scrolled.
  const totalValue = stats.soldValue ?? 0
  const soldCount = stats.byStatus['SOLD'] || 0
  const newCount = stats.byStatus['NEW'] || 0

  // Handle lead update from inline editing
  function handleLeadUpdate(updatedLead: Lead) {
    setLeads((prev) =>
      prev.map((l) => (l.id === updatedLead.id ? updatedLead : l))
    )
  }

  if (loading) {
    return <ListPageSkeleton />
  }

  return (
    <PageContainer>
      <PageHeader
        title="Leads"
        subtitle="Manage leads from all clients"
      />

      {/* Stats Cards */}
      <StatCardGrid cols={4}>
        <GradientStatCard
          title="Total Leads"
          value={total}
          subtitle="All time"
          icon={<Users />}
          variant="blue"
        />
        <GradientStatCard
          title="New Leads"
          value={newCount}
          subtitle="Awaiting contact"
          icon={<Clock />}
          variant="amber"
        />
        <GradientStatCard
          title="Sold"
          value={soldCount}
          subtitle="Converted leads"
          icon={<TrendingUp />}
          variant="green"
        />
        <GradientStatCard
          title="Total Value"
          value={`$${totalValue.toLocaleString()}`}
          subtitle="From sold leads"
          icon={<DollarSign />}
          variant="violet"
        />
      </StatCardGrid>

      {/* Status Filter Pills */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-medium text-gray-700">Filter by status:</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedStatus('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                !selectedStatus
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({total})
            </button>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => {
              const count = stats.byStatus[status] || 0
              const StatusIcon = config.icon
              return (
                <button
                  key={status}
                  onClick={() => setSelectedStatus(selectedStatus === status ? '' : status)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedStatus === status
                      ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-current`
                      : `${config.bgColor} ${config.color} hover:ring-1 hover:ring-current`
                  }`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  {config.label} ({count})
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Client Filter */}
          <div className="relative">
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.businessName}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Clear Filters */}
          {(selectedClient || selectedStatus || searchQuery) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedClient('')
                setSelectedStatus('')
                setSearchQuery('')
              }}
              className="rounded-xl"
            >
              Clear Filters
            </Button>
          )}

          {/* Refresh */}
          <button
            onClick={() => fetchLeads('manual')}
            disabled={refreshing}
            // There is no polling. New leads arrive over SSE and are
            // prepended; status changes made elsewhere are not picked up until
            // this is pressed, which is the opposite of what it claimed.
            title={`Last refreshed ${formatRelative(lastRefreshAt)} · live — new leads appear as they arrive; press to pick up status changes`}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Leads List - Accordion Style */}
      {filteredLeads.length === 0 ? (
        <ContentCard padding="none">
          <EmptyState
            icon={<Users />}
            title="No leads found"
            description="Leads will appear here when forms are submitted"
          />
        </ContentCard>
      ) : (
        <div className="space-y-2">
          {filteredLeads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              isExpanded={expandedLeadId === lead.id}
              isDimmed={expandedLeadId !== null && expandedLeadId !== lead.id}
              onToggle={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
              onUpdate={handleLeadUpdate}
              formatPhoneDisplay={formatPhoneDisplay}
              formatDate={formatDate}
              getLeadDetails={getLeadDetails}
            />
          ))}
        </div>
      )}

      {/* Not just a hint — the rest of the list was unreachable. */}
      {filteredLeads.length > 0 && filteredLeads.length < total && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fetchLeads('more')}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {refreshing ? 'Loading…' : `Load ${Math.min(50, total - filteredLeads.length)} more`}
          </button>
          <span className="text-sm text-gray-500">
            Showing {filteredLeads.length} of {total} leads
          </span>
        </div>
      )}

      <PoweredByFooter />
    </PageContainer>
  )
}

function formatRelative(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
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
    'tags', 'country', 'timezone', 'contact_type', 'contactType', 'contact_source', 'contactSource',
    'recordingUrl', 'recording_url', 'callRecordingUrl', 'call_recording_url', 'audioUrl', 'audio_url',
    // Skip vehicle/service fields (shown combined in Lead Details section)
    'vehicle', 'Vehicle', 'vehicle_year', 'Vehicle Year', 'vehicle_make', 'Vehicle Make',
    'vehicle_model', 'Vehicle Model', 'interested_in', 'Interested In', 'Interested In:',
    // The photo is rendered as an image above; the raw URL is a long
    // unreadable line that pushes the useful fields off the screen.
    'damage_photo_url', 'vin_decoded', 'vin_calibration', 'vin_camera_systems',
  ])

  const formatLabel = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim()
  }

  for (const [key, value] of Object.entries(fd)) {
    if (skipKeys.has(key)) continue
    if (value === null || value === undefined || value === '') continue
    if (typeof value === 'object') continue

    fields.push({
      label: formatLabel(key),
      // Form controls submit their slug value ("door-side-glass"), not the text
      // the visitor actually saw.
      value: formatFieldValue(value),
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
  formatPhoneDisplay,
  formatDate,
  getLeadDetails,
}: {
  lead: Lead
  isExpanded: boolean
  isDimmed: boolean
  onToggle: () => void
  onUpdate: (lead: Lead) => void
  formatPhoneDisplay: (phone: string) => string
  formatDate: (date: string) => string
  getLeadDetails: (lead: Lead) => { service: string | null; vehicle: string | null; year: string | null; make: string | null; model: string | null; vin: string | null; zipCode: string | null; insuranceHelp: string | null }
}) {
  const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
  // Only NEW leads can be "waiting": one that has been contacted is not late
  // however old it is, and colouring those would train the colour out.
  const waiting = waitingLevel(lead.status, lead.createdAt)
  const fullName = getLeadDisplayName(lead)
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

  return (
    <div className="rounded-xl overflow-hidden">
      <div
        className={`bg-white shadow-sm transition-all duration-200 ${isDimmed ? 'opacity-40' : ''} ${isExpanded ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
      >
        {/* Collapsed Row */}
        <button
          onClick={onToggle}
          className="w-full px-4 py-3 flex items-center gap-2.5 text-left hover:bg-gray-50 transition-colors"
        >
          {/* Expand indicator */}
          <ChevronRight
            className={`h-5 w-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          />

          {/* Source pill (orange for phone, blue for form) */}
          <SourceIcon source={lead.source} />

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="font-medium text-gray-900">{fullName}</span>
              {lead.callRecordingUrl && (
                <PlayCircle className="h-4 w-4 text-violet-500 flex-shrink-0" />
              )}
              {lead.gclid && (
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg font-medium">
                  Paid Click
                </span>
              )}
            </div>
            <div className="flex items-center gap-x-2 gap-y-0.5 text-sm text-gray-600 flex-wrap">
              {lead.phone && !displayNameIsPhone(lead) && (
                <span>{formatPhoneDisplay(lead.phone)}</span>
              )}
              {lead.email && (
                <>
                  <span className="text-gray-300">•</span>
                  <span>{lead.email}</span>
                </>
              )}
              <span className="text-gray-300">•</span>
              <span className="text-gray-500">{lead.client.businessName}</span>
              {details.service && (
                <>
                  <span className="text-gray-300">•</span>
                  <span>{details.service}</span>
                </>
              )}
              <span className="text-gray-300">•</span>
              {/* Age, not a date. An absolute timestamp made a lead from 20
                  minutes ago and one from 3 days ago look identical, so the
                  one nobody had answered was invisible without arithmetic.
                  The exact time stays in the tooltip. */}
              <span
                className={`text-xs ${
                  waiting === 'late'
                    ? 'font-semibold text-red-600'
                    : waiting === 'warn'
                      ? 'font-semibold text-amber-600'
                      : 'text-gray-500'
                }`}
                title={formatDate(lead.createdAt)}
              >
                {waiting === 'none'
                  ? relativeAge(lead.createdAt)
                  : `waiting ${relativeAge(lead.createdAt).replace(' ago', '')}`}
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            {lead.saleValue && (
              <span className="text-sm font-bold text-emerald-600">
                ${lead.saleValue.toLocaleString()}
              </span>
            )}
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

            <VehicleDecode formData={lead.formData} className="pt-2" />

            {damagePhotoOf(lead.formData) && (
              <DamagePhoto url={damagePhotoOf(lead.formData) as string} className="pt-2" />
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2">
              <LeadQuickActions
                phone={lead.phone}
                email={lead.email}
                lead={{
                  firstName: lead.firstName,
                  businessName: lead.client?.businessName,
                  service: details.service,
                  vehicle: details.vehicle,
                }}
              />
              <Link
                href={`/admin/clients/${lead.client.id}`}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600 active:bg-gray-700"
              >
                <Building2 className="h-4 w-4" />
                Client
              </Link>
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
            {(details.vehicle || details.service || getAllFormFields(lead).length > 0) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Lead Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  {details.service && (
                    <div className="col-span-2 md:col-span-3">
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
                  {getAllFormFields(lead).map((field, idx) => (
                    <div key={idx} className={field.value.length > 30 ? 'col-span-2 md:col-span-3' : ''}>
                      <span className="text-gray-500 text-xs">{field.label}</span>
                      <p className="text-gray-900 font-medium break-words">{field.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campaign info */}
            {(lead.utmCampaign || lead.utmKeyword) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Campaign Info</p>
                <div className="text-sm text-gray-700">
                  {lead.utmCampaign && <p>Campaign: <span className="font-medium">{lead.utmCampaign}</span></p>}
                  {lead.utmKeyword && <p>Keyword: <span className="font-medium">{lead.utmKeyword}</span></p>}
                </div>
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

            {/* View Full Details Link */}
            <div className="pt-2 border-t border-gray-100">
              <Link
                href={`/admin/leads/${lead.id}`}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                View Full Details
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
