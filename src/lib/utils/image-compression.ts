// Image Compression Utility for Social Media Platforms
import sharp from 'sharp'
import { uploadToGCS } from '@/lib/integrations/gcs'

// Platform-specific size limits (in bytes)
const PLATFORM_SIZE_LIMITS: Record<string, number> = {
  gbp: 5 * 1024 * 1024,        // 5MB for Google Business Profile
  instagram: 8 * 1024 * 1024,   // 8MB for Instagram
  facebook: 8 * 1024 * 1024,    // 8MB for Facebook
  twitter: 5 * 1024 * 1024,     // 5MB for Twitter/X
  linkedin: 8 * 1024 * 1024,    // 8MB for LinkedIn
  pinterest: 20 * 1024 * 1024,  // 20MB for Pinterest
  threads: 8 * 1024 * 1024,     // 8MB for Threads
  bluesky: 1 * 1024 * 1024,     // 1MB for Bluesky
  reddit: 20 * 1024 * 1024,     // 20MB for Reddit
  telegram: 10 * 1024 * 1024,   // 10MB for Telegram
}

// Default limit for platforms not listed
const DEFAULT_SIZE_LIMIT = 5 * 1024 * 1024 // 5MB

interface CompressedImageResult {
  url: string
  originalSize: number
  compressedSize: number
  wasCompressed: boolean
}

/**
 * Fetches an image from URL, compresses if needed for the target platform,
 * and returns a URL (either original or compressed version in GCS)
 */
export async function compressImageForPlatform(
  imageUrl: string,
  platform: string,
  contentItemId: string
): Promise<CompressedImageResult> {
  const platformLower = platform.toLowerCase()
  const sizeLimit = PLATFORM_SIZE_LIMITS[platformLower] || DEFAULT_SIZE_LIMIT

  // Fetch the original image
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`)
  }

  const originalBuffer = Buffer.from(await response.arrayBuffer())
  const originalSize = originalBuffer.length

  console.log(`Image size check for ${platform}: ${(originalSize / 1024 / 1024).toFixed(2)}MB (limit: ${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`)

  // If image is already under the limit, return original URL
  if (originalSize <= sizeLimit) {
    return {
      url: imageUrl,
      originalSize,
      compressedSize: originalSize,
      wasCompressed: false,
    }
  }

  console.log(`Compressing image for ${platform}...`)

  // Get image metadata
  const metadata = await sharp(originalBuffer).metadata()
  const isJpeg = metadata.format === 'jpeg' || metadata.format === 'jpg'
  const isPng = metadata.format === 'png'

  // Start compression with progressive quality reduction
  let compressedBuffer: Buffer
  let quality = 85
  const minQuality = 30
  const qualityStep = 10

  // Calculate target dimensions (maintain aspect ratio, reduce if very large)
  let targetWidth = metadata.width || 1200
  let targetHeight = metadata.height || 1200
  const maxDimension = 2048 // Maximum dimension for any side

  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    const scale = maxDimension / Math.max(targetWidth, targetHeight)
    targetWidth = Math.round(targetWidth * scale)
    targetHeight = Math.round(targetHeight * scale)
  }

  // GBP only supports JPG and PNG
  const outputFormat = platformLower === 'gbp' && !isJpeg && !isPng ? 'jpeg' : (isJpeg ? 'jpeg' : 'png')

  do {
    const sharpInstance = sharp(originalBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })

    if (outputFormat === 'jpeg') {
      compressedBuffer = await sharpInstance
        .jpeg({
          quality,
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer()
    } else {
      compressedBuffer = await sharpInstance
        .png({
          quality,
          compressionLevel: 9,
        })
        .toBuffer()
    }

    console.log(`Compression attempt: quality=${quality}, size=${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`)

    // If still too large, reduce quality or dimensions
    if (compressedBuffer.length > sizeLimit) {
      quality -= qualityStep

      // If quality is already at minimum, reduce dimensions
      if (quality < minQuality) {
        quality = 60 // Reset quality
        targetWidth = Math.round(targetWidth * 0.8)
        targetHeight = Math.round(targetHeight * 0.8)
        console.log(`Reducing dimensions to ${targetWidth}x${targetHeight}`)
      }
    }
  } while (compressedBuffer.length > sizeLimit && (quality >= minQuality || targetWidth > 400))

  // If we still couldn't get under the limit, throw an error
  if (compressedBuffer.length > sizeLimit) {
    throw new Error(`Unable to compress image below ${(sizeLimit / 1024 / 1024).toFixed(2)}MB limit for ${platform}`)
  }

  // Upload compressed image to GCS
  const timestamp = Date.now()
  const extension = outputFormat === 'jpeg' ? 'jpg' : 'png'
  const filename = `content/${contentItemId}/compressed-${platform}-${timestamp}.${extension}`
  const contentType = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'

  const uploadResult = await uploadToGCS(compressedBuffer, filename, contentType)

  console.log(`Compressed image uploaded: ${uploadResult.url} (${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB)`)

  return {
    url: uploadResult.url,
    originalSize,
    compressedSize: compressedBuffer.length,
    wasCompressed: true,
  }
}

/**
 * Check if an image needs compression for a specific platform
 */
export async function needsCompression(
  imageUrl: string,
  platform: string
): Promise<boolean> {
  const platformLower = platform.toLowerCase()
  const sizeLimit = PLATFORM_SIZE_LIMITS[platformLower] || DEFAULT_SIZE_LIMIT

  try {
    // Use HEAD request to get content length without downloading
    const response = await fetch(imageUrl, { method: 'HEAD' })
    const contentLength = response.headers.get('content-length')

    if (contentLength) {
      const size = parseInt(contentLength, 10)
      return size > sizeLimit
    }

    // If no content-length header, assume it might need compression
    return true
  } catch {
    // If check fails, assume compression might be needed
    return true
  }
}
