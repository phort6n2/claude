import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only instantiate Prisma if we're not in build mode
export const prisma = 
  process.env.NEXT_PHASE === 'phase-production-build'
    ? {} as PrismaClient
    : (globalForPrisma.prisma ?? new PrismaClient())

if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
  globalForPrisma.prisma = prisma
}

export default prisma
