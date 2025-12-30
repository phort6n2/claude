// Nano Banana Pro API Integration for Image Generation

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

export async function generateImage(params: ImageGenerationParams): Promise<ImageResult> {
  const apiKey = process.env.NANO_BANANA_API_KEY
  if (!apiKey) {
    throw new Error('NANO_BANANA_API_KEY is not configured')
  }

  // Build the enhanced prompt
  const enhancedPrompt = `Professional auto glass blog image. ${params.prompt}.
Style: Clean, modern, automotive industry.
Business: ${params.businessName}.
Colors: ${params.brandColors ? `Primary ${params.brandColors.primary}, accent ${params.brandColors.accent}` : 'Professional blue tones'}.
High quality, photorealistic, suitable for business blog.`

  const response = await fetch('https://api.nanobanana.com/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: enhancedPrompt,
      width: params.width,
      height: params.height,
      num_outputs: 1,
      guidance_scale: 7.5,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Nano Banana API error: ${error}`)
  }

  const data = await response.json()

  return {
    url: data.images[0].url,
    width: params.width,
    height: params.height,
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
