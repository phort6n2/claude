export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { prisma } from '@/lib/db'
import {
  Plus,
  RefreshCw,
  Users,
  Activity,
} from 'lucide-react'
import ClientsListView from '@/components/admin/ClientsListView'

async function getClients() {
  return prisma.client.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

async function getStats() {
  const [total, active] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { status: 'ACTIVE' } }),
  ])
  return { total, active }
}

function StatsBar({ stats }: { stats: { total: number; active: number } }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100 text-sm font-medium">Total Clients</p>
            <p className="text-3xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3">
            <Users className="h-6 w-6" />
          </div>
        </div>
      </div>
      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-500/25">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-emerald-100 text-sm font-medium">Active</p>
            <p className="text-3xl font-bold mt-1">{stats.active}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3">
            <Activity className="h-6 w-6" />
          </div>
        </div>
      </div>
    </div>
  )
}

async function ClientsContent() {
  const [clients, stats] = await Promise.all([getClients(), getStats()])

  if (clients.length === 0) {
    return (
      <>
        <StatsBar stats={stats} />
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="bg-blue-50 rounded-full p-4 mb-4">
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No clients yet</h3>
            <p className="text-gray-500 mb-6 text-center max-w-md">
              Get started by adding your first auto glass shop client. You&apos;ll be able to manage their leads and call coaching.
            </p>
            <Link href="/admin/clients/new">
              <Button size="lg" className="shadow-lg shadow-blue-500/25">
                <Plus className="h-5 w-5 mr-2" />
                Add Your First Client
              </Button>
            </Link>
          </CardContent>
        </Card>
      </>
    )
  }

  // Serialize dates for client component
  const serializedClients = clients.map(client => ({
    ...client,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  }))

  return (
    <>
      <StatsBar stats={stats} />
      <ClientsListView clients={serializedClients} />
    </>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-gray-200 rounded-2xl h-28" />
        ))}
      </div>
      {/* Search bar skeleton */}
      <div className="bg-gray-200 rounded-xl h-16 mb-6" />
      {/* Table skeleton */}
      <div className="bg-gray-200 rounded-2xl h-[600px]" />
    </div>
  )
}

export default function ClientsPage() {
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <Header
        title="Clients"
        subtitle="Manage your auto glass shop clients"
      />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-[1800px] mx-auto">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">All Clients</h2>
              <p className="text-gray-500 text-sm mt-1">
                View and manage all your auto glass shop clients in one place
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="shadow-sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Link href="/admin/clients/new">
                <Button className="shadow-lg shadow-blue-500/25">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </Link>
            </div>
          </div>

          <Suspense fallback={<LoadingSkeleton />}>
            <ClientsContent />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
