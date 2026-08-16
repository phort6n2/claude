'use client'

import { useState, useMemo } from 'react'
import { relativeAge } from '@/lib/lead-display'
import Link from 'next/link'
import {
  Search,
  LayoutGrid,
  List,
  MapPin,
  Settings,
  ChevronUp,
  ChevronDown,
  PhoneCall,
  ArrowUpRight,
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import ClientLogo from '@/components/ui/ClientLogo'

interface Client {
  id: string
  businessName: string
  slug: string
  city: string | null
  state: string | null
  status: string
  logoUrl: string | null
  primaryColor: string | null
  googleMapsUrl: string | null
  callCoachingEnabled: boolean
  leadsLast7: number
  lastLeadAt: Date | string | null
}

type SortKey = 'name' | 'status' | 'leads' | 'lastLead'
type SortDirection = 'asc' | 'desc'

interface ClientsListViewProps {
  clients: Client[]
}

export default function ClientsListView({ clients }: ClientsListViewProps) {
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const filteredAndSortedClients = useMemo(() => {
    let result = [...clients]

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(
        client =>
          client.businessName.toLowerCase().includes(searchLower) ||
          client.city?.toLowerCase().includes(searchLower) ||
          client.state?.toLowerCase().includes(searchLower)
      )
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (sortKey) {
        case 'name':
          comparison = a.businessName.localeCompare(b.businessName)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        // Quiet-first by default on both: the shop with no leads this week is
        // the one to ring, and a list that buries it is a list you have to
        // read all of.
        case 'leads':
          comparison = a.leadsLast7 - b.leadsLast7
          break
        case 'lastLead': {
          const at = a.lastLeadAt ? new Date(a.lastLeadAt).getTime() : 0
          const bt = b.lastLeadAt ? new Date(b.lastLeadAt).getTime() : 0
          comparison = at - bt
          break
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [clients, search, sortKey, sortDirection])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  function renderSortIcon(column: SortKey) {
    if (sortKey !== column) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    )
  }

  return (
    <div>
      {/* Search and View Toggle */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients by name or location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 mr-2">{filteredAndSortedClients.length} clients</span>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setView('table')}
                className={`px-3 py-2 transition-colors ${
                  view === 'table' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('cards')}
                className={`px-3 py-2 transition-colors ${
                  view === 'cards' ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-4">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      Client
                      {renderSortIcon('name')}
                    </button>
                  </th>
                  <th className="text-right px-4 py-4">
                    <button
                      onClick={() => handleSort('leads')}
                      className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      Leads (7d)
                      {renderSortIcon('leads')}
                    </button>
                  </th>
                  <th className="text-left px-4 py-4">
                    <button
                      onClick={() => handleSort('lastLead')}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                    >
                      Last lead
                      {renderSortIcon('lastLead')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Client */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <ClientLogo
                          logoUrl={client.logoUrl}
                          businessName={client.businessName}
                          primaryColor={client.primaryColor}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/clients/${client.id}`}
                              className="font-medium text-gray-900 hover:text-blue-600 transition-colors truncate"
                            >
                              {client.businessName}
                            </Link>
                            {/* Only when it is NOT the normal case. A badge
                                reading ACTIVE on every row is a column of the
                                same word. */}
                            {client.status !== 'ACTIVE' && <StatusBadge status={client.status} />}
                          </div>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {client.city}, {client.state}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Leads in the last 7 days */}
                    <td className="px-4 py-4 text-right">
                      <span
                        className={`tabular-nums font-semibold ${
                          client.leadsLast7 === 0 ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {client.leadsLast7}
                      </span>
                    </td>

                    {/* Last lead */}
                    <td className="px-4 py-4">
                      {client.lastLeadAt ? (
                        <span
                          className="text-sm text-gray-600"
                          title={new Date(client.lastLeadAt).toLocaleString()}
                        >
                          {relativeAge(client.lastLeadAt)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">never</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Card View */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredAndSortedClients.map((client) => (
            <div
              key={client.id}
              className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300 overflow-hidden"
            >
              {/* Status Bar */}
              <div
                className={`h-1.5 ${
                  client.status === 'ACTIVE'
                    ? 'bg-gradient-to-r from-blue-400 to-indigo-400'
                    : 'bg-gradient-to-r from-gray-300 to-gray-400'
                }`}
              />

              <div className="p-5">
                {/* Header Row */}
                <div className="flex items-start gap-4 mb-4">
                  <ClientLogo
                    logoUrl={client.logoUrl}
                    businessName={client.businessName}
                    primaryColor={client.primaryColor}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                      {client.businessName}
                    </h3>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {client.city}, {client.state}
                    </p>
                  </div>
                  <Link
                    href={`/admin/clients/${client.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-gray-100 rounded-lg"
                    title="Client Settings"
                  >
                    <Settings className="h-4 w-4 text-gray-400" />
                  </Link>
                </div>

                {/* Status Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <StatusBadge status={client.status} />
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      client.callCoachingEnabled
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                        : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200'
                    }`}
                  >
                    <PhoneCall className="h-3 w-3" />
                    Coaching {client.callCoachingEnabled ? 'On' : 'Off'}
                  </span>
                </div>

                {/* Quick Links */}
                <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-4 border-b border-gray-100">
                  {client.googleMapsUrl && (
                    <a
                      href={client.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      <MapPin className="h-3 w-3" />
                      Map
                      <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link href={`/admin/clients/${client.id}`} className="flex-1">
                    <button className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-gray-900 rounded-xl transition-all duration-200 flex items-center justify-center gap-2">
                      <Settings className="h-4 w-4" />
                      Manage
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
