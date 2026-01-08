import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { generateGBPPost, incrementLinkRotation, getClientsDueForPosting } from '@/lib/gbp/post-generator'
import { schedulePost } from '@/lib/integrations/getlate'
import { GBPPhotoSource, GBPCtaType } from '@prisma/client'

// Allow up to 5 minutes for processing multiple clients
export const maxDuration = 300

/**
 * GBP Posts Cron Job
 * Runs daily to create and publish GBP posts for scheduled clients
 *
 * Schedule: 0 14 * * * (2 PM UTC daily - 6 AM PT, 9 AM ET)
 * Can be adjusted based on when GBP posts perform best
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const now = new Date()

  console.log(`[GBP Cron] Running at ${now.toISOString()}`)

  const results: {
    clientId: string
    businessName: string
    status: 'success' | 'skipped' | 'failed'
    error?: string
    postId?: string
  }[] = []

  try {
    // Get all clients due for GBP posting
    const dueConfigs = await getClientsDueForPosting()

    console.log(`[GBP Cron] Found ${dueConfigs.length} clients due for posting`)

    if (dueConfigs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No clients due for GBP posting',
        processed: 0,
        duration: Date.now() - startTime,
      })
    }

    // Process each client
    for (const config of dueConfigs) {
      const { client } = config

      try {
        console.log(`[GBP Cron] Processing: ${client.businessName}`)

        // Check if client has Late GBP connection
        const socialAccountIds = client.socialAccountIds as Record<string, string> | null
        const gbpAccountId = socialAccountIds?.gbp

        if (!gbpAccountId) {
          console.log(`[GBP Cron] Skipping ${client.businessName}: No GBP account in Late`)
          results.push({
            clientId: client.id,
            businessName: client.businessName,
            status: 'skipped',
            error: 'No GBP account configured in Late',
          })
          continue
        }

        // Generate AI post content
        const generated = await generateGBPPost({
          client,
          config,
        })

        // Create the post record
        const post = await prisma.gBPPost.create({
          data: {
            clientId: client.id,
            configId: config.id,
            content: generated.content,
            photoUrl: generated.photoUrl,
            photoSource: generated.photoSource as GBPPhotoSource,
            ctaUrl: generated.ctaUrl,
            ctaType: generated.ctaType as GBPCtaType,
            rotationLinkIndex: generated.rotationLinkIndex,
            rotationLinkLabel: generated.rotationLinkLabel,
            status: 'PUBLISHING',
          },
        })

        console.log(`[GBP Cron] Created post ${post.id} for ${client.businessName}`)

        // Publish via Late
        try {
          const result = await schedulePost({
            accountId: gbpAccountId,
            platform: 'gbp',
            caption: generated.content,
            mediaUrls: generated.photoUrl ? [generated.photoUrl] : undefined,
            mediaType: generated.photoUrl ? 'image' : undefined,
            scheduledTime: new Date(),
            ctaUrl: generated.ctaUrl || undefined,
          })

          // Update post as published
          await prisma.gBPPost.update({
            where: { id: post.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              latePostId: result.postId,
              platformPostUrl: result.platformPostUrl || null,
            },
          })

          // Increment link rotation
          if (generated.rotationLinkIndex !== null) {
            await incrementLinkRotation(config.id)
          }

          console.log(`[GBP Cron] Successfully published for ${client.businessName}`)
          results.push({
            clientId: client.id,
            businessName: client.businessName,
            status: 'success',
            postId: post.id,
          })
        } catch (publishError) {
          // Mark post as failed
          await prisma.gBPPost.update({
            where: { id: post.id },
            data: {
              status: 'FAILED',
              errorMessage: publishError instanceof Error ? publishError.message : 'Unknown error',
              retryCount: 1,
            },
          })

          throw publishError
        }
      } catch (error) {
        console.error(`[GBP Cron] Failed for ${client.businessName}:`, error)
        results.push({
          clientId: client.id,
          businessName: client.businessName,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Small delay between clients to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length
    const skippedCount = results.filter(r => r.status === 'skipped').length

    console.log(`[GBP Cron] Complete: ${successCount} success, ${failedCount} failed, ${skippedCount} skipped`)

    return NextResponse.json({
      success: true,
      processed: results.length,
      successCount,
      failedCount,
      skippedCount,
      results,
      duration: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[GBP Cron] Fatal error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
        duration: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
