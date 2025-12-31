import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Get the Accelerate URL from environment
const accelerateUrl = process.env.PRISMA_DATABASE_URL

// Create Prisma Client with Accelerate URL if available
export const prisma = globalForPrisma.prisma ??
  (accelerateUrl
    ? new PrismaClient({ accelerateUrl })
    : new PrismaClient())

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma
}

export default prisma
