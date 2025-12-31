// Google Cloud Storage Integration

interface UploadResult {
  url: string
  filename: string
}

export async function uploadToGCS(
  buffer: ArrayBuffer | Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const bucketName = process.env.GCS_BUCKET_NAME
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON

  if (!bucketName || !credentialsJson) {
    throw new Error('GCS credentials not configured')
  }

  const credentials = JSON.parse(credentialsJson)

  // Get access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await createJWT(credentials),
    }),
  })

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

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
  const response = await fetch(sourceUrl)
  const buffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'application/octet-stream'

  return uploadToGCS(buffer, filename, contentType)
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
