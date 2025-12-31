import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Get the Accelerate URL - required for Prisma 7
  const accelerateUrl = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL

  if (!accelerateUrl) {
    throw new Error(
      'Database URL not configured. Please set PRISMA_DATABASE_URL or DATABASE_URL environment variable.'
    )
  }

  return new PrismaClient({ accelerateUrl })
}

// Use lazy initialization to ensure env vars are available
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
