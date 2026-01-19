import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()

  try {
    // Simple query to check database connectivity
    await prisma.$queryRaw`SELECT 1`

    const latency = Date.now() - start

    return NextResponse.json({
      status: 'connected',
      latency,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const latency = Date.now() - start

    return NextResponse.json({
      status: 'disconnected',
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}
