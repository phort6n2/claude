export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/db'

export default async function GBPDashboardPage() {
  // Get all clients with GBP config
  const configs = await prisma.gBPPostConfig.findMany({
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
          city: true,
          state: true,
          status: true,
          socialAccountIds: true,
        },
      },
      posts: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          posts: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
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
  const enabledCount = configs.filter(c => c.enabled).length
  const connectedCount = configs.filter(c => c.googleRefreshToken).length
  const totalPosts = configs.reduce((sum, c) => sum + c._count.posts, 0)
  const publishedThisWeek = await prisma.gBPPost.count({
    where: {
      status: 'PUBLISHED',
      publishedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
  })

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
            <div className="text-3xl font-bold text-blue-600">{enabledCount}</div>
            <div className="text-sm text-gray-600">Clients Enabled</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-green-600">{connectedCount}</div>
            <div className="text-sm text-gray-600">Google Connected</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-purple-600">{totalPosts}</div>
            <div className="text-sm text-gray-600">Total Posts</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-orange-600">{publishedThisWeek}</div>
            <div className="text-sm text-gray-600">Published This Week</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client List */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Clients</h2>
            </div>
            <div className="divide-y">
              {configs.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No clients have GBP posting configured yet.
                </div>
              ) : (
                configs.map(config => {
                  const hasLateGBP = !!(config.client.socialAccountIds as Record<string, string> | null)?.gbp
                  const lastPost = config.posts[0]

                  return (
                    <div key={config.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <Link
                            href={`/admin/clients/${config.client.id}/gbp`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {config.client.businessName}
                          </Link>
                          <div className="text-sm text-gray-500">
                            {config.client.city}, {config.client.state}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Status badges */}
                          <span className={`text-xs px-2 py-1 rounded ${
                            config.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {config.enabled ? 'Enabled' : 'Disabled'}
                          </span>

                          {config.googleRefreshToken && (
                            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                              Google Connected
                            </span>
                          )}

                          {hasLateGBP && (
                            <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-800">
                              Late GBP
                            </span>
                          )}

                          <span className="text-xs text-gray-500">
                            {config._count.posts} posts
                          </span>
                        </div>
                      </div>

                      {lastPost && (
                        <div className="mt-2 text-xs text-gray-500">
                          Last post: {new Date(lastPost.createdAt).toLocaleDateString()} - {lastPost.status}
                        </div>
                      )}
                    </div>
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
                  No posts yet.
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
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Quick Setup</h3>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
            <li>Go to a client&apos;s GBP settings page</li>
            <li>Connect their Google account to fetch photos</li>
            <li>Add rotation links (service pages, citations, etc.)</li>
            <li>Set posting frequency and preferred days</li>
            <li>Enable automated posting</li>
          </ol>
          <p className="text-xs text-blue-700 mt-3">
            Note: Clients need a GBP account connected in Late for posts to publish.
          </p>
        </div>
      </div>
    </div>
  )
}
