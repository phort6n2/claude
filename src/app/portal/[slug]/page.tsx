export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ password?: string }>
}

async function getClient(slug: string) {
  return prisma.client.findUnique({
    where: { slug },
    include: {
      contentItems: {
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          paaQuestion: true,
          publishedAt: true,
          longformVideoUrl: true,
          blogPost: true,
          images: {
            where: { imageType: 'BLOG_FEATURED' },
            take: 1,
          },
          podcast: true,
          videos: true,
          socialPosts: true,
        },
      },
    },
  })
}

type Client = NonNullable<Awaited<ReturnType<typeof getClient>>>
type ContentItem = Client['contentItems'][number]
type Video = ContentItem['videos'][number]

export default async function ClientPortalPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { password } = await searchParams

  const client = await getClient(slug)

  if (!client) {
    notFound()
  }

  // Check authentication
  const cookieStore = await cookies()
  const authCookie = cookieStore.get(`portal_${slug}`)
  let isAuthenticated = false

  if (authCookie?.value === 'authenticated') {
    isAuthenticated = true
  } else if (password && client.portalPassword) {
    // Check password
    const isValid = await bcrypt.compare(password, client.portalPassword)
    if (isValid) {
      // Set cookie and redirect
      cookieStore.set(`portal_${slug}`, 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60, // 7 days
      })
      isAuthenticated = true
    }
  }

  if (!isAuthenticated && client.portalPassword) {
    return <PortalLogin slug={slug} error={password ? 'Invalid password' : undefined} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="bg-white shadow-sm"
        style={{ borderBottom: `4px solid ${client.primaryColor || '#1e40af'}` }}
      >
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            {client.logoUrl ? (
              <img
                src={client.logoUrl}
                alt={client.businessName}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white text-xl font-bold"
                style={{ backgroundColor: client.primaryColor || '#1e40af' }}
              >
                {client.businessName[0]}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {client.businessName}
              </h1>
              <p className="text-gray-500">Content Dashboard</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Total Published</p>
            <p className="text-3xl font-bold" style={{ color: client.primaryColor || '#1e40af' }}>
              {client.contentItems.length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">This Month</p>
            <p className="text-3xl font-bold" style={{ color: client.primaryColor || '#1e40af' }}>
              {client.contentItems.filter(
                (c: ContentItem) =>
                  c.publishedAt &&
                  new Date(c.publishedAt).getMonth() === new Date().getMonth()
              ).length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Total Content Pieces</p>
            <p className="text-3xl font-bold" style={{ color: client.primaryColor || '#1e40af' }}>
              {client.contentItems.reduce(
                (acc: number, c: ContentItem) =>
                  acc +
                  1 +
                  c.images.length +
                  (c.podcast ? 1 : 0) +
                  c.videos.length +
                  c.socialPosts.length,
                0
              )}
            </p>
          </div>
        </div>

        {/* Content Grid */}
        <h2 className="text-xl font-semibold mb-4">Published Content</h2>
        {client.contentItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No published content yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {client.contentItems.map((item: ContentItem) => (
              <div key={item.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Featured Image */}
                {item.images[0] && (
                  <img
                    src={item.images[0].gcsUrl}
                    alt={item.paaQuestion}
                    className="w-full h-48 object-cover"
                  />
                )}

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {item.blogPost?.title || item.paaQuestion}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {item.publishedAt && formatDate(item.publishedAt)}
                  </p>

                  {/* Links */}
                  <div className="flex flex-wrap gap-2">
                    {item.blogPost?.wordpressUrl && (
                      <a
                        href={item.blogPost.wordpressUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                      >
                        Blog
                      </a>
                    )}
                    {item.podcast && (
                      <a
                        href={item.podcast.audioUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200"
                      >
                        Podcast
                      </a>
                    )}
                    {item.videos.map((video: Video) => (
                      <a
                        key={video.id}
                        href={video.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                      >
                        Short Video
                      </a>
                    ))}
                    {item.longformVideoUrl && (
                      <a
                        href={item.longformVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                      >
                        Long Video
                      </a>
                    )}
                    {item.socialPosts.length > 0 && (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                        {item.socialPosts.length} Social Posts
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          Content by Auto Glass Marketing Pros
        </div>
      </footer>
    </div>
  )
}

function PortalLogin({ slug, error }: { slug: string; error?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div>
          <h1 className="text-2xl font-bold text-center text-gray-900">
            Client Portal
          </h1>
          <p className="mt-2 text-center text-gray-500">
            Enter your password to view your content
          </p>
        </div>

        <form action={`/portal/${slug}`} method="GET" className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Access Portal
          </button>
        </form>
      </div>
    </div>
  )
}
