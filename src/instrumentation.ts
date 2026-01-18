/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts - used for automatic database setup
 */

export async function register() {
  // Only run on the server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await setupCreatifyFields()
  }
}

/**
 * Automatically adds Creatify configuration fields to the Client table
 * This runs on server startup so you don't need to visit any setup endpoints
 */
async function setupCreatifyFields() {
  try {
    // Dynamic import to avoid issues during build
    const { prisma } = await import('@/lib/db')

    console.log('🔧 Checking Creatify database fields...')

    // Run raw SQL to add the new columns if they don't exist
    // PostgreSQL will ignore if columns already exist with IF NOT EXISTS
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        -- Add creatifyAvatarId column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyAvatarId') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyAvatarId" TEXT;
          RAISE NOTICE 'Added creatifyAvatarId column';
        END IF;

        -- Add creatifyVoiceId column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyVoiceId') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyVoiceId" TEXT;
          RAISE NOTICE 'Added creatifyVoiceId column';
        END IF;

        -- Add creatifyVisualStyle column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyVisualStyle') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyVisualStyle" TEXT;
          RAISE NOTICE 'Added creatifyVisualStyle column';
        END IF;

        -- Add creatifyScriptStyle column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyScriptStyle') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyScriptStyle" TEXT;
          RAISE NOTICE 'Added creatifyScriptStyle column';
        END IF;

        -- Add creatifyModelVersion column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyModelVersion') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyModelVersion" TEXT;
          RAISE NOTICE 'Added creatifyModelVersion column';
        END IF;

        -- Add creatifyVideoLength column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyVideoLength') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyVideoLength" INTEGER;
          RAISE NOTICE 'Added creatifyVideoLength column';
        END IF;

        -- Add creatifyNoCta column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Client' AND column_name='creatifyNoCta') THEN
          ALTER TABLE "Client" ADD COLUMN "creatifyNoCta" BOOLEAN DEFAULT false;
          RAISE NOTICE 'Added creatifyNoCta column';
        END IF;
      END $$;
    `)

    console.log('✅ Creatify database fields ready')
  } catch (error) {
    // Don't crash the app if this fails - columns might already exist
    // or database might not be ready yet (during build)
    console.log('⚠️ Creatify fields setup skipped:', error instanceof Error ? error.message : 'Unknown error')
  }
}
