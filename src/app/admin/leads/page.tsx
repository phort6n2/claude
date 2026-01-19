'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Phone,
  Mail,
  Calendar,
  Building2,
  ChevronDown,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  Search,
  X,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
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
  createdAt: string
  formName: string | null
  formData: Record<string, unknown> | null
  enhancedConversionSent: boolean
  offlineConversionSent: boolean
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  NEW: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  CONTACTED: { label: 'Contacted', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: MessageSquare },
  QUALIFIED: { label: 'Qualified', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
  UNQUALIFIED: { label: 'Unqualified', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: XCircle },
  QUOTED: { label: 'Quoted', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: DollarSign },
  SOLD: { label: 'Sold', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: TrendingUp },
  LOST: { label: 'Lost', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ byStatus: Record<string, number> }>({ byStatus: {} })

  // Filters
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

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

  // Load leads
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedClient) params.set('clientId', selectedClient)
    if (selectedStatus) params.set('status', selectedStatus)

    fetch(`/api/leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.leads || [])
        setTotal(data.total || 0)
        setStats(data.stats || { byStatus: {} })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedClient, selectedStatus])

  // Filter leads by search query (client-side)
  const filteredLeads = leads.filter((lead) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      lead.email?.toLowerCase().includes(query) ||
      lead.phone?.includes(query) ||
      lead.firstName?.toLowerCase().includes(query) ||
      lead.lastName?.toLowerCase().includes(query) ||
      lead.client.businessName.toLowerCase().includes(query)
    )
  })

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatPhoneDisplay(phone: string) {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
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

  // Calculate totals
  const totalValue = leads.filter(l => l.saleValue).reduce((sum, l) => sum + (l.saleValue || 0), 0)
  const soldCount = stats.byStatus['SOLD'] || 0
  const newCount = stats.byStatus['NEW'] || 0

  if (loading) {
    return <ListPageSkeleton />
  }

  return (
    <PageContainer>
      <PageHeader
        title="Leads"
        subtitle="Manage leads from Google Ads campaigns"
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
        </div>
      </div>

      {/* Leads List */}
      <ContentCard padding="none">
        {filteredLeads.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No leads found"
            description="Leads will appear here when forms are submitted"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLeads.map((lead) => {
              const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
              const StatusIcon = statusConfig.icon
              const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'

              return (
                <Link
                  key={lead.id}
                  href={`/admin/leads/${lead.id}`}
                  className="block hover:bg-gray-50 transition-colors group"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Contact Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {fullName}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.label}
                          </span>
                          {lead.gclid && (
                            <span className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg font-medium">
                              Google Ads
                            </span>
                          )}
                          {lead.gclid && lead.enhancedConversionSent && (
                            <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Email Sent
                            </span>
                          )}
                          {lead.gclid && lead.offlineConversionSent && (
                            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg flex items-center gap-1 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Sale Sent
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                          {lead.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-gray-400" />
                              {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-gray-400" />
                              {formatPhoneDisplay(lead.phone)}
                            </span>
                          )}
                          <Link
                            href={`/admin/clients/${lead.client.id}`}
                            className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Building2 className="h-3.5 w-3.5 text-gray-400" />
                            {lead.client.businessName}
                          </Link>
                          <span className="flex items-center gap-1.5 text-gray-400">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(lead.createdAt)}
                          </span>
                        </div>

                        {/* Service/Vehicle info */}
                        {(() => {
                          const details = getLeadDetails(lead)
                          const hasAnyDetails = details.service || details.vehicle || details.zipCode || details.insuranceHelp
                          if (!hasAnyDetails) return null
                          return (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {details.service && (
                                <span className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded-lg font-medium">
                                  {details.service}
                                </span>
                              )}
                              {details.vehicle && (
                                <span className="text-gray-600">{details.vehicle}</span>
                              )}
                              {details.zipCode && (
                                <span className="text-gray-500">ZIP: {details.zipCode}</span>
                              )}
                              {details.insuranceHelp && details.insuranceHelp.toLowerCase() === 'yes' && (
                                <span className="inline-block bg-green-50 text-green-700 px-2 py-1 rounded-lg font-medium">
                                  Insurance Help
                                </span>
                              )}
                            </div>
                          )
                        })()}

                        {/* Campaign info */}
                        {(lead.utmCampaign || lead.utmKeyword) && (
                          <div className="mt-2 text-xs text-gray-500">
                            {lead.utmCampaign && <span>Campaign: {lead.utmCampaign}</span>}
                            {lead.utmCampaign && lead.utmKeyword && <span className="mx-2">·</span>}
                            {lead.utmKeyword && <span>Keyword: {lead.utmKeyword}</span>}
                          </div>
                        )}
                      </div>

                      {/* Right: Sale Value & Arrow */}
                      <div className="flex items-center gap-4">
                        {lead.saleValue ? (
                          <div className="text-lg font-bold text-emerald-600">
                            ${lead.saleValue.toLocaleString()}
                          </div>
                        ) : lead.status === 'SOLD' ? (
                          <div className="text-sm text-gray-400">No value set</div>
                        ) : null}
                        <ArrowRight className="h-5 w-5 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </ContentCard>

      {/* Pagination hint */}
      {filteredLeads.length > 0 && filteredLeads.length < total && (
        <div className="mt-4 text-center text-sm text-gray-500">
          Showing {filteredLeads.length} of {total} leads
        </div>
      )}
    </PageContainer>
  )
}
