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
  phone: string
  website: string
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
  const location = `${params.city}, ${params.state}`
  const servicePageUrl = params.servicePageUrl || params.ctaUrl

  const prompt = `You are an expert local SEO content writer specializing in auto glass services. Write a comprehensive, SEO-optimized blog post following these exact specifications:

**CLIENT & PAA INFORMATION:**
- Business Name: ${params.businessName}
- Location (City, State): ${location}
- PAA Question: ${params.paaQuestion}
- Main Service Page URL: ${servicePageUrl}
- Phone Number: ${params.phone}
- Website: ${params.website}
${params.hasAdas ? '- Services Include: ADAS Calibration' : ''}

**BLOG POST STRUCTURE:**

**Title (H1):**
Use the PAA question as the title. Add location if it flows naturally.

**Opening Paragraph (Critical for SEO):**
- First sentence MUST directly answer the PAA question in a clear, concise way (the "featured snippet" answer)
- Second sentence should expand on that answer with 1-2 key details
- Third sentence should naturally mention ${params.businessName} and ${location}
- Keep opening paragraph to 80-100 words maximum
- Make it compelling and informative

**Body Content - Create 6-7 H2 Sections:**

Each H2 section should:
- Have an H2 heading that's either a question or compelling statement
- Contain 2-3 paragraphs (150-200 words per section)
- Include practical, actionable information
- Use conversational but professional language
- Incorporate local references naturally

**Required H2 Topics to Include:**
1. Overview/Basics section (explaining the fundamentals)
2. Cost/Pricing section (addressing "how much does it cost")
3. Process/Timeline section (explaining "how long does it take" or "what's the process")
4. Benefits/Advantages section
5. Common concerns/FAQs section
6. Local angle section ("Why Choose ${params.businessName} in ${location}")
7. Optional: Technical details or related services${params.hasAdas ? ' including ADAS calibration' : ''}

**INTERNAL LINKING REQUIREMENTS (CRITICAL):**
You MUST link to ${servicePageUrl} at least TWICE in the content using these guidelines:
- Use descriptive, keyword-rich anchor text like "professional windshield replacement services" or "expert auto glass repair"${params.hasAdas ? ' or "certified ADAS calibration services"' : ''}
- NEVER use generic anchor text like "click here" or "learn more" or "our services"
- Make links flow naturally within sentences
- Place links in different sections (not both in the same paragraph)
- Use HTML format: <a href="${servicePageUrl}">descriptive anchor text</a>

Example implementations:
- "When you need <a href="${servicePageUrl}">professional windshield replacement services</a>, it's essential to choose a certified installer."
- "Our <a href="${servicePageUrl}">expert auto glass repair</a> team uses only OEM-quality materials."

**Call to Action (Final Paragraph):**
Create a compelling final paragraph that:
- Creates urgency or emphasizes expertise
- Encourages immediate contact
- Includes phone number: ${params.phone}
- Mentions location: ${location}
- References the business name: ${params.businessName}
- Can optionally include another link to ${servicePageUrl}

**WRITING STYLE REQUIREMENTS:**
- Conversational yet professional tone
- Use "you" and "your" to address the reader directly
- Short paragraphs: 3-4 sentences maximum per paragraph
- Include relevant auto glass terminology naturally (${params.hasAdas ? 'ADAS, ' : ''}OEM, resin, chip, crack, etc.)
- Write at 8th-9th grade reading level
- Avoid marketing fluff - every sentence should provide value
- Target word count: 1000-1100 words

**SEO REQUIREMENTS:**
- Use the exact PAA question in the H1 title
- Include variations of the main keyword throughout naturally
- Incorporate local keywords: ${location} + auto glass, windshield repair, etc.
- Include the business name ${params.businessName} 3-4 times throughout
- Use natural language - avoid keyword stuffing

**FORMATTING REQUIREMENTS:**
- Use proper HTML: <h2> for sections, <p> for paragraphs, <a href=""> for links
- Use <strong> tags sparingly for emphasis
- NO bullet points unless absolutely necessary
- Write in full, flowing paragraphs

**QUALITY CHECKLIST:**
Before finishing, ensure:
- ✓ Opening paragraph directly answers PAA question in first sentence
- ✓ 6-7 comprehensive H2 sections included
- ✓ Service page linked AT LEAST TWICE with descriptive anchor text
- ✓ Business name, location, and phone number incorporated naturally
- ✓ Strong CTA at the end
- ✓ 1000-1100 word count achieved
- ✓ No marketing fluff or filler content

**CRITICAL OUTPUT FORMAT:**
Return a JSON object with these keys:
- title: The H1 title (PAA question, optionally with location)
- slug: URL-friendly slug
- content: The complete HTML blog post body (NO h1, NO doctype/html/head/body tags - just the article content starting with the opening paragraph)
- excerpt: 150-160 character summary for meta/previews
- metaTitle: 50-60 character meta title
- metaDescription: 150-160 character meta description
- focusKeyword: The primary keyword to target

Return ONLY valid JSON. Do not include any commentary outside the JSON.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
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

type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram'

interface SocialCaptionParams {
  platform: SocialPlatform
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
  // Special handling for GBP - uses specific prompt format
  if (params.platform === 'gbp') {
    const gbpPrompt = `Write a Google Business Profile post for this auto glass business.

