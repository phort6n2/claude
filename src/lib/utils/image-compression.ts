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
 * Fetches an image from URL, ALWAYS converts to PNG format,
 * and returns a new URL in GCS
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

  // Get image metadata
  const metadata = await sharp(originalBuffer).metadata()
  const originalFormat = metadata.format

  console.log(`Image check for ${platform}: ${(originalSize / 1024 / 1024).toFixed(2)}MB, format: ${originalFormat} (limit: ${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`)

  // Calculate target dimensions (maintain aspect ratio, reduce if very large)
  let targetWidth = metadata.width || 1200
  let targetHeight = metadata.height || 1200
  const maxDimension = 2048 // Maximum dimension for any side

  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    const scale = maxDimension / Math.max(targetWidth, targetHeight)
    targetWidth = Math.round(targetWidth * scale)
    targetHeight = Math.round(targetHeight * scale)
  }

  // ALWAYS convert to PNG - never trust the original format
  let compressedBuffer: Buffer

  do {
    compressedBuffer = await sharp(originalBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({
        compressionLevel: 9,
      })
      .toBuffer()

    console.log(`PNG conversion: ${targetWidth}x${targetHeight}, size=${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`)

    // If still too large, reduce dimensions
    if (compressedBuffer.length > sizeLimit) {
      targetWidth = Math.round(targetWidth * 0.8)
      targetHeight = Math.round(targetHeight * 0.8)
      console.log(`Reducing dimensions to ${targetWidth}x${targetHeight}`)
    }
  } while (compressedBuffer.length > sizeLimit && targetWidth > 400)

  // If we still couldn't get under the limit, throw an error
  if (compressedBuffer.length > sizeLimit) {
    throw new Error(`Unable to compress image below ${(sizeLimit / 1024 / 1024).toFixed(2)}MB limit for ${platform}`)
  }

  // Upload converted PNG to GCS
  const timestamp = Date.now()
  const filename = `content/${contentItemId}/png-${platform}-${timestamp}.png`

  const uploadResult = await uploadToGCS(compressedBuffer, filename, 'image/png')

  console.log(`PNG uploaded: ${uploadResult.url} (${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB)`)

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

// Blog image optimization settings
const BLOG_IMAGE_CONFIG = {
  maxWidth: 1600,           // Max width for blog featured images
  maxHeight: 1200,          // Max height
  maxSizeBytes: 2 * 1024 * 1024,  // 2MB target for fast loading
  quality: 85,              // Good quality for web
  minQuality: 60,           // Minimum acceptable quality
}

/**
 * Compresses an image optimized for blog display
 * - Targets 2MB or less for fast page loading
 * - Resizes to max 1600px width for web display
 * - ALWAYS converts to PNG format
 */
export async function compressImageForBlog(
  imageUrl: string,
  contentItemId: string,
  suffix: string = 'blog'
): Promise<CompressedImageResult> {
  // Fetch the original image
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`)
  }

  const originalBuffer = Buffer.from(await response.arrayBuffer())
  const originalSize = originalBuffer.length

  // Get image metadata
  const metadata = await sharp(originalBuffer).metadata()
  const currentWidth = metadata.width || 1200
  const currentHeight = metadata.height || 800

  console.log(`Blog image: ${(originalSize / 1024 / 1024).toFixed(2)}MB, ${currentWidth}x${currentHeight}, format: ${metadata.format}`)

  let compressedBuffer: Buffer
  let targetWidth = Math.min(currentWidth, BLOG_IMAGE_CONFIG.maxWidth)
  let targetHeight = Math.min(currentHeight, BLOG_IMAGE_CONFIG.maxHeight)

  // ALWAYS convert to PNG - never trust the original format
  do {
    compressedBuffer = await sharp(originalBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({
        compressionLevel: 9,
      })
      .toBuffer()

    console.log(`Blog PNG conversion: ${targetWidth}x${targetHeight}, size=${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`)

    if (compressedBuffer.length > BLOG_IMAGE_CONFIG.maxSizeBytes) {
      // Reduce dimensions if still too large
      targetWidth = Math.round(targetWidth * 0.85)
      targetHeight = Math.round(targetHeight * 0.85)
      console.log(`Reducing blog image dimensions to ${targetWidth}x${targetHeight}`)
    }
  } while (compressedBuffer.length > BLOG_IMAGE_CONFIG.maxSizeBytes && targetWidth > 800)

  // Upload converted PNG to GCS
  const timestamp = Date.now()
  const filename = `content/${contentItemId}/png-${suffix}-${timestamp}.png`

  const uploadResult = await uploadToGCS(compressedBuffer, filename, 'image/png')

  console.log(`Blog PNG uploaded: ${uploadResult.url} (${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB)`)

  return {
    url: uploadResult.url,
    originalSize,
    compressedSize: compressedBuffer.length,
    wasCompressed: true,
  }
}
