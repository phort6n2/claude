import { NextResponse } from 'next/server'

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

export async function GET() {
  try {
    const login = process.env.DATAFORSEO_LOGIN
    const password = process.env.DATAFORSEO_PASSWORD

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
