// Google AI Studio - Gemini Image Generation
// API Key from: https://aistudio.google.com/app/apikey
// Model: gemini-3-pro-image-preview (aka "Nano Banana Pro")

// Helper function to convert string to Title Case
function toTitleCase(str: string): string {
  // Words that should remain lowercase (unless first word)
  const exceptions = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in', 'with']

  // US state abbreviations that should remain uppercase
  const stateAbbreviations = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']

  const words = str.split(' ')
  return words.map((word, index) => {
    // Check for state abbreviations - strip punctuation for matching
    const wordNoPunct = word.replace(/[?,.:!]$/, '')
    const trailingPunct = word.slice(wordNoPunct.length)

    // Only uppercase state abbreviations when they appear after a comma
    // (like "Portland, OR") - not when used as words (like "in" or "or")
    const prevWord = index > 0 ? words[index - 1] : ''
    const afterComma = prevWord.endsWith(',')

    if (afterComma && stateAbbreviations.includes(wordNoPunct.toUpperCase())) {
      return wordNoPunct.toUpperCase() + trailingPunct
    }

    const lowerWord = word.toLowerCase()
    // Always capitalize first word, otherwise check exceptions
    if (index === 0 || !exceptions.includes(lowerWord)) {
      return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1)
    }
    return lowerWord
  }).join(' ')
}

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

  // Ensure state is uppercase (e.g., "OR" not "Or")
  const stateUpper = params.state.toUpperCase()
  const location = `${params.city}, ${stateUpper}`

  // Apply Title Case to PAA question for the headline
  const headlineText = toTitleCase(params.paaQuestion)

  const dimensions = params.aspectRatio === '16:9'
    ? { width: 1920, height: 1080, size: '1920x1080px', ratio: '16:9' }
    : { width: 1080, height: 1080, size: '1080x1080px', ratio: '1:1' }

  // For square images, use an adapted layout that maintains the same style
  const layoutDescription = params.aspectRatio === '16:9'
    ? `Split design with text-dominant left side (60%) and image-focused right side (40%). Left side contains all text elements aligned left: headline in upper quadrant, circular logo badge below headline, company name below logo, and contact section with icons at bottom. Right side features automotive photograph bleeding to edge.`
    : `Stacked vertical design optimized for Instagram. Top third: headline text. Middle section: circular logo badge with company name and location. Bottom third: contact information with blue icons. Automotive photograph as background with dark semi-transparent overlay for text readability. Geometric shapes in corners and along edges create visual interest while maintaining the same dynamic style as landscape version.`

  const prompt = `Create a professional ${dimensions.ratio} social media marketing banner (${dimensions.size}) for ${params.businessName} with the following specifications:

EXACT TEXT TO USE (copy these exactly - do not use placeholders):
- Headline: "${headlineText}"
- Business Name: "${params.businessName}"
- Location Text: "${location}"
- Phone Number: "${params.phone}"
- Website URL: "${params.website}"
- Address: "${params.address}"

HEADLINE AND TEXT CONTENT:
Main headline in extra bold white sans-serif font (80-100pt, similar to Montserrat Black): "${headlineText}"

Company branding: "${params.businessName}" with circular badge logo showing the text "${location}" in red and white on dark background

Contact information with blue circular icons:
- Phone: ${params.phone} (blue phone icon)
- Website: ${params.website} (blue globe icon)
- Address: ${params.address}

LAYOUT AND COMPOSITION:
${layoutDescription}

COLOR PALETTE:
Choose a random dark color for primary background with a brighter version of that same color as accent. Pure white (#FFFFFF) text throughout. Light colored geometric shapes with transparency for visual interest.

GEOMETRIC ELEMENTS:
Large angular geometric shapes creating diagonal movement from upper left to middle right. Three chevron arrows pointing right in lower right quadrant. Two white mechanical gear icons in bottom right corner representing automotive technical service. Sharp diagonal lines creating dynamic negative space between sections.

AUTOMOTIVE PHOTOGRAPHY:
Random-colored modern sports car (Japanese or American) photographed from front three-quarter angle in wet/rainy conditions with water droplets visible on paint. Outdoor rainy/overcast setting with front grille, headlights, wheel, and windshield clearly visible. Photo slightly darkened and desaturated to blend with dark background, bleeding to right edge and partially overlapped by geometric shapes.

DESIGN STYLE:
Modern professional automotive marketing with bold typography and dynamic geometric elements. Layered shapes create depth and movement. Strong contrast between dark background and white text ensures readability. Diagonal shapes guide eye from headline through company info to vehicle image. Gear icons and angular design suggest precision and technical expertise. Overall composition balances professionalism with dynamic energy suitable for digital marketing and social media use.

CRITICAL REQUIREMENTS:
1. Use ONLY the exact text values provided in "EXACT TEXT TO USE" section above
2. The location badge must display "${location}" - NOT "{location}" or any placeholder
3. The website must show "${params.website}" exactly as written
4. Do NOT use any placeholder syntax like {variable} or [placeholder]
5. No watermarks or attribution marks`

  // Use Gemini 3 Pro Image Preview for image generation
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${params.apiKey}`,
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
          imageConfig: {
            aspectRatio: dimensions.ratio,
          }
        }
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Gemini API error response:', errorText)
    throw new Error(`Gemini API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  console.log('Gemini API response received')

  // Extract image from Gemini response
  const candidates = data.candidates
  if (!candidates || candidates.length === 0) {
    console.error('No candidates in response:', JSON.stringify(data, null, 2))
    throw new Error('No candidates in Gemini response')
  }

  const parts = candidates[0].content?.parts
  if (!parts || parts.length === 0) {
    console.error('No parts in response:', JSON.stringify(candidates[0], null, 2))
    throw new Error('No parts in Gemini response')
  }

  // Find the image part
  const imagePart = parts.find((part: { inlineData?: { mimeType: string; data: string } }) =>
    part.inlineData?.mimeType?.startsWith('image/')
  )

  if (!imagePart || !imagePart.inlineData) {
    console.error('No image in parts:', JSON.stringify(parts, null, 2).substring(0, 500))
    throw new Error('No image generated - model returned text only')
  }

  const base64Image = imagePart.inlineData.data
  const mimeType = imagePart.inlineData.mimeType || 'image/png'

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
  apiKey: string
}): Promise<{ landscape?: ImageResult; square?: ImageResult }> {
  const results: { landscape?: ImageResult; square?: ImageResult } = {}
  const errors: string[] = []

  if (!params.apiKey) {
    throw new Error('NANO_BANANA_API_KEY (Google AI Studio) is not configured. Go to Settings > API Keys to add it.')
  }

  console.log('Starting image generation with Gemini 3 Pro Image...')

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
    errors.push(`Landscape: ${error}`)
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
    errors.push(`Square: ${error}`)
  }

  // If both failed, throw the errors so they show up in the UI
  if (!results.landscape && !results.square && errors.length > 0) {
    throw new Error(`Image generation failed: ${errors.join('; ')}`)
  }

  return results
}

export { IMAGE_SIZES }
