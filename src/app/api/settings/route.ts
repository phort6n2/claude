import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

// API keys that should be stored encrypted
const SENSITIVE_KEYS = [
  'ANTHROPIC_API_KEY',
  'NANO_BANANA_API_KEY',
  'AUTOCONTENT_API_KEY',
  'CREATIFY_API_KEY',
  'GETLATE_API_KEY',
  'GOOGLE_CLOUD_CREDENTIALS',
  'GOOGLE_PLACES_API_KEY',
  'PODBEAN_CLIENT_SECRET',
  'DATAFORSEO_PASSWORD',
  'GBP_CLIENT_SECRET',
]

const ALL_KEYS = [
  'ANTHROPIC_API_KEY',
  'NANO_BANANA_API_KEY',
  'AUTOCONTENT_API_KEY',
  'CREATIFY_API_KEY',
  'GETLATE_API_KEY',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_CLOUD_STORAGE_BUCKET',
  'GOOGLE_CLOUD_CREDENTIALS',
  'GOOGLE_PLACES_API_KEY',
  'PODBEAN_CLIENT_ID',
  'PODBEAN_CLIENT_SECRET',
  'DATAFORSEO_LOGIN',
  'DATAFORSEO_PASSWORD',
  'GBP_CLIENT_ID',
  'GBP_CLIENT_SECRET',
]

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await prisma.setting.findMany({
    where: { key: { in: ALL_KEYS } },
  })

  // Build response with masked values for sensitive keys
  const result: Record<string, { value: string; masked: string; hasValue: boolean }> = {}

  for (const key of ALL_KEYS) {
    const setting = settings.find(s => s.key === key)
    if (setting) {
      let value = setting.value
      if (setting.encrypted) {
        const decrypted = decrypt(setting.value)
        value = decrypted ?? ''
      }
      const isSensitive = SENSITIVE_KEYS.includes(key)
      result[key] = {
        value: isSensitive ? '' : value, // Don't send actual sensitive values to client
        masked: value ? (isSensitive ? '••••••••' + value.slice(-4) : value) : '',
        hasValue: Boolean(value),
      }
    } else {
      // Check if there's an env variable set
      const envValue = process.env[key]
      result[key] = {
        value: '',
        masked: envValue ? '(from environment)' : '',
        hasValue: Boolean(envValue),
      }
    }
  }

  return NextResponse.json(result)
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await request.json()
  const updates: { key: string; value: string }[] = data.settings || []

  for (const { key, value } of updates) {
    if (!ALL_KEYS.includes(key)) continue
    if (!value || value.trim() === '') continue // Skip empty values

    const isSensitive = SENSITIVE_KEYS.includes(key)
    const storedValue = isSensitive ? encrypt(value) : value

    await prisma.setting.upsert({
      where: { key },
      update: { value: storedValue, encrypted: isSensitive },
      create: { key, value: storedValue, encrypted: isSensitive },
    })
  }

  return NextResponse.json({ success: true })
}
