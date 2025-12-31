// Google AI Studio (Gemini) Integration for Image Generation
// API Key from: https://aistudio.google.com/app/apikey
// Model: gemini-3-pro-image-preview

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

export async function generateImage(params: ImageGenerationParams): Promise<ImageResult> {
  const apiKey = process.env.NANO_BANANA_API_KEY
  if (!apiKey) {
    throw new Error('NANO_BANANA_API_KEY (Google AI Studio) is not configured')
  }

  // Build the enhanced prompt for image generation
  const enhancedPrompt = `Generate a professional auto glass blog image.

${params.prompt}

Style requirements:
- Clean, modern, automotive industry photography
- Professional business imagery for ${params.businessName}
- Color scheme: ${params.brandColors ? `Primary ${params.brandColors.primary}, accent ${params.brandColors.accent}` : 'Professional blue tones'}
- High quality, photorealistic
- Suitable for business blog
- No text overlays or watermarks
- Landscape orientation preferred`

  // Use Gemini 3 Pro Image Preview model
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: enhancedPrompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 1,
          topP: 0.95,
          topK: 40,
        }
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google AI Studio API error: ${error}`)
  }

  const data = await response.json()

  // Extract image from Gemini response
  const candidates = data.candidates
  if (!candidates || candidates.length === 0) {
    throw new Error('No response from model')
  }

  const parts = candidates[0].content?.parts
  if (!parts) {
    throw new Error('No content in response')
  }

  // Find the image part in the response
  const imagePart = parts.find((part: { inlineData?: { mimeType: string; data: string } }) =>
    part.inlineData?.mimeType?.startsWith('image/')
  )

  if (!imagePart || !imagePart.inlineData) {
    throw new Error('No image generated - model may have returned text only')
  }

  const base64Image = imagePart.inlineData.data
  const mimeType = imagePart.inlineData.mimeType || 'image/png'

  // Return as data URL (can be uploaded to GCS)
  return {
    url: `data:${mimeType};base64,${base64Image}`,
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

  // Generate all sizes - Gemini generates one size, we'll use it for all
  // In production, you might want to resize or generate multiple times
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
