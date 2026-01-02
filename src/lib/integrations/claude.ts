import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

  const result = JSON.parse(jsonMatch[0]) as BlogPostResult
  // Apply Title Case to the title
  result.title = toTitleCase(result.title)
  return result
}

type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'twitter' | 'tiktok' | 'gbp' | 'youtube' | 'bluesky' | 'threads' | 'reddit' | 'pinterest' | 'telegram'

interface SocialCaptionParams {
  platform: SocialPlatform
  blogTitle: string
  blogExcerpt: string
  businessName: string
  blogUrl: string
  location?: string  // City, State format for GBP
  googleMapsUrl?: string  // Google Maps profile URL for GBP
}

export async function generateSocialCaption(params: SocialCaptionParams): Promise<{
  caption: string
  hashtags: string[]
  firstComment: string
}> {
  // Special handling for GBP - uses specific prompt format
  if (params.platform === 'gbp') {
    const mapsLink = params.googleMapsUrl || ''
    const gbpPrompt = `Write a Google Business Profile post for this auto glass business.

**CRITICAL RULES:**
- Length: 150-400 characters TOTAL (STRICT - count carefully!)
- NO phone numbers (Google rejects posts with phone numbers)
- Emojis are allowed and encouraged (1-3 relevant emojis)
- NO hashtags in main text
- Professional, conversational tone
- MUST include the Google Maps link at the end

**Business Info:**
Business: ${params.businessName}
Location: ${params.location || 'your area'}
Topic: ${params.blogTitle}
Google Maps Link: ${mapsLink}

**Writing Guidelines:**
1. Start with attention-grabbing question or statement
2. Use 1-3 relevant emojis naturally in the text
3. Provide 1-2 key insights about the topic
4. Mention business name naturally
5. End with the Google Maps link on its own line

**Example:**
🚗 Wondering about windshield chip repair? Most chips under a quarter are fixable and cost less than replacement. Visit Collision Auto Glass in Portland to learn more!

${mapsLink ? mapsLink : 'https://maps.google.com/...'}

**Output Format:**
Return ONLY the post text with the link. No quotes, no labels. Just the post content.

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
  wrhqDirectoryUrl: string
  googleMapsUrl: string
  phone: string
  featuredImageUrl?: string
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
  const location = `${params.clientCity}, ${params.clientState}`

  // Use a placeholder for the image - we'll replace it after generation
  // This avoids including massive base64 data URLs in the prompt
  const hasImage = !!params.featuredImageUrl
  const imagePlaceholder = '{{FEATURED_IMAGE}}'

  const prompt = `Write a blog post for WindshieldRepairHQ.com (an auto glass industry directory) about this topic.

**CONTENT DETAILS:**
- PAA Question (Use as Title): ${params.paaQuestion}
- Business Name: ${params.clientBusinessName}
- Location: ${location}
- Client Blog Post URL: ${params.clientBlogUrl}
- WRHQ Directory Listing URL: ${params.wrhqDirectoryUrl}
- Google Maps URL: ${params.googleMapsUrl}
- Phone Number: ${params.phone}

${hasImage ? `**IMAGE TO INSERT:**
A featured image will be added to the blog post. Insert the placeholder ${imagePlaceholder} IMMEDIATELY after the opening paragraph. This placeholder will be replaced with the actual image.

**CRITICAL:** You MUST include ${imagePlaceholder} exactly as written (on its own line) after the first paragraph.` : ''}

**PURPOSE:**
This post lives on WindshieldRepairHQ.com and should:
- Provide helpful, general information answering the PAA question
- Drive traffic to the featured shop's full blog post
- Promote the shop's WRHQ directory listing
- Be valuable to readers searching for auto glass information

**FORMAT REQUIREMENTS:**
- Output in clean HTML with <p> and <h2> tags
- 400-500 words total (shorter than the main blog post)
- Professional, helpful, third-party tone (you're the directory, not the shop)
- Include all 3 links naturally within the content

**STRUCTURE:**

Opening Paragraph:
- Directly answer the PAA question in 2-3 sentences
- Mention this is a common question auto glass customers ask
- Tease that a local expert has written a comprehensive guide
${hasImage ? `\n${imagePlaceholder}` : ''}

H2: What You Need to Know About [Topic from PAA]
- 2 paragraphs covering the key points
- General, helpful information
- Educational tone

H2: Expert Insights from ${params.clientBusinessName}
- Introduce the business as a featured shop on WindshieldRepairHQ.com
- Link to their FULL BLOG POST: ${params.clientBlogUrl} with anchor text like "comprehensive guide" or "in-depth article"
- Mention 1-2 key takeaways from their expertise
- Link to their WRHQ DIRECTORY LISTING: ${params.wrhqDirectoryUrl} with anchor text like "view their full profile" or "see customer reviews"

H2: Find ${params.clientBusinessName} in ${location}
- Brief description of services offered
- Link to GOOGLE MAPS: ${params.googleMapsUrl} with anchor text like "get directions" or "view location"
- Mention service area

Closing Paragraph:
- Encourage readers to read the full guide (link to client blog post again)
- Mention WindshieldRepairHQ.com helps connect customers with trusted local shops
- Soft CTA to explore more shops in the directory

**LINK PLACEMENT (CRITICAL):**
1. Client blog post (${params.clientBlogUrl}) - link at least TWICE with descriptive anchor text
2. WRHQ directory listing (${params.wrhqDirectoryUrl}) - link ONCE
3. Google Maps (${params.googleMapsUrl}) - link ONCE

**TONE:**
- Third-party/editorial (WindshieldRepairHQ featuring a shop, not the shop talking about itself)
- Helpful and informative
- Professional but approachable
- Position the featured shop as a trusted local expert

**DO NOT INCLUDE:**
- Phone numbers in the body text
- Pricing claims or guarantees
- First-person language ("we" or "our") referring to the shop
- H1 tag (WordPress handles the title)

**OUTPUT FORMAT:**
Return as JSON with these keys:
- title: The PAA question as the title
- slug: URL-friendly slug
- content: The complete HTML blog post body (starting with first <p> tag)
- excerpt: 150-160 character summary
- metaTitle: 50-60 character meta title
- metaDescription: 150-160 character meta description
- focusKeyword: Primary keyword to target

Return ONLY valid JSON. No markdown code blocks.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse WRHQ blog post response')
  }

  const result = JSON.parse(jsonMatch[0]) as WRHQBlogPostResult
  // Apply Title Case to the title
  result.title = toTitleCase(result.title)

  // Replace the image placeholder with actual image HTML if we have an image
  if (hasImage && params.featuredImageUrl) {
    const imageHtml = `<img src="${params.featuredImageUrl}" alt="${params.paaQuestion} | ${params.clientBusinessName} in ${location}" style="width:100%; max-width:1200px; height:auto; margin:30px auto; display:block; border-radius:8px;" loading="lazy"/>`
    result.content = result.content.replace(imagePlaceholder, imageHtml)
  }

  return result
}

// WRHQ Social Caption Generation
interface WRHQSocialCaptionParams {
  platform: SocialPlatform
  clientBusinessName: string
  clientCity: string
  clientState: string
  paaQuestion: string
  wrhqBlogUrl?: string
  clientBlogUrl?: string
  wrhqDirectoryUrl?: string
  googleMapsUrl?: string
  clientWebsite?: string
}

export async function generateWRHQSocialCaption(params: WRHQSocialCaptionParams): Promise<{
  caption: string
  hashtags: string[]
  firstComment: string
}> {
  const location = `${params.clientCity}, ${params.clientState}`

  const prompt = `Create a social media post for Windshield Repair HQ featuring content from one of our directory partners.

**TOPIC:** ${params.paaQuestion}

**FEATURED BUSINESS:**
- Business Name: ${params.clientBusinessName}
- Location: ${location}

**CONTENT AVAILABLE:**
- Blog Post: ${params.clientBlogUrl || 'Available'}
- WRHQ Directory Article: ${params.wrhqBlogUrl || 'Available'}
- Google Maps: ${params.googleMapsUrl || 'Available'}
- Website: ${params.clientWebsite || 'Available'}

**REQUIREMENTS:**
- 250-350 characters
- Position WRHQ as featuring/spotlighting this trusted shop
- Mention the business name and location
- Highlight that viewers can read to learn about this topic
- Professional, helpful tone
- NO emojis
- End with a question to drive engagement

OUTPUT ONLY THE POST TEXT. NO QUOTES. NO LABELS. NO EXPLANATION.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  const caption = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  // Generate hashtags based on platform
  const hashtags = ['AutoGlass', 'WindshieldRepair', params.clientCity.replace(/\s+/g, ''), 'WRHQ', 'AutoGlassExperts']

  return {
    caption,
    hashtags,
    firstComment: params.clientBlogUrl
      ? `Read the full article: ${params.clientBlogUrl}`
      : `Read the full article on WindshieldRepairHQ.com`,
  }
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

/**
 * Generate a podcast episode description in HTML format
 */
export async function generatePodcastDescription(params: {
  businessName: string
  city: string
  state: string
  paaQuestion: string
  blogPostUrl: string
  servicePageUrl: string
  googleMapsUrl?: string
}): Promise<string> {
  const location = `${params.city}, ${params.state}`

  const prompt = `Write a podcast episode description for this auto glass topic.

**Business Details:**
- Business Name: ${params.businessName}
- Location: ${location}
- PAA Question: ${params.paaQuestion}
- Blog Post URL: ${params.blogPostUrl}
- Service Page URL: ${params.servicePageUrl}
${params.googleMapsUrl ? `- Google Maps: ${params.googleMapsUrl}` : ''}

**FORMAT REQUIREMENTS:**
- Output in HTML with <p> tags
- 4-5 paragraphs total
- Include hyperlinks (blog post, service page${params.googleMapsUrl ? ', Google Maps' : ''})
- End with call-to-action and hashtags
- Use <strong> tags for emphasis (sparingly - max 4-5 uses)
- Professional, engaging tone

**CRITICAL FORMATTING RULES (to avoid firewall blocks):**
- Use regular hyphens (-) NEVER em-dashes (—)
- NO emojis anywhere in the description
- Avoid overusing the word "insurance" - maximum 3 times total
- Avoid trigger phrases: "zero-cost", "zero-deductible", "claims approved", "handle claims directly", "file a claim"
- Use softer alternatives: "coverage options" instead of "insurance claims", "may be covered" instead of "fully covered"
- Keep financial language minimal and natural

**STRUCTURE:**

Paragraph 1: Hook with the PAA question
- Start with "In this episode, we answer the question:"
- Bold the PAA question with <strong> tags
- Give a brief teaser answer
- Keep it conversational and inviting

Paragraph 2: Business introduction with blog link
- "Join the experts from [Business Name with link to BLOG POST] in ${location}..."
- Explain what listeners will learn (2-3 key points)
- Make it educational and valuable

Paragraph 3: Expand on benefits
- What specific insights or tips are covered
- Why this matters to the listener
- Keep it conversational

Paragraph 4: Business description with service page link
- Link business name to SERVICE PAGE
- List main services in bold: windshield replacement, windshield repair, ADAS calibration, mobile service
- Mention service area
${params.googleMapsUrl ? '- Include Google Maps link with text "Find them on Google Maps"' : ''}

Paragraph 5: Call-to-action
- Start with "Listen now to learn..." (NO emoji before this)
- Make it compelling
- End with encouragement to take action

Final line: Hashtags
- Include: #AutoGlass #WindshieldRepair #${params.city.replace(/\s+/g, '')}${params.state} #WindshieldReplacement #${params.businessName.replace(/\s+/g, '')} #CarCare
- Format as a <p> tag

**OUTPUT:**
Return ONLY the HTML description. No markdown, no code blocks, no explanation. Just the raw HTML.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const result = response.content[0].type === 'text' ? response.content[0].text : ''

  // Clean up any markdown code blocks if present
  return result
    .replace(/```html\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
}
