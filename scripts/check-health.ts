import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== CONTENT AUTOMATION HEALTH CHECK ===\n')

  // 1. Check content by status
  const statusCounts = await prisma.contentItem.groupBy({
    by: ['status'],
    _count: { status: true },
  })
  console.log('Content by Status:')
  statusCounts.forEach(s => console.log(`  ${s.status}: ${s._count.status}`))

  // 2. Check for stuck GENERATING content
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const stuckGenerating = await prisma.contentItem.findMany({
    where: {
      status: 'GENERATING',
      updatedAt: { lt: twoHoursAgo },
    },
    select: {
      id: true,
      paaQuestion: true,
      updatedAt: true,
      client: { select: { businessName: true } },
    },
  })
  console.log(`\nStuck GENERATING (>2hrs): ${stuckGenerating.length}`)
  stuckGenerating.forEach(c => {
    const question = c.paaQuestion ? c.paaQuestion.substring(0, 50) : 'No question'
    console.log(`  - ${c.client.businessName}: ${question}... (updated ${c.updatedAt})`)
  })

  // 3. Check for stuck SCHEDULED content
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
  const stuckScheduled = await prisma.contentItem.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledDate: { lt: sixHoursAgo },
    },
    select: {
      id: true,
      scheduledDate: true,
      client: { select: { businessName: true } },
    },
  })
  console.log(`\nStuck SCHEDULED (>6hrs past): ${stuckScheduled.length}`)
  stuckScheduled.forEach(c => console.log(`  - ${c.client.businessName}: scheduled for ${c.scheduledDate}`))

  // 4. Recent cron runs
  const recentCrons = await prisma.publishingLog.findMany({
    where: { action: 'cron_hourly_publish' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      status: true,
      createdAt: true,
      durationMs: true,
      responseData: true,
    },
  })
  console.log(`\nRecent Hourly Cron Runs:`)
  if (recentCrons.length === 0) {
    console.log('  (no cron runs logged yet)')
  } else {
    recentCrons.forEach(c => {
      let processed = 0
      let successful = 0
      try {
        const data = c.responseData ? JSON.parse(c.responseData as string) : {}
        processed = data.processed || 0
        successful = data.successful || 0
      } catch (e) {}
      const date = c.createdAt ? c.createdAt.toISOString() : 'unknown'
      console.log(`  ${date} - ${c.status} (${c.durationMs}ms) - processed: ${processed}, success: ${successful}`)
    })
  }

  // 5. Clients with auto-schedule enabled
  const autoClients = await prisma.client.findMany({
    where: {
      status: 'ACTIVE',
      autoScheduleEnabled: true,
    },
    select: {
      businessName: true,
      scheduleDayPair: true,
      scheduleTimeSlot: true,
      lastAutoScheduledAt: true,
    },
  })
  console.log(`\nAuto-Schedule Enabled Clients: ${autoClients.length}`)
  autoClients.forEach(c => console.log(`  - ${c.businessName}: ${c.scheduleDayPair} slot ${c.scheduleTimeSlot}`))

  // 6. Content created in last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const recentContent = await prisma.contentItem.count({
    where: { createdAt: { gte: weekAgo } },
  })
  const recentPublished = await prisma.contentItem.count({
    where: { createdAt: { gte: weekAgo }, status: 'PUBLISHED' },
  })
  const recentReview = await prisma.contentItem.count({
    where: { createdAt: { gte: weekAgo }, status: 'REVIEW' },
  })
  console.log(`\nLast 7 Days: ${recentContent} created, ${recentPublished} published, ${recentReview} in review`)

  // 7. Failed content in last 7 days
  const recentFailed = await prisma.contentItem.findMany({
    where: {
      createdAt: { gte: weekAgo },
      status: 'FAILED',
    },
    select: {
      id: true,
      lastError: true,
      client: { select: { businessName: true } },
    },
  })
  console.log(`\nFailed in Last 7 Days: ${recentFailed.length}`)
  recentFailed.slice(0, 5).forEach(c => {
    const error = c.lastError ? c.lastError.substring(0, 80) : 'No error message'
    console.log(`  - ${c.client.businessName}: ${error}...`)
  })
  if (recentFailed.length > 5) {
    console.log(`  ... and ${recentFailed.length - 5} more`)
  }

  // 8. Check current Mountain Time
  const mtFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  console.log(`\nCurrent Mountain Time: ${mtFormatter.format(new Date())}`)

  await prisma.$disconnect()
  console.log('\n=== HEALTH CHECK COMPLETE ===')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
