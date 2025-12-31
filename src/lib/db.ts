import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      'Database URL not configured. Set PRISMA_DATABASE_URL or DATABASE_URL.'
    )
  }

  return new PrismaClient({
    accelerateUrl: url,
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
