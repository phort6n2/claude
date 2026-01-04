import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

interface UserDataResponse {
  status_code?: number
  status_message?: string
  tasks?: Array<{
    result?: Array<{
      money?: {
        balance: number
        total_paid: number
        limits_total: number
      }
      login?: string
      registration_date?: string
    }>
  }>
}

async function getDataForSEOCredentials(): Promise<{ login: string | null; password: string | null }> {
  // Check database first
  const settings = await prisma.setting.findMany({
    where: { key: { in: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'] } },
  })

  let login: string | null = null
  let password: string | null = null

  for (const setting of settings) {
    const value = setting.encrypted ? decrypt(setting.value) : setting.value
    if (setting.key === 'DATAFORSEO_LOGIN') login = value
    if (setting.key === 'DATAFORSEO_PASSWORD') password = value
  }

  // Fall back to environment variables
  if (!login) login = process.env.DATAFORSEO_LOGIN || null
  if (!password) password = process.env.DATAFORSEO_PASSWORD || null

  return { login, password }
}

export async function GET() {
  try {
    const { login, password } = await getDataForSEOCredentials()

    if (!login || !password) {
      return NextResponse.json({
        configured: false,
        error: 'DataForSEO credentials not configured',
      })
    }

    const response = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
      },
    })

    if (!response.ok) {
      return NextResponse.json({
        configured: true,
        error: `API request failed: ${response.status}`,
      })
    }

    const data: UserDataResponse = await response.json()

    if (data.status_code !== 20000) {
      return NextResponse.json({
        configured: true,
        error: data.status_message || 'Unknown API error',
      })
    }

    const result = data.tasks?.[0]?.result?.[0]
    if (!result?.money) {
      return NextResponse.json({
        configured: true,
        error: 'Could not retrieve balance',
      })
    }

    return NextResponse.json({
      configured: true,
      balance: result.money.balance,
      totalPaid: result.money.total_paid,
      login: result.login,
    })
  } catch (error) {
    return NextResponse.json({
      configured: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
