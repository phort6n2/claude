import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

/**
 * A key from Settings → API keys, falling back to the environment.
 *
 * The Settings screen is the documented home for keys ("keys live in the
 * encrypted Setting table or in Vercel env vars" — CLAUDE.md §2), and half
 * the model-backed features honoured that while the other half read only
 * process.env. The failure that found it: the Anthropic key saved through
 * Settings made "suggest nearby cities" work while the site importer said
 * the key was not configured — same key, same admin, two answers.
 */
export async function secretSetting(key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (row) {
      if (row.encrypted) {
        try {
          return decrypt(row.value)
        } catch {
          // An undecryptable value falls through to env rather than winning
          // with garbage.
        }
      } else if (row.value) {
        return row.value
      }
    }
  } catch {
    // Table missing on a fresh deploy — env is the answer.
  }
  return process.env[key] || null
}
