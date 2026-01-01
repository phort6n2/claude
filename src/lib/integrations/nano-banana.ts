// Google AI Studio (Gemini) Integration for Image Generation
// API Key from: https://aistudio.google.com/app/apikey
// Model: gemini-2.0-flash-preview-image-generation

interface ImageGenerationParams {
  businessName: string
  city: string
  state: string
  paaQuestion: string
  phone: string
  website: string
  address: string
  aspectRatio: '16:9' | '1:1'
}

interface ImageResult {
  url: string
  width: number
  height: number
  base64?: string
}

// Only generate 2 sizes: 16:9 for social/blog and 1:1 for Instagram
const IMAGE_SIZES = {
  LANDSCAPE: { width: 1920, height: 1080, aspectRatio: '16:9' as const },
  SQUARE: { width: 1080, height: 1080, aspectRatio: '1:1' as const },
}

export async function generateImage(params: ImageGenerationParams): Promise<ImageResult> {
  const apiKey = process.env.NANO_BANANA_API_KEY
  if (!apiKey) {
    throw new Error('NANO_BANANA_API_KEY (Google AI Studio) is not configured')
  }

  const location = `${params.city}, ${params.state}`
  const dimensions = params.aspectRatio === '16:9'
    ? { width: 1920, height: 1080, size: '1920x1080px' }
    : { width: 1080, height: 1080, size: '1080x1080px' }

  const prompt = `Create a professional ${params.aspectRatio} social media marketing banner (${dimensions.size}) for ${params.businessName} with the following specifications:

HEADLINE AND TEXT CONTENT:
Main headline in extra bold white sans-serif font (80-100pt, similar to Montserrat Black): "${params.paaQuestion}"

Company branding: "${params.businessName}" with circular badge logo showing "${location}" in red and white on dark background

Contact information with circular icons:
- Phone: ${params.phone} (phone icon)
- Website: ${params.website} (globe icon)
- Address: ${params.address}

LAYOUT AND COMPOSITION:
${params.aspectRatio === '16:9'
  ? 'Split design with text-dominant left side (60%) and image-focused right side (40%). Left side contains all text elements aligned left: headline in upper quadrant, circular logo badge below headline, company name below logo, and contact section with icons at bottom. Right side features automotive photograph bleeding to edge.'
  : 'Centered design with headline at top, automotive image in middle, and contact info at bottom. Logo badge centered below headline.'}

COLOR PALETTE:
Choose a random dark color for primary background with a brighter version of that same color as accent. Pure white (#FFFFFF) text throughout. Light colored geometric shapes with transparency for visual interest.

GEOMETRIC ELEMENTS:
Large angular geometric shapes creating diagonal movement. Chevron arrows pointing right. Two white mechanical gear icons representing automotive technical service. Sharp diagonal lines creating dynamic negative space between sections.

AUTOMOTIVE PHOTOGRAPHY:
Random-colored modern sports car (Japanese or American) photographed from front three-quarter angle in wet/rainy conditions with water droplets visible on paint. Outdoor rainy/overcast setting with front grille, headlights, wheel, and windshield clearly visible. Photo slightly darkened and desaturated to blend with dark background, partially overlapped by geometric shapes.

DESIGN STYLE:
Modern professional automotive marketing with bold typography and dynamic geometric elements. Layered shapes create depth and movement. Strong contrast between dark background and white text ensures readability. Diagonal shapes guide eye from headline through company info to vehicle image. Gear icons and angular design suggest precision and technical expertise. Overall composition balances professionalism with dynamic energy suitable for digital marketing and social media use.`

  // Use Gemini 2.0 Flash for image generation
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
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
    width: dimensions.width,
    height: dimensions.height,
    base64: base64Image,
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
}): Promise<{ landscape?: ImageResult; square?: ImageResult }> {
  const results: { landscape?: ImageResult; square?: ImageResult } = {}

  // Generate 16:9 landscape image
  try {
    results.landscape = await generateImage({
      ...params,
      aspectRatio: '16:9',
    })
  } catch (error) {
    console.error('Failed to generate landscape image:', error)
  }

  // Generate 1:1 square image
  try {
    results.square = await generateImage({
      ...params,
      aspectRatio: '1:1',
    })
  } catch (error) {
    console.error('Failed to generate square image:', error)
  }

  return results
}

export { IMAGE_SIZES }
