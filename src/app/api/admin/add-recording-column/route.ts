import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/add-recording-column
 *
 * Adds the callRecordingUrl column to the Lead table.
 * Visit this URL once to migrate the database, then deploy the feature code.
 */
export async function GET() {
  try {
    // Check if column already exists by trying to query it
    try {
      await prisma.$queryRaw`SELECT "callRecordingUrl" FROM "Lead" LIMIT 1`
      return NextResponse.json({
        success: true,
        message: 'Column callRecordingUrl already exists. You can now deploy the feature.',
        alreadyExists: true,
      })
    } catch {
      // Column doesn't exist, we need to add it
    }

    // Add the column using raw SQL
    await prisma.$executeRaw`ALTER TABLE "Lead" ADD COLUMN "callRecordingUrl" TEXT`

    return NextResponse.json({
      success: true,
      message: 'Column callRecordingUrl added successfully! You can now deploy the call recording feature.',
      alreadyExists: false,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Add Recording Column] Error:', errorMessage)

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 })
  }
}
