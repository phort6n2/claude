// Google AI Studio (Imagen) Integration for Image Generation
// API Key from: https://aistudio.google.com/app/apikey
// Note: This was previously called "Nano Banana" but uses Google's Imagen API

interface ImageGenerationParams {
  prompt: string
  width: number
  height: number
  businessName: string
  brandColors?: {
    primary: string
    secondary: string
    accent: string
  }
}

interface ImageResult {
  url: string
  width: number
  height: number
  base64?: string
}

const IMAGE_SIZES = {
  BLOG_FEATURED: { width: 1200, height: 800 },
  FACEBOOK: { width: 1200, height: 630 },
  INSTAGRAM_FEED: { width: 1080, height: 1080 },
  INSTAGRAM_STORY: { width: 1080, height: 1920 },
  TWITTER: { width: 1200, height: 675 },
  LINKEDIN: { width: 1200, height: 627 },
  TIKTOK: { width: 1080, height: 1920 },
}

// Map our sizes to Imagen's supported aspect ratios
function getImagenAspectRatio(width: number, height: number): string {
  const ratio = width / height
  if (ratio > 1.3) return '16:9'      // Landscape
  if (ratio < 0.7) return '9:16'      // Portrait/Story
  if (ratio > 0.9 && ratio < 1.1) return '1:1'  // Square
  return '4:3'  // Default
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageResult> {
  const apiKey = process.env.NANO_BANANA_API_KEY
  if (!apiKey) {
    throw new Error('NANO_BANANA_API_KEY (Google AI Studio) is not configured')
  }

  // Build the enhanced prompt
  const enhancedPrompt = `Professional auto glass blog image. ${params.prompt}.
Style: Clean, modern, automotive industry photography.
Business: ${params.businessName}.
Colors: ${params.brandColors ? `Primary ${params.brandColors.primary}, accent ${params.brandColors.accent}` : 'Professional blue tones'}.
High quality, photorealistic, suitable for business blog. No text overlays.`

  const aspectRatio = getImagenAspectRatio(params.width, params.height)

  // Use Google AI Studio's Imagen API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [{ prompt: enhancedPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatio,
          safetySetting: 'block_few',
          personGeneration: 'dont_allow',
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google AI Studio API error: ${error}`)
  }

  const data = await response.json()

  // Imagen returns base64 encoded images
  if (!data.predictions || data.predictions.length === 0) {
    throw new Error('No image generated')
  }

  const base64Image = data.predictions[0].bytesBase64Encoded

  // Return as data URL (can be uploaded to GCS)
  return {
    url: `data:image/png;base64,${base64Image}`,
    width: params.width,
    height: params.height,
    base64: base64Image,
  }
}

export async function generateAllImageSizes(params: {
  topic: string
  blogTitle: string
  businessName: string
  city: string
  brandColors?: {
    primary: string
    secondary: string
    accent: string
  }
}): Promise<Record<string, ImageResult>> {
  const basePrompt = `Topic: ${params.topic}. Blog title: "${params.blogTitle}". Location: ${params.city}.`

  const results: Record<string, ImageResult> = {}

  // Generate all sizes
  for (const [sizeName, dimensions] of Object.entries(IMAGE_SIZES)) {
    try {
      results[sizeName] = await generateImage({
        prompt: basePrompt,
        width: dimensions.width,
        height: dimensions.height,
        businessName: params.businessName,
        brandColors: params.brandColors,
      })
    } catch (error) {
      console.error(`Failed to generate ${sizeName} image:`, error)
      // Continue with other sizes
    }
  }

  return results
}

export { IMAGE_SIZES }
