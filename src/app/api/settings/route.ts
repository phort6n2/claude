import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma, withRetry } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'
import { ALL_KEYS, isSensitiveKey } from '@/lib/setting-keys'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await withRetry(() =>
    prisma.setting.findMany({
      where: { key: { in: ALL_KEYS } },
    })
  )

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
      const isSensitive = isSensitiveKey(key)
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
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const data = await request.json()
  const updates: { key: string; value: string }[] = data.settings || []

  for (const { key, value } of updates) {
    if (!ALL_KEYS.includes(key)) continue
    if (!value || value.trim() === '') continue // Skip empty values

    const isSensitive = isSensitiveKey(key)
    const storedValue = isSensitive ? encrypt(value) : value

    await prisma.setting.upsert({
      where: { key },
      update: { value: storedValue, encrypted: isSensitive },
      create: { key, value: storedValue, encrypted: isSensitive },
    })
  }

  return NextResponse.json({ success: true })
}
