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

      // Check if it's a connection error worth retrying.
      // Prisma surfaces the code on the error object rather than in the
      // message, so check both — matching on message text alone missed P2024
      // entirely, which is the pool-exhaustion error this app actually hits.
      const code = (lastError as { code?: string }).code ?? ''
      const isConnectionError =
        code === 'P1001' || // Can't reach database server
        code === 'P1002' || // Database server timed out
        code === 'P1008' || // Operations timed out
        code === 'P1017' || // Server closed the connection
        code === 'P2024' || // Timed out fetching a connection from the pool
        lastError.message.includes('connect') ||
        lastError.message.includes('Connection') ||
        lastError.message.includes('connection pool') ||
        lastError.message.includes('ECONNREFUSED') ||
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('P1001') ||
        lastError.message.includes('P1002') ||
        lastError.message.includes('P1008') ||
        lastError.message.includes('P1017') ||
        lastError.message.includes('P2024')

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
