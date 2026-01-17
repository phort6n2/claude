'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Phone,
  Mail,
  Calendar,
  Building2,
  Filter,
  ChevronDown,
  ExternalLink,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  Search,
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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-800', icon: Clock },
  CONTACTED: { label: 'Contacted', color: 'bg-yellow-100 text-yellow-800', icon: MessageSquare },
  QUALIFIED: { label: 'Qualified', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  UNQUALIFIED: { label: 'Unqualified', color: 'bg-gray-100 text-gray-800', icon: XCircle },
  QUOTED: { label: 'Quoted', color: 'bg-purple-100 text-purple-800', icon: DollarSign },
  SOLD: { label: 'Sold', color: 'bg-emerald-100 text-emerald-800', icon: TrendingUp },
  LOST: { label: 'Lost', color: 'bg-red-100 text-red-800', icon: XCircle },
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
    // Basic US phone formatting
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    return phone
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

    // Build vehicle string
    const vehicleParts = [year, make, model].filter(Boolean)
    const vehicle = vehicleParts.length > 0 ? vehicleParts.join(' ') : null

    return { service, vehicle, year, make, model, vin, zipCode, insuranceHelp }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600">Manage leads from Google Ads campaigns</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-sm">Total</span>
            </div>
            <div className="text-2xl font-bold">{total}</div>
          </div>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div
              key={status}
              className={`rounded-lg border p-4 cursor-pointer transition-all ${
                selectedStatus === status ? 'ring-2 ring-blue-500' : ''
              } ${config.color.replace('text-', 'bg-').replace('-800', '-50')}`}
              onClick={() => setSelectedStatus(selectedStatus === status ? '' : status)}
            >
              <div className="flex items-center gap-2 mb-1">
                <config.icon className="h-4 w-4" />
                <span className="text-sm">{config.label}</span>
              </div>
              <div className="text-2xl font-bold">{stats.byStatus[status] || 0}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Client Filter */}
            <div className="relative">
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Leads List */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading leads...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No leads found</p>
              <p className="text-sm mt-1">Leads will appear here when forms are submitted</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredLeads.map((lead) => {
                const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW
                const StatusIcon = statusConfig.icon
                const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'

                return (
                  <Link
                    key={lead.id}
                    href={`/admin/leads/${lead.id}`}
                    className="block hover:bg-gray-50 transition-colors"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: Contact Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-medium text-gray-900 truncate">
                              {fullName}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig.label}
                            </span>
                            {lead.gclid && (
                              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                Google Ads
                              </span>
                            )}
                            {lead.gclid && lead.enhancedConversionSent && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Email Sent
                              </span>
                            )}
                            {lead.gclid && lead.offlineConversionSent && (
                              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Sale Sent
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                            {lead.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5" />
                                {lead.email}
                              </span>
                            )}
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5" />
                                {formatPhoneDisplay(lead.phone)}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {lead.client.businessName}
                            </span>
                            <span className="flex items-center gap-1 text-gray-400">
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
                                  <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
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
                                  <span className="inline-block bg-green-50 text-green-700 px-2 py-0.5 rounded">
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

                        {/* Right: Sale Value */}
                        <div className="text-right">
                          {lead.saleValue ? (
                            <div className="text-lg font-semibold text-emerald-600">
                              ${lead.saleValue.toLocaleString()}
                            </div>
                          ) : lead.status === 'SOLD' ? (
                            <div className="text-sm text-gray-400">No value set</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination hint */}
        {filteredLeads.length > 0 && filteredLeads.length < total && (
          <div className="mt-4 text-center text-sm text-gray-500">
            Showing {filteredLeads.length} of {total} leads
          </div>
        )}
      </div>
    </div>
  )
}
