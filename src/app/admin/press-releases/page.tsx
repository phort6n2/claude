import { Suspense } from 'react'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { prisma } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { Copy, ExternalLink } from 'lucide-react'

async function getPressReleases() {
  return prisma.pressRelease.findMany({
    orderBy: { month: 'desc' },
    include: {
      client: {
        select: { businessName: true, city: true, state: true },
      },
    },
  })
}

async function PressReleaseList() {
  const pressReleases = await getPressReleases()

  if (pressReleases.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-gray-500 mb-4">No press releases yet</p>
          <p className="text-sm text-gray-400">
            Press releases are automatically generated on the 1st of each month
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {pressReleases.map((pr) => (
        <Card key={pr.id}>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <CardTitle>{pr.client.businessName}</CardTitle>
                <StatusBadge status={pr.status} />
              </div>
              <p className="text-sm text-gray-500">
                {new Date(pr.month).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <CopyButton content={pr.content || ''} />
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                OpenPR
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pr.headline && (
              <h3 className="font-semibold text-lg mb-4">{pr.headline}</h3>
            )}

            <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs text-gray-500">Blog Posts</p>
                <p className="text-xl font-bold">{pr.blogPostsCount || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Content</p>
                <p className="text-xl font-bold">{pr.totalContentPieces || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">New Reviews</p>
                <p className="text-xl font-bold">{pr.newReviews || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Avg Rating</p>
                <p className="text-xl font-bold">
                  {pr.averageRating ? pr.averageRating.toFixed(1) : 'N/A'}
                </p>
              </div>
            </div>

            {pr.content && (
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                  View full press release
                </summary>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg whitespace-pre-wrap text-sm">
                  {pr.content}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CopyButton({ content }: { content: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(content)
      }}
    >
      <Copy className="h-4 w-4 mr-2" />
      Copy
    </Button>
  )
}

export default function PressReleasesPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="Press Releases"
        subtitle="Monthly press releases for OpenPR"
      />
      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <p className="text-sm text-gray-500">
            Press releases are automatically generated on the 1st of each month,
            summarizing the previous month&apos;s content and milestones for each client.
          </p>
        </div>
        <Suspense fallback={<div>Loading press releases...</div>}>
          <PressReleaseList />
        </Suspense>
      </div>
    </div>
  )
}
