// Google Cloud Storage Integration
import sharp from 'sharp'
import { getSetting } from '../settings'

interface UploadResult {
  url: string
  filename: string
}

export async function uploadToGCS(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  // Check environment variables first, then database settings
  // Support multiple key names for bucket and credentials
  const bucketName =
    process.env.GCS_BUCKET_NAME ||
    process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
    await getSetting('GCS_BUCKET_NAME') ||
    await getSetting('GCS_BUCKET') ||
    await getSetting('GOOGLE_CLOUD_BUCKET') ||
    await getSetting('GOOGLE_CLOUD_STORAGE_BUCKET')

  const credentialsJson =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    process.env.GOOGLE_CLOUD_CREDENTIALS ||
    process.env.GCS_CREDENTIALS_JSON ||
    await getSetting('GCS_CREDENTIALS_JSON') ||
    await getSetting('GOOGLE_APPLICATION_CREDENTIALS_JSON') ||
    await getSetting('GCS_CREDENTIALS') ||
    await getSetting('GCS_SERVICE_ACCOUNT_KEY') ||
    await getSetting('GOOGLE_CLOUD_CREDENTIALS')

  if (!bucketName) {
    throw new Error('GCS bucket name not configured. Add GCS_BUCKET_NAME to Settings > API Keys.')
  }

  if (!credentialsJson) {
    throw new Error('GCS credentials not configured. Add GCS_CREDENTIALS_JSON to Settings > API Keys with your service account JSON.')
  }

  let credentials
  try {
    credentials = JSON.parse(credentialsJson)
  } catch (e) {
    throw new Error('GCS credentials JSON is invalid. Make sure you pasted the complete service account JSON.')
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('GCS credentials JSON is missing required fields (client_email or private_key).')
  }

  // Get access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await createJWT(credentials),
    }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    throw new Error(`GCS OAuth token error (${tokenResponse.status}): ${error}`)
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  if (!accessToken) {
    throw new Error('GCS OAuth response missing access_token')
  }

  // Upload to GCS
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${encodeURIComponent(filename)}`

  // Convert Buffer to Uint8Array for fetch compatibility
  const uint8Array = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer)

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: uint8Array,
  })

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    throw new Error(`GCS upload error: ${error}`)
  }

  const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filename)}`

  return {
    url: publicUrl,
    filename,
  }
}

export async function uploadFromUrl(
  sourceUrl: string,
  filename: string
): Promise<UploadResult> {
  // Handle base64 data URLs (from Imagen API)
  if (sourceUrl.startsWith('data:')) {
    const matches = sourceUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (matches) {
      const base64Data = matches[2]
      // Always convert to JPG
      return uploadFromBase64(base64Data, filename, 'image/jpeg')
    }
  }


  const response = await fetch(sourceUrl)
  const buffer = await response.arrayBuffer()

  // Always convert images to JPG format for consistency
  const isImage = (response.headers.get('content-type') || '').startsWith('image/')
  if (isImage) {
    const jpgBuffer = await sharp(Buffer.from(buffer))
      .jpeg({
        quality: 85,
        progressive: true,
      })
      .toBuffer()

    // Ensure filename has .jpg extension
    const jpgFilename = filename.replace(/\.(png|jpeg|webp|gif)$/i, '.jpg')

    return uploadToGCS(jpgBuffer, jpgFilename, 'image/jpeg')
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  return uploadToGCS(buffer, filename, contentType)
}

export async function uploadFromBase64(
  base64Data: string,
  filename: string,
  contentType: string = 'image/jpeg'
): Promise<UploadResult> {
  const buffer = Buffer.from(base64Data, 'base64')

  // Always convert images to JPG format
  if (contentType.startsWith('image/')) {
    const jpgBuffer = await sharp(buffer)
      .jpeg({
        quality: 85,
        progressive: true,
      })
      .toBuffer()

    // Ensure filename has .jpg extension
    const jpgFilename = filename.replace(/\.(png|jpeg|webp|gif)$/i, '.jpg')

    return uploadToGCS(jpgBuffer, jpgFilename, 'image/jpeg')
  }

  return uploadToGCS(buffer, filename, contentType)
}

/**
 * Generate a signed URL for direct browser upload to GCS
 * This bypasses server-side body limits (like Vercel's 4.5MB limit)
 */
export async function getSignedUploadUrl(
  filename: string,
  contentType: string,
  expiresInMinutes: number = 15
): Promise<{ uploadUrl: string; publicUrl: string }> {
  // Check all possible bucket name settings (same as uploadToGCS)
  const bucketName =
    process.env.GCS_BUCKET_NAME ||
    process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
    await getSetting('GCS_BUCKET_NAME') ||
    await getSetting('GCS_BUCKET') ||
    await getSetting('GOOGLE_CLOUD_BUCKET') ||
    await getSetting('GOOGLE_CLOUD_STORAGE_BUCKET')

  // Check all possible credential settings (same as uploadToGCS)
  const credentialsJson =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    process.env.GOOGLE_CLOUD_CREDENTIALS ||
    process.env.GCS_CREDENTIALS_JSON ||
    await getSetting('GCS_CREDENTIALS_JSON') ||
    await getSetting('GOOGLE_APPLICATION_CREDENTIALS_JSON') ||
    await getSetting('GCS_CREDENTIALS') ||
    await getSetting('GCS_SERVICE_ACCOUNT_KEY') ||
    await getSetting('GOOGLE_CLOUD_CREDENTIALS')

  if (!bucketName) {
    throw new Error('GCS bucket name not configured. Add GCS_BUCKET_NAME to Settings > API Keys.')
  }

  if (!credentialsJson) {
    throw new Error('GCS credentials not configured. Add GCS_CREDENTIALS_JSON to Settings > API Keys.')
  }

  const credentials = JSON.parse(credentialsJson)
  const expiration = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60)

  // Create signed URL using V4 signing
  const host = `${bucketName}.storage.googleapis.com`
  const canonicalUri = `/${encodeURIComponent(filename)}`
  const signedHeaders = 'content-type;host'
  const credentialScope = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/${credentials.project_id || 'auto'}/storage/goog4_request`
  const datetime = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const canonicalQueryString = [
    `X-Goog-Algorithm=GOOG4-RSA-SHA256`,
    `X-Goog-Credential=${encodeURIComponent(credentials.client_email + '/' + credentialScope)}`,
    `X-Goog-Date=${datetime}`,
    `X-Goog-Expires=${expiresInMinutes * 60}`,
    `X-Goog-SignedHeaders=${signedHeaders}`,
  ].sort().join('&')

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const crypto = await import('crypto')
  const hashedRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    datetime,
    credentialScope,
    hashedRequest,
  ].join('\n')

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(stringToSign)
  const signature = sign.sign(credentials.private_key, 'hex')

  const signedUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signature}`
  const publicUrl = `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filename)}`

  return { uploadUrl: signedUrl, publicUrl }
}

async function createJWT(credentials: {
  client_email: string
  private_key: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signatureInput = `${headerB64}.${payloadB64}`

  const crypto = await import('crypto')
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signatureInput)
  const signature = sign.sign(credentials.private_key, 'base64url')

  return `${signatureInput}.${signature}`
}
