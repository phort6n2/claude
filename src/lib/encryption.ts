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

export function decrypt(encryptedText: string): string {
  // Handle base64 fallback
  if (encryptedText.startsWith('b64:')) {
    return Buffer.from(encryptedText.slice(4), 'base64').toString('utf8')
  }

  const key = getKey()
  if (!key) {
    throw new Error('Cannot decrypt: ENCRYPTION_KEY not configured')
  }
  const [ivHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function isEncryptionConfigured(): boolean {
  return getKey() !== null
}
