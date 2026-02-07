import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/add-notification-tables?key=glassleads2024
 * Creates the AdminPushSubscription and AdminPushSubscriptionClient tables
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'glassleads2024') {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  try {
    // Create AdminPushSubscription table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminPushSubscription" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "endpoint" TEXT NOT NULL,
        "p256dh" TEXT NOT NULL,
        "auth" TEXT NOT NULL,
        "userAgent" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastUsed" TIMESTAMP(3),
        "failCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AdminPushSubscription_pkey" PRIMARY KEY ("id")
      );
    `)

    // Create AdminPushSubscriptionClient table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AdminPushSubscriptionClient" (
        "id" TEXT NOT NULL,
        "subscriptionId" TEXT NOT NULL,
        "clientId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AdminPushSubscriptionClient_pkey" PRIMARY KEY ("id")
      );
    `)

    // Create indexes (ignore if they already exist)
    const indexes = [
      `CREATE UNIQUE INDEX IF NOT EXISTS "AdminPushSubscription_endpoint_key" ON "AdminPushSubscription"("endpoint")`,
      `CREATE INDEX IF NOT EXISTS "AdminPushSubscription_userId_idx" ON "AdminPushSubscription"("userId")`,
      `CREATE INDEX IF NOT EXISTS "AdminPushSubscription_isActive_idx" ON "AdminPushSubscription"("isActive")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "AdminPushSubscriptionClient_subscriptionId_clientId_key" ON "AdminPushSubscriptionClient"("subscriptionId", "clientId")`,
      `CREATE INDEX IF NOT EXISTS "AdminPushSubscriptionClient_subscriptionId_idx" ON "AdminPushSubscriptionClient"("subscriptionId")`,
      `CREATE INDEX IF NOT EXISTS "AdminPushSubscriptionClient_clientId_idx" ON "AdminPushSubscriptionClient"("clientId")`,
    ]

    for (const indexSql of indexes) {
      try {
        await prisma.$executeRawUnsafe(indexSql)
      } catch (e) {
        // Index might already exist, continue
        console.log('Index may already exist:', e)
      }
    }

    // Add foreign keys (ignore if they already exist)
    const foreignKeys = [
      {
        name: 'AdminPushSubscription_userId_fkey',
        sql: `ALTER TABLE "AdminPushSubscription" ADD CONSTRAINT "AdminPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      },
      {
        name: 'AdminPushSubscriptionClient_subscriptionId_fkey',
        sql: `ALTER TABLE "AdminPushSubscriptionClient" ADD CONSTRAINT "AdminPushSubscriptionClient_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AdminPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      },
      {
        name: 'AdminPushSubscriptionClient_clientId_fkey',
        sql: `ALTER TABLE "AdminPushSubscriptionClient" ADD CONSTRAINT "AdminPushSubscriptionClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      },
    ]

    for (const fk of foreignKeys) {
      try {
        await prisma.$executeRawUnsafe(fk.sql)
      } catch (e) {
        // Foreign key might already exist, continue
        console.log(`Foreign key ${fk.name} may already exist:`, e)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'AdminPushSubscription and AdminPushSubscriptionClient tables created successfully',
    })
  } catch (error) {
    console.error('Failed to create notification tables:', error)
    return NextResponse.json(
      { error: 'Failed to create tables', details: String(error) },
      { status: 500 }
    )
  }
}
