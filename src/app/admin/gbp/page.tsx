export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/db'

export default async function GBPDashboardPage() {
  // Get ALL active clients
  const allClients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      businessName: true,
      city: true,
      state: true,
      socialAccountIds: true,
      gbpPostConfig: {
        select: {
          id: true,
          enabled: true,
          googleRefreshToken: true,
          frequency: true,
          _count: {
            select: {
              posts: true,
            },
          },
        },
      },
    },
    orderBy: {
      businessName: 'asc',
    },
  })

  // Get recent posts across all clients
  const recentPosts = await prisma.gBPPost.findMany({
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  // Calculate stats
  const configuredCount = allClients.filter(c => c.gbpPostConfig).length
  const enabledCount = allClients.filter(c => c.gbpPostConfig?.enabled).length
  const connectedCount = allClients.filter(c => c.gbpPostConfig?.googleRefreshToken).length
  const totalPosts = allClients.reduce((sum, c) => sum + (c.gbpPostConfig?._count?.posts || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GBP Posting Dashboard</h1>
            <p className="text-gray-600">Manage Google Business Profile posts across all clients</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-gray-600">{allClients.length}</div>
            <div className="text-sm text-gray-600">Total Clients</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-blue-600">{enabledCount}</div>
            <div className="text-sm text-gray-600">GBP Enabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-green-600">{connectedCount}</div>
            <div className="text-sm text-gray-600">Google Connected</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-purple-600">{totalPosts}</div>
            <div className="text-sm text-gray-600">Total Posts</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client List */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">All Clients</h2>
              <p className="text-sm text-gray-500">Click on a client to set up or manage their GBP posts</p>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {allClients.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No active clients found.
                </div>
              ) : (
                allClients.map(client => {
                  const config = client.gbpPostConfig
                  const hasLateGBP = !!(client.socialAccountIds as Record<string, string> | null)?.gbp

                  return (
                    <Link
                      key={client.id}
                      href={`/admin/clients/${client.id}/gbp`}
                      className="block p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {client.businessName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {client.city}, {client.state}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {config ? (
                            <>
                              <span className={`text-xs px-2 py-1 rounded ${
                                config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {config.enabled ? 'Enabled' : 'Disabled'}
                              </span>

                              {config.googleRefreshToken && (
                                <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                                  Google
                                </span>
                              )}

                              {hasLateGBP && (
                                <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800">
                                  Late
                                </span>
                              )}

                              <span className="text-xs text-gray-500">
                                {config._count.posts} posts
                              </span>
                            </>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                              Not Set Up
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Recent Activity</h2>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {recentPosts.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No posts yet. Set up a client to get started!
                </div>
              ) : (
                recentPosts.map(post => (
                  <div key={post.id} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <Link
                        href={`/admin/clients/${post.client.id}/gbp`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {post.client.businessName}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        post.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                        post.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                        post.status === 'SCHEDULED' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {post.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{post.content}</p>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(post.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Setup Guide */}
        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Quick Setup Guide</h3>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
            <li>Click on any client above to open their GBP settings</li>
            <li>Connect their Google account to fetch photos (optional)</li>
            <li>Add rotation links (service pages, citations, etc.)</li>
            <li>Set posting frequency and preferred days</li>
            <li>Enable automated posting</li>
          </ol>
          <p className="text-xs text-blue-700 mt-3">
            Note: Clients need a GBP account connected in Late for posts to actually publish.
          </p>
        </div>
      </div>
    </div>
  )
}