**CRITICAL RULES:**
- Length: 100-300 characters TOTAL (STRICT - count carefully!)
- NO phone numbers (Google rejects posts with phone numbers)
- NO emojis
- NO hashtags in main text
- Professional, conversational tone
- Create curiosity to click the link

**Business Info:**
Business: ${params.businessName}
Location: ${params.blogExcerpt.includes(',') ? params.blogExcerpt.split(',')[0] : 'your area'}
Topic: ${params.blogTitle}

**Writing Guidelines:**
1. Start with attention-grabbing question or statement
2. Provide 1-2 key insights
3. Mention business name naturally
4. End with soft call-to-action
5. COUNT CHARACTERS - must be 100-300 total

**Example (185 characters):**
Wondering about windshield chip repair? Most chips under a quarter are fixable and cost less than replacement. Collision Auto Glass explains what Portland drivers need to know.

**Output Format:**
Return ONLY the post text. No quotes, no labels. Just the post content.

Write the post now.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: gbpPrompt }],
    })

    const caption = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    return {
      caption,
      hashtags: [], // GBP doesn't use hashtags
      firstComment: '', // GBP doesn't have comments
    }
  }

  // For other platforms, use the general prompt
  const platformGuidelines: Record<SocialPlatform, string> = {
    facebook: 'Longer, conversational, storytelling approach. 200-500 characters. Can include the blog link inline.',
    instagram: 'Shorter, emoji-friendly. 150-300 characters. Mention "link in bio" for the blog post.',
    linkedin: 'Professional, industry insights focused. 200-400 characters. Include the blog link inline.',
    twitter: 'Concise, punchy, engaging. Max 280 characters. Include link.',
    tiktok: 'Casual, trend-aligned, relatable. 100-200 characters. Mention link in bio.',
    gbp: 'Local business focused, professional. 100-300 characters. No phone numbers or emojis.',
    youtube: 'Video description style, detailed. 300-500 characters. SEO-optimized.',
    bluesky: 'Similar to Twitter - concise, authentic. Max 300 characters. Include link.',
    threads: 'Conversational, Instagram-adjacent style. 200-400 characters. Include link.',
    reddit: 'Community-focused, informative. 200-400 characters. Avoid promotional tone.',
    pinterest: 'Visual description, keyword-rich. 150-300 characters. Include the blog link.',
    telegram: 'Direct, informative. 200-400 characters. Include link.',
  }

  const prompt = `Generate a ${params.platform} post for an auto glass company.

Business: ${params.businessName}
Blog Title: "${params.blogTitle}"
Blog Summary: "${params.blogExcerpt}"
Blog URL: ${params.blogUrl}

Platform Guidelines: ${platformGuidelines[params.platform]}

Return JSON with:
- caption: The main post text (follow character guidelines above)
- hashtags: Array of 3-5 relevant hashtags (without #)
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

// WRHQ Directory Blog Post Generation
interface WRHQBlogPostParams {
  clientBlogTitle: string
  clientBlogUrl: string
  clientBlogExcerpt: string
  clientBusinessName: string
  clientCity: string
  clientState: string
  paaQuestion: string
}

interface WRHQBlogPostResult {
  title: string
  slug: string
  content: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  focusKeyword: string
}

export async function generateWRHQBlogPost(params: WRHQBlogPostParams): Promise<WRHQBlogPostResult> {
  const prompt = `You are creating a directory-style blog post for Windshield Repair HQ (WRHQ), an auto glass industry directory site.

