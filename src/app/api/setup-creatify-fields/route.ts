import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * GET /api/setup-creatify-fields
 *
 * Adds the new Creatify configuration fields to the Client table.
 * Visit this URL once after deployment to update your database schema.
 *
 * New fields added:
 * - creatifyAvatarId: Override avatar (presenter) ID
 * - creatifyVoiceId: Override voice ID
 * - creatifyVisualStyle: Visual template style
 * - creatifyScriptStyle: Script writing style
 * - creatifyModelVersion: Quality tier (standard/aurora)
 * - creatifyVideoLength: Video duration (15/30/45/60 seconds)
 * - creatifyNoCta: Disable default CTA button
 */
export async function GET() {
  try {
    // Run raw SQL to add the new columns if they don't exist
    // PostgreSQL will ignore if columns already exist with IF NOT EXISTS
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        -- Add creatifyAvatarId column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyAvatarId') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyAvatarId" TEXT;
        END IF;

        -- Add creatifyVoiceId column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyVoiceId') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyVoiceId" TEXT;
        END IF;

        -- Add creatifyVisualStyle column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyVisualStyle') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyVisualStyle" TEXT;
        END IF;

        -- Add creatifyScriptStyle column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyScriptStyle') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyScriptStyle" TEXT;
        END IF;

        -- Add creatifyModelVersion column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyModelVersion') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyModelVersion" TEXT;
        END IF;

        -- Add creatifyVideoLength column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyVideoLength') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyVideoLength" INTEGER;
        END IF;

        -- Add creatifyNoCta column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyNoCta') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyNoCta" BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `)

    // Verify the columns were added by checking one client
    const sampleClient = await prisma.client.findFirst({
      select: {
        id: true,
        businessName: true,
        creatifyAvatarId: true,
        creatifyVoiceId: true,
        creatifyVisualStyle: true,
        creatifyScriptStyle: true,
        creatifyModelVersion: true,
        creatifyVideoLength: true,
        creatifyNoCta: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Creatify configuration fields added to Client table',
      fields: [
        'creatifyAvatarId',
        'creatifyVoiceId',
        'creatifyVisualStyle',
        'creatifyScriptStyle',
        'creatifyModelVersion',
        'creatifyVideoLength',
        'creatifyNoCta',
      ],
      sampleClient: sampleClient ? {
        id: sampleClient.id,
        businessName: sampleClient.businessName,
        creatifySettings: {
          avatarId: sampleClient.creatifyAvatarId,
          voiceId: sampleClient.creatifyVoiceId,
          visualStyle: sampleClient.creatifyVisualStyle,
          scriptStyle: sampleClient.creatifyScriptStyle,
          modelVersion: sampleClient.creatifyModelVersion,
          videoLength: sampleClient.creatifyVideoLength,
          noCta: sampleClient.creatifyNoCta,
        }
      } : null,
      nextSteps: [
        'Visit /api/creatify/avatars-voices to get available avatar and voice IDs',
        'Update client settings via /admin/clients/[id] or API',
      ],
    })
  } catch (error) {
    console.error('Error setting up Creatify fields:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add Creatify fields',
        hint: 'Make sure your database connection is working and you have ALTER TABLE permissions',
      },
      { status: 500 }
    )
  }
}
