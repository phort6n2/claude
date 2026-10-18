import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function getKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key === 'generate-your-64-char-hex-string' || key.length !== 64) {
    console.warn('ENCRYPTION_KEY not configured properly. Should be 64 hex characters.')
    return null
  }
  try {
    return Buffer.from(key, 'hex')
  } catch {
    console.warn('ENCRYPTION_KEY is not valid hex')
    return null
  }
}

export function encrypt(text: string): string {
  const key = getKey()
  if (!key) {
    // If no valid encryption key, store as base64 encoded (not secure, but functional)
    // In production, you should set a proper ENCRYPTION_KEY
    return 'b64:' + Buffer.from(text).toString('base64')
  }
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export function decrypt(encryptedText: string): string | null {
  // Handle base64 fallback
  if (encryptedText.startsWith('b64:')) {
    return Buffer.from(encryptedText.slice(4), 'base64').toString('utf8')
  }

  const key = getKey()
  if (!key) {
    // Can't decrypt without key - return null so calling code can handle it
    console.error('Cannot decrypt: ENCRYPTION_KEY not configured. Please re-save the setting.')
    return null
  }

  try {
    const [ivHex, encrypted] = encryptedText.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('Decryption failed:', error)
    return null
  }
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null
}

/**
 * True for a value written by the no-key fallback in `encrypt()` above:
 * base64, which anybody who can read the row can read.
 *
 * Production ran without a valid ENCRYPTION_KEY for long enough that every
 * key saved through Settings → API keys went in this way, and nothing said
 * so — `encrypt()` succeeds either way and `decrypt()` reads both. It
 * surfaced only when the Meta token save, which refuses rather than falling
 * back, reported the missing key.
 */
export function isUnencryptedFallback(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith('b64:')
}

/**
 * Re-store a readable secret under the real key, or say why not.
 *
 * Proven by ROUND TRIP before it is handed back: the new ciphertext is
 * decrypted again and compared with the original. A re-encryption that
 * cannot be read back would replace a working credential with garbage, and
 * the first anybody would hear of it is alerts quietly stopping. So this
 * never returns a value it has not just read back successfully.
 */
export function reencryptPlain(
  plain: string
): { ok: true; value: string } | { ok: false; reason: string } {
  if (!getKey()) return { ok: false, reason: 'ENCRYPTION_KEY is not set, so there is nothing to encrypt with' }
  if (!plain) return { ok: false, reason: 'empty value' }
  const value = encrypt(plain)
  if (isUnencryptedFallback(value)) return { ok: false, reason: 'encrypt() fell back to base64' }
  if (decrypt(value) !== plain) return { ok: false, reason: 'did not read back after encrypting' }
  return { ok: true, value }
}
