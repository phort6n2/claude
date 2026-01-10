'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Phone,
  Mail,
  Calendar,
  ChevronDown,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  TrendingUp,
  Users,
  Search,
  LogOut,
  ExternalLink,
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
  createdAt: string
  formName: string | null
}

interface Session {
  authenticated: boolean
  clientName?: string
  userEmail?: string
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

export default function PortalLeadsPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ byStatus: Record<string, number> }>({ byStatus: {} })

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

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

  // Load leads
  useEffect(() => {
    if (!session?.authenticated) return

    setLoading(true)
    const params = new URLSearchParams()
    if (selectedStatus) params.set('status', selectedStatus)

    fetch(`/api/portal/leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(data.leads || [])
        setTotal(data.total || 0)
        setStats(data.stats || { byStatus: {} })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, selectedStatus])

  // Filter leads by search query (client-side)
  const filteredLeads = leads.filter((lead) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      lead.email?.toLowerCase().includes(query) ||
      lead.phone?.includes(query) ||
      lead.firstName?.toLowerCase().includes(query) ||
      lead.lastName?.toLowerCase().includes(query)
    )
  })

  async function handleLogout() {
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.push('/portal/login')
  }

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
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
  }

  if (!session?.authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{session.clientName}</h1>
            <p className="text-sm text-gray-500">Lead Portal</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{session.userEmail}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          <div
            className={`bg-white rounded-lg border p-3 cursor-pointer transition-all ${
              selectedStatus === '' ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedStatus('')}
          >
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">All</span>
            </div>
            <div className="text-xl font-bold">{total}</div>
          </div>
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div
              key={status}
              className={`rounded-lg border p-3 cursor-pointer transition-all ${
                selectedStatus === status ? 'ring-2 ring-blue-500' : ''
              } ${config.color.replace('text-', 'bg-').replace('-800', '-50')}`}
              onClick={() => setSelectedStatus(selectedStatus === status ? '' : status)}
            >
              <div className="flex items-center gap-1 mb-1">
                <config.icon className="h-3 w-3" />
                <span className="text-xs">{config.label}</span>
              </div>
              <div className="text-xl font-bold">{stats.byStatus[status] || 0}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg border p-4 mb-6">
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

        {/* Leads List */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading leads...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No leads found</p>
              {selectedStatus && (
                <button
                  onClick={() => setSelectedStatus('')}
                  className="mt-2 text-blue-600 hover:underline text-sm"
                >
                  Clear filter
                </button>
              )}
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
                    href={`/portal/leads/${lead.id}`}
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
                            <span className="flex items-center gap-1 text-gray-400">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(lead.createdAt)}
                            </span>
                          </div>
                        </div>

                        {/* Right: Sale Value & Arrow */}
                        <div className="flex items-center gap-3">
                          {lead.saleValue ? (
                            <div className="text-lg font-semibold text-emerald-600">
                              ${lead.saleValue.toLocaleString()}
                            </div>
                          ) : lead.status === 'SOLD' ? (
                            <div className="text-sm text-amber-600">Add sale value</div>
                          ) : null}
                          <ExternalLink className="h-4 w-4 text-gray-400" />
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
