/**
 * Can a secret stored without encryption be upgraded in place, safely?
 *
 *   npx tsx scripts/check-reencrypt.ts
 *
 * WHY THIS EXISTS. `encrypt()` falls back to base64 when ENCRYPTION_KEY is
 * missing, and production ran that way: every key saved through Settings →
 * API keys was stored readable, and nothing said so because both halves kept
 * working. `/api/admin/reencrypt-secrets` upgrades them without anybody
 * retyping a credential — and the one thing it must never do is replace a
 * working credential with something that does not decrypt back to it.
 *
 * Silent cases first: no key means NO upgrade (not a base64 "upgrade" to
 * base64), and an empty value is refused rather than encrypted.
 */
import { decrypt, encrypt, isUnencryptedFallback, reencryptPlain } from '@/lib/encryption'

let failures = 0
function check(name: string, ok: boolean) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

const SECRET = 'sk-test-0123456789/abc+def=='
// A throwaway key for this script only; never a real one.
const TEST_KEY = 'a'.repeat(64)

// ── Without a key ─────────────────────────────────────────────────────────
delete process.env.ENCRYPTION_KEY
const fallback = encrypt(SECRET)
check('no key: encrypt() falls back to base64', isUnencryptedFallback(fallback))
check('no key: the fallback still reads back', decrypt(fallback) === SECRET)
check('no key: reencryptPlain refuses rather than "upgrading" to base64', !reencryptPlain(SECRET).ok)

process.env.ENCRYPTION_KEY = 'tooshort'
check('a key that is not 64 hex characters counts as no key', !reencryptPlain(SECRET).ok)

// ── With a key ────────────────────────────────────────────────────────────
process.env.ENCRYPTION_KEY = TEST_KEY
check('empty value is refused, not encrypted', !reencryptPlain('').ok)

const made = reencryptPlain(decrypt(fallback)!)
check('base64 value upgrades', made.ok)
if (made.ok) {
  check('upgraded value is not base64', !isUnencryptedFallback(made.value))
  check('upgraded value does not contain the secret', !made.value.includes(SECRET))
  check('upgraded value decrypts to the original', decrypt(made.value) === SECRET)
}
check('a b64 row still reads after the key is set', decrypt(fallback) === SECRET)
check('isUnencryptedFallback is false for real ciphertext', !isUnencryptedFallback(encrypt(SECRET)))
check('isUnencryptedFallback is false for null', !isUnencryptedFallback(null))

if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
