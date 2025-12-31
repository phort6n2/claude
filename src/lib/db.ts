import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // During build time, Next.js sets this environment variable
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'

  // Get the Accelerate URL (preferred) or fall back to direct URL
  const accelerateUrl = process.env.PRISMA_DATABASE_URL
  const directUrl = process.env.DATABASE_URL

  // Use whichever URL is available
  const connectionUrl = accelerateUrl || directUrl

  // During build time with no URL, create a dummy client
  // Dynamic pages won't actually query during build
  if (isBuildTime && !connectionUrl) {
    // Use type assertion to satisfy Prisma 7's strict requirements during build
    return new PrismaClient({ accelerateUrl: 'prisma://placeholder' }) as PrismaClient
  }

  // At runtime or build time with URL available
  if (connectionUrl) {
    return new PrismaClient({ accelerateUrl: connectionUrl })
  }

  throw new Error('No database URL configured. Set PRISMA_DATABASE_URL or DATABASE_URL.')
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
