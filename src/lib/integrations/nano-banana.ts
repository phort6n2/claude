// Google AI Studio - Imagen 3 Integration for Image Generation
// API Key from: https://aistudio.google.com/app/apikey
// Model: imagen-3.0-generate-001

interface ImageGenerationParams {
  businessName: string
  city: string
  state: string
  paaQuestion: string
  phone: string
  website: string
  address: string
  aspectRatio: '16:9' | '1:1'
  apiKey: string
}

interface ImageResult {
  url: string
  width: number
  height: number
  base64?: string
}

const IMAGE_SIZES = {
  LANDSCAPE: { width: 1920, height: 1080, aspectRatio: '16:9' as const },
  SQUARE: { width: 1080, height: 1080, aspectRatio: '1:1' as const },
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageResult> {
  if (!params.apiKey) {
    throw new Error('NANO_BANANA_API_KEY (Google AI Studio) is not configured')
  }

  const location = `${params.city}, ${params.state}`
  const dimensions = params.aspectRatio === '16:9'
    ? { width: 1920, height: 1080, size: '1920x1080px', ratio: '16:9' }
    : { width: 1080, height: 1080, size: '1080x1080px', ratio: '1:1' }

  const prompt = `Create a professional ${dimensions.ratio} social media marketing banner for ${params.businessName}, an auto glass company.

DESIGN REQUIREMENTS:
- Professional automotive marketing banner
- Main headline text: "${params.paaQuestion}"
- Company name: "${params.businessName}"
- Location badge: "${location}"
- Dark background with bright accent colors (NOT just blue - use varied colors like teal, purple, orange, or green)
- Pure white text for readability
- Modern geometric shapes and diagonal lines
- Include a modern sports car image (wet/rainy conditions preferred)
- Gear icons to represent automotive technical service
- Professional, dynamic composition
- NO watermarks or placeholder text

CONTACT INFO TO INCLUDE:
- Phone: ${params.phone}
- Website: ${params.website}

STYLE: Modern professional automotive marketing with bold typography, geometric elements, and dynamic energy suitable for social media.`

  // Use Imagen 3 for image generation
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${params.apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [
          { prompt: prompt }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: dimensions.ratio,
          safetyFilterLevel: 'block_only_high',
          personGeneration: 'dont_allow',
        }
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Imagen API error response:', errorText)
    throw new Error(`Imagen API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  console.log('Imagen API response structure:', JSON.stringify(data, null, 2).substring(0, 500))

  // Extract image from Imagen response
  const predictions = data.predictions
  if (!predictions || predictions.length === 0) {
    throw new Error('No predictions in Imagen response')
  }

  const imageData = predictions[0].bytesBase64Encoded
  if (!imageData) {
    throw new Error('No image data in Imagen response')
  }

  return {
    url: `data:image/png;base64,${imageData}`,
    width: dimensions.width,
    height: dimensions.height,
    base64: imageData,
  }
}

export async function generateBothImages(params: {
  businessName: string
  city: string
  state: string
  paaQuestion: string
  phone: string
  website: string
  address: string
  apiKey: string
}): Promise<{ landscape?: ImageResult; square?: ImageResult }> {
  const results: { landscape?: ImageResult; square?: ImageResult } = {}

  if (!params.apiKey) {
    console.log('Skipping image generation - NANO_BANANA_API_KEY not configured')
    return results
  }

  console.log('Starting image generation with Imagen 3...')

  // Generate 16:9 landscape image
  try {
    console.log('Generating landscape (16:9) image...')
    results.landscape = await generateImage({
      ...params,
      aspectRatio: '16:9',
    })
    console.log('Landscape image generated successfully')
  } catch (error) {
    console.error('Failed to generate landscape image:', error)
  }

  // Generate 1:1 square image
  try {
    console.log('Generating square (1:1) image...')
    results.square = await generateImage({
      ...params,
      aspectRatio: '1:1',
    })
    console.log('Square image generated successfully')
  } catch (error) {
    console.error('Failed to generate square image:', error)
  }

  return results
}

export { IMAGE_SIZES }
