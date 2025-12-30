import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only create PrismaClient if we have a valid database URL
export const prisma = globalForPrisma.prisma ?? 
  (process.env.PRISMA_DATABASE_URL || process.env.DATABASE_URL
    ? new PrismaClient({
        accelerateUrl: process.env.PRISMA_DATABASE_URL
      })
    : null as any)

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma
}

export default prisma