This post should highlight and link to a client's detailed blog post.

Client Information:
- Business: ${params.clientBusinessName} in ${params.clientCity}, ${params.clientState}
- Their Blog Title: "${params.clientBlogTitle}"
- Their Blog URL: ${params.clientBlogUrl}
- Their Blog Summary: "${params.clientBlogExcerpt}"

Original Topic (PAA Question): "${params.paaQuestion}"

Requirements:
- 400-600 words (shorter than the client's post)
- Start with a directory-style introduction: "If you're looking for answers about [topic], ${params.clientBusinessName} in ${params.clientCity}, ${params.clientState} has put together a comprehensive guide..."
- Summarize 3-4 key points from the client's article
- Include a prominent link to the client's full article with CTA like "Read the full guide at ${params.clientBusinessName}"
- End with a section about WRHQ: "At Windshield Repair HQ, we connect car owners with trusted auto glass professionals across the country."
- Use H2/H3 headings
- Educational but clearly directing readers to the client's detailed content
- Do NOT duplicate the client's full content - this is a teaser/directory listing

Generate as semantic HTML (h2, h3, p, ul, li tags).
Also provide:
- Title: Include city name, e.g., "${params.clientCity} Auto Glass Expert Answers: [Topic]"
- URL slug
- Excerpt (150-160 characters)
- Meta title (50-60 characters)
- Meta description (150-160 characters)
- Focus keyword

Return as JSON with keys: title, slug, content, excerpt, metaTitle, metaDescription, focusKeyword`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse WRHQ blog post response')
  }

  return JSON.parse(jsonMatch[0])
}

// WRHQ Social Caption Generation
interface WRHQSocialCaptionParams {
  platform: SocialPlatform
  clientBusinessName: string
  clientCity: string
  clientState: string
  blogTitle: string
  blogExcerpt: string
  wrhqBlogUrl: string
  clientBlogUrl: string
}

export async function generateWRHQSocialCaption(params: WRHQSocialCaptionParams): Promise<{
  caption: string
  hashtags: string[]
  firstComment: string
}> {
  const platformGuidelines: Record<SocialPlatform, string> = {
    facebook: 'Longer, directory-style post featuring the client. Include both WRHQ and client links.',
    instagram: 'Engaging, community-focused. Feature the client as a trusted provider. Mention "link in bio".',
    linkedin: 'Professional industry directory angle. Position as connecting consumers with quality providers.',
    twitter: 'Concise spotlight on the client expert. Include WRHQ link.',
    tiktok: 'Casual, helpful content discovery angle. Mention link in bio.',
    gbp: 'Local business directory focus, highlight the featured provider in the area.',
    youtube: 'Video description featuring the expert provider. Include both WRHQ and client links.',
    bluesky: 'Authentic, concise spotlight on the featured expert. Include WRHQ link.',
    threads: 'Conversational directory post, feature the client business. Include WRHQ link.',
    reddit: 'Community-helpful, informative post. Avoid overly promotional tone.',
    pinterest: 'Visual, inspirational pin description featuring the expert. Include both links.',
    telegram: 'Direct, informative message about the featured provider. Include WRHQ link.',
  }

  const prompt = `Generate a ${params.platform} post for Windshield Repair HQ (WRHQ) - an auto glass industry directory.

This post features a member business:
- Business: ${params.clientBusinessName} in ${params.clientCity}, ${params.clientState}
- Topic: "${params.blogTitle}"
- Summary: "${params.blogExcerpt}"
- WRHQ Article URL: ${params.wrhqBlogUrl}
- Client's Full Article: ${params.clientBlogUrl}

Platform Guidelines: ${platformGuidelines[params.platform]}

Voice: WRHQ is a trusted directory connecting car owners with quality auto glass professionals.
Example angles:
- "Looking for expert auto glass advice? ${params.clientBusinessName} shares their expertise on..."
- "Our network of trusted professionals includes ${params.clientBusinessName}..."
- "Featured Expert: ${params.clientBusinessName} breaks down..."

Return JSON with:
- caption: The main post text (feature the client, WRHQ as the connector)
- hashtags: Array of relevant hashtags (autoglass, windshieldrepair, local city, etc.)
- firstComment: A follow-up comment with additional context or link`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse WRHQ social caption response')
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
