import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkPostStatus } from '@/lib/integrations/getlate'
export const dynamic = 'force-dynamic'

// Runs every 6 hours to verify scheduled social posts were published
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  // In production, CRON_SECRET must be set
  if (isProduction && !cronSecret) {
    console.error('[CheckSocialPublished] CRON_SECRET not configured in production')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find scheduled posts that should have been published by now
    const now = new Date()
    const scheduledPosts = await prisma.socialPost.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledTime: { lt: now },
        getlatePostId: { not: null },
      },
      take: 50,
    })

    const results = []

    for (const post of scheduledPosts) {
      try {
        if (!post.getlatePostId) continue

        const status = await checkPostStatus(post.getlatePostId)

        if (status.status === 'published') {
          await prisma.socialPost.update({
            where: { id: post.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
            },
          })
          results.push({ id: post.id, status: 'published' })
        } else if (status.status === 'failed') {
          await prisma.socialPost.update({
            where: { id: post.id },
            data: { status: 'FAILED' },
          })
          results.push({ id: post.id, status: 'failed' })
        } else {
          results.push({ id: post.id, status: 'pending' })
        }
      } catch (error) {
        results.push({
          id: post.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      checked: results.length,
      results,
    })
  } catch (error) {
    console.error('Social check cron job failed:', error)
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    )
  }
}
