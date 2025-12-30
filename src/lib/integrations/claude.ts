import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface BlogPostParams {
  businessName: string
  city: string
  state: string
  hasAdas: boolean
  serviceAreas: string[]
  brandVoice: string
  paaQuestion: string
  servicePageUrl?: string
  locationPageUrls?: string[]
  ctaText: string
  ctaUrl: string
}

interface BlogPostResult {
  title: string
  slug: string
  content: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  focusKeyword: string
}

export async function generateBlogPost(params: BlogPostParams): Promise<BlogPostResult> {
  const prompt = `You are an expert auto glass content writer creating SEO-optimized blog posts.

Client: ${params.businessName} in ${params.city}, ${params.state}
Services: ${params.hasAdas ? 'Includes ADAS calibration' : 'Standard auto glass services'}
Service Areas: ${params.serviceAreas.join(', ')}
Brand Voice: ${params.brandVoice}

PAA Question: "${params.paaQuestion}"

Requirements:
- 800-1500 words
- Answer the question directly in the first sentence
- Use H2/H3 headings for clear structure
- Naturally mention service areas throughout the content
${params.servicePageUrl ? `- Link to service page: ${params.servicePageUrl}` : ''}
${params.locationPageUrls?.length ? `- Link to location pages: ${params.locationPageUrls.join(', ')}` : ''}
- Include CTA: "${params.ctaText}" with link to ${params.ctaUrl}
- Educational, professional tone matching the brand voice
- Include relevant auto glass industry expertise

Generate the blog post as semantic HTML (using h2, h3, p, ul, li tags).
Also provide:
- A compelling title (50-60 characters)
- URL slug
- Excerpt (150-160 characters)
- Meta title (50-60 characters)
- Meta description (150-160 characters)
- Focus keyword

Return as JSON with keys: title, slug, content, excerpt, metaTitle, metaDescription, focusKeyword`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse blog post response')
  }

  return JSON.parse(jsonMatch[0])
}

interface SocialCaptionParams {
  platform: 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok'
  blogTitle: string
  blogExcerpt: string
  businessName: string
  blogUrl: string
}

export async function generateSocialCaption(params: SocialCaptionParams): Promise<{
  caption: string
  hashtags: string[]
  firstComment: string
}> {
  const platformGuidelines = {
    facebook: 'Longer, conversational, storytelling approach. Can include the blog link inline.',
    instagram: 'Shorter, emoji-friendly, hashtag-heavy. Mention "link in bio" for the blog post.',
    linkedin: 'Professional, industry insights focused. Include the blog link inline.',
    twitter: 'Concise, punchy, engaging. Thread-worthy if needed. Include link.',
    tiktok: 'Casual, trend-aligned, relatable. Mention link in bio.',
  }

  const prompt = `Generate a ${params.platform} post for an auto glass company.

Business: ${params.businessName}
Blog Title: "${params.blogTitle}"
Blog Summary: "${params.blogExcerpt}"
Blog URL: ${params.blogUrl}

Platform Guidelines: ${platformGuidelines[params.platform]}

Return JSON with:
- caption: The main post text
- hashtags: Array of relevant hashtags (without #)
- firstComment: A follow-up comment with the blog link (for platforms that support it)`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse social caption response')
  }

  return JSON.parse(jsonMatch[0])
}

interface PressReleaseParams {
  businessName: string
  city: string
  state: string
  month: string
  year: number
  featuredTopics: { question: string; url: string }[]
  blogPostsCount: number
  totalContentPieces: number
  newReviews: number
  totalReviews: number
  averageRating: number
  ownerName?: string
}

export async function generatePressRelease(params: PressReleaseParams): Promise<{
  headline: string
  content: string
}> {
  const prompt = `Write a press release for OpenPR.

Client: ${params.businessName} in ${params.city}, ${params.state}
Month: ${params.month} ${params.year}

Featured Topics (weave these together naturally):
${params.featuredTopics.map((t, i) => `${i + 1}. ${t.question} - ${t.url}`).join('\n')}

Milestones:
- Published ${params.blogPostsCount} educational articles
- Created ${params.totalContentPieces} total content pieces
- Received ${params.newReviews} new reviews this month
- Maintains ${params.averageRating.toFixed(1)} star rating with ${params.totalReviews} total reviews

Requirements:
- 300-800 words
- OpenPR format with city/state dateline
- News angle: educational content initiative
- Include an auto-generated owner quote${params.ownerName ? ` from ${params.ownerName}` : ''}
- Links inline to blog posts
- Professional tone
- Boilerplate "About" section at the end

Return JSON with:
- headline: Press release headline
- content: Full press release text (plain text, not HTML)`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse press release response')
  }

  return JSON.parse(jsonMatch[0])
}

export async function generatePodcastScript(params: {
  businessName: string
  city: string
  paaQuestion: string
  blogContent: string
  phone: string
  website: string
}): Promise<string> {
  const prompt = `Create a short podcast script (2-3 minutes when read aloud) for an auto glass company.

Business: ${params.businessName} in ${params.city}
Topic: ${params.paaQuestion}
Phone: ${params.phone}
Website: ${params.website}

Blog content to summarize:
${params.blogContent.substring(0, 2000)}

Format:
- Introduction: Welcome listeners, introduce the topic
- Main Content: Key points from the blog, conversational tone
- Conclusion: Call to action with phone and website

Return only the script text, ready to be read aloud.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
