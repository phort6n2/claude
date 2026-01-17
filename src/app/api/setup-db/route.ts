import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/setup-db - One-time endpoint to create PushSubscription table
 * DELETE THIS FILE AFTER USE
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token !== 'setup-push-2024') {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  try {
    // Try to create the table by running a raw SQL command
    // This creates the PushSubscription table if it doesn't exist
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "PushSubscription" (
        "id" TEXT NOT NULL,
        "clientUserId" TEXT NOT NULL,
        "endpoint" TEXT NOT NULL,
        "p256dh" TEXT NOT NULL,
        "auth" TEXT NOT NULL,
        "userAgent" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "lastUsed" TIMESTAMP(3),
        "failCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
      )
    `

    // Create unique constraint on endpoint
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint")
    `

    // Create indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "PushSubscription_clientUserId_idx" ON "PushSubscription"("clientUserId")
    `

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "PushSubscription_isActive_idx" ON "PushSubscription"("isActive")
    `

    // Add foreign key constraint
    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'PushSubscription_clientUserId_fkey'
        ) THEN
          ALTER TABLE "PushSubscription"
          ADD CONSTRAINT "PushSubscription_clientUserId_fkey"
          FOREIGN KEY ("clientUserId") REFERENCES "ClientUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `

    return NextResponse.json({
      success: true,
      message: 'PushSubscription table created successfully',
      note: 'DELETE the /api/setup-db route file now!'
    })
  } catch (error) {
    console.error('Setup DB error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to setup database', details: message }, { status: 500 })
  }
}
