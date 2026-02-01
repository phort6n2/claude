import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/migrate/google-ads-conversion-actions
 *
 * Adds the formConversionActionId and callConversionActionId columns
 * to the ClientGoogleAds table, and migrates any existing leadConversionActionId
 * values to formConversionActionId.
 */
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check if columns already exist by trying to query them
    const testQuery = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'ClientGoogleAds'
      AND column_name IN ('formConversionActionId', 'callConversionActionId')
    ` as { column_name: string }[]

    const existingColumns = testQuery.map(r => r.column_name)
    const results: string[] = []

    // Add formConversionActionId if it doesn't exist
    if (!existingColumns.includes('formConversionActionId')) {
      await prisma.$executeRaw`
        ALTER TABLE "ClientGoogleAds"
        ADD COLUMN IF NOT EXISTS "formConversionActionId" TEXT
      `
      results.push('Added formConversionActionId column')
    } else {
      results.push('formConversionActionId column already exists')
    }

    // Add callConversionActionId if it doesn't exist
    if (!existingColumns.includes('callConversionActionId')) {
      await prisma.$executeRaw`
        ALTER TABLE "ClientGoogleAds"
        ADD COLUMN IF NOT EXISTS "callConversionActionId" TEXT
      `
      results.push('Added callConversionActionId column')
    } else {
      results.push('callConversionActionId column already exists')
    }

    // Migrate existing leadConversionActionId values to formConversionActionId
    // (only where formConversionActionId is null and leadConversionActionId has a value)
    const migrated = await prisma.$executeRaw`
      UPDATE "ClientGoogleAds"
      SET "formConversionActionId" = "leadConversionActionId"
      WHERE "formConversionActionId" IS NULL
      AND "leadConversionActionId" IS NOT NULL
    `

    if (migrated > 0) {
      results.push(`Migrated ${migrated} existing leadConversionActionId values to formConversionActionId`)
    } else {
      results.push('No existing values to migrate')
    }

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      results,
    })
  } catch (error) {
    console.error('Migration error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration failed',
    }, { status: 500 })
  }
}
