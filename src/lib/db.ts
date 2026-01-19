import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

// Keep connection alive in production to avoid cold starts
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
} else {
  globalForPrisma.prisma = prisma
}

/**
 * Execute a database operation with automatic retry on connection failures.
 * Useful for serverless databases that may have cold start delays.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; backoff?: boolean } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = true } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if it's a connection error worth retrying
      const isConnectionError =
        lastError.message.includes('connect') ||
        lastError.message.includes('Connection') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('P1001') || // Prisma: Can't reach database server
        lastError.message.includes('P1002') || // Prisma: Database server timed out
        lastError.message.includes('P1008') || // Prisma: Operations timed out
        lastError.message.includes('P1017')    // Prisma: Server closed connection

      if (!isConnectionError || attempt === maxRetries) {
        throw lastError
      }

      // Wait before retrying (with optional exponential backoff)
      const waitTime = backoff ? delayMs * Math.pow(2, attempt) : delayMs
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }

  throw lastError
}

/**
 * Warm up the database connection.
 * Call this early in request handling to reduce latency.
 */
export async function warmupConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export default prisma
