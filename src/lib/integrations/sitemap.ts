// Sitemap fetching and parsing utility
import Anthropic from '@anthropic-ai/sdk'

interface SitemapUrl {
  loc: string
  lastmod?: string
  priority?: string
}

// Simple in-memory cache for sitemap results
// Key: websiteUrl, Value: { urls, timestamp }
const sitemapCache = new Map<string, { urls: SitemapUrl[]; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Cache for matched service pages
// Key: `${websiteUrl}:${topic}`, Value: { url, timestamp }
const matchCache = new Map<string, { url: string | null; timestamp: number }>()
const MATCH_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Fetch and parse a sitemap.xml file (with caching)
 */
export async function fetchSitemap(baseUrl: string): Promise<SitemapUrl[]> {
  // Normalize the base URL
  const normalizedUrl = baseUrl.replace(/\/$/, '')

  // Check cache first
  const cached = sitemapCache.get(normalizedUrl)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('Using cached sitemap data')
    return cached.urls
  }

  const sitemapUrl = `${normalizedUrl}/sitemap.xml`

  try {
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'AutoGlassPlatform/1.0 (Content Generation Bot)',
      },
    })

    if (!response.ok) {
      // Try common alternative locations
      const alternatives = [
        `${normalizedUrl}/sitemap_index.xml`,
        `${normalizedUrl}/wp-sitemap.xml`,
        `${normalizedUrl}/sitemap-index.xml`,
      ]

      for (const alt of alternatives) {
        try {
          const altResponse = await fetch(alt)
          if (altResponse.ok) {
            return parseSitemapXml(await altResponse.text(), normalizedUrl)
          }
        } catch {
          continue
        }
      }

      console.error(`Failed to fetch sitemap from ${sitemapUrl}: ${response.status}`)
      return []
    }

    const xml = await response.text()
    const urls = parseSitemapXml(xml, normalizedUrl)

    // Cache the results
    sitemapCache.set(normalizedUrl, { urls, timestamp: Date.now() })
    console.log(`Cached ${urls.length} URLs from sitemap`)

    return urls
  } catch (error) {
    console.error(`Error fetching sitemap from ${sitemapUrl}:`, error)
    return []
  }
}

/**
 * Parse sitemap XML content
 */
function parseSitemapXml(xml: string, baseUrl: string): SitemapUrl[] {
  const urls: SitemapUrl[] = []

  // Check if this is a sitemap index (contains other sitemaps)
  if (xml.includes('<sitemapindex')) {
    // Extract sitemap URLs and we'd need to fetch each one
    // For now, just extract the main sitemap URLs
    const sitemapMatches = xml.matchAll(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/g)
    for (const match of sitemapMatches) {
      // We could recursively fetch these, but for simplicity just note them
      console.log('Found sub-sitemap:', match[1])
    }
  }

  // Extract URLs from the sitemap
  const urlMatches = xml.matchAll(/<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/g)

  for (const match of urlMatches) {
    const loc = match[0]
    const url = match[1]

    // Extract optional lastmod and priority
    const lastmodMatch = loc.match(/<lastmod>(.*?)<\/lastmod>/)
    const priorityMatch = loc.match(/<priority>(.*?)<\/priority>/)

    urls.push({
      loc: url,
      lastmod: lastmodMatch?.[1],
      priority: priorityMatch?.[1],
    })
  }

  return urls
}

/**
 * Filter sitemap URLs to find likely service pages
 */
export function filterServicePages(urls: SitemapUrl[]): SitemapUrl[] {
  // Keywords that indicate a service page
  const serviceIndicators = [
    'service', 'windshield', 'auto-glass', 'autoglass', 'glass',
    'repair', 'replacement', 'adas', 'calibration', 'chip',
    'crack', 'window', 'rear', 'side', 'mobile', 'fleet',
  ]

  // Keywords that indicate NOT a service page
  const excludePatterns = [
    /\/blog\//i,
    /\/news\//i,
    /\/post\//i,
    /\/article\//i,
    /\/tag\//i,
    /\/category\//i,
    /\/author\//i,
    /\/page\/\d+/i,
    /\.(jpg|jpeg|png|gif|pdf|xml)$/i,
    /\/wp-content\//i,
    /\/feed\//i,
    /\/comments\//i,
    /\/privacy/i,
    /\/terms/i,
    /\/sitemap/i,
    /\/contact/i,  // Exclude contact pages
    /\/about/i,    // Exclude about pages
  ]

  return urls.filter(url => {
    const urlLower = url.loc.toLowerCase()

    // Exclude blog posts and other non-service pages
    if (excludePatterns.some(pattern => pattern.test(urlLower))) {
      return false
    }

    // Include pages that look like service pages
    return serviceIndicators.some(indicator => urlLower.includes(indicator))
  })
}

/**
 * Use Claude to find the most relevant service page for a given topic
 */
export async function findBestServicePage(params: {
  topic: string  // The PAA question or blog topic
  businessName: string
  servicePages: SitemapUrl[]
}): Promise<string | null> {
  if (params.servicePages.length === 0) {
    return null
  }

  // If only one service page, use it
  if (params.servicePages.length === 1) {
    return params.servicePages[0].loc
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const pageList = params.servicePages
    .slice(0, 20) // Limit to 20 pages to keep prompt size reasonable
    .map((p, i) => `${i + 1}. ${p.loc}`)
    .join('\n')

  const prompt = `You are helping match a blog post topic to the most relevant service page on an auto glass company's website.

**Blog Topic:** "${params.topic}"
**Business:** ${params.businessName}

**Available Service Pages:**
${pageList}

**Instructions:**
1. Analyze the blog topic to understand what service it relates to
2. Match it to the most relevant service page from the list
3. Consider:
   - Windshield replacement topics → windshield replacement pages
   - Chip/crack repair topics → repair pages
   - ADAS/calibration topics → ADAS calibration pages
   - Cost/price questions → the main service page being asked about
   - Location-specific questions → pages for that location if available

**Response Format:**
Return ONLY the full URL of the best matching page. No explanation, no quotes, just the URL.

If none of the pages are relevant, return: NONE`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',  // Use Haiku for speed and cost
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const result = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    if (result === 'NONE' || !result.startsWith('http')) {
      return null
    }

    return result
  } catch (error) {
    console.error('Error finding best service page:', error)
    return params.servicePages[0]?.loc || null  // Fall back to first page
  }
}

/**
 * Main function to scan a website and find the best service page for a topic
 */
export async function scanAndMatchServicePage(params: {
  websiteUrl: string
  topic: string
  businessName: string
}): Promise<{ url: string | null; allServicePages: SitemapUrl[] }> {
  const normalizedUrl = params.websiteUrl.replace(/\/$/, '')
  const cacheKey = `${normalizedUrl}:${params.topic.toLowerCase().slice(0, 100)}`

  // Check match cache first
  const cachedMatch = matchCache.get(cacheKey)
  if (cachedMatch && Date.now() - cachedMatch.timestamp < MATCH_CACHE_TTL) {
    console.log('Using cached service page match')
    return { url: cachedMatch.url, allServicePages: [] }
  }

  // Fetch the sitemap
  const allUrls = await fetchSitemap(params.websiteUrl)

  if (allUrls.length === 0) {
    console.log('No URLs found in sitemap')
    return { url: null, allServicePages: [] }
  }

  console.log(`Found ${allUrls.length} URLs in sitemap`)

  // Filter to service pages
  const servicePages = filterServicePages(allUrls)
  console.log(`Found ${servicePages.length} potential service pages`)

  if (servicePages.length === 0) {
    // Fall back to any non-blog page
    const nonBlogPages = allUrls.filter(u =>
      !u.loc.toLowerCase().includes('/blog/') &&
      !u.loc.toLowerCase().includes('/post/')
    )
    if (nonBlogPages.length > 0) {
      return {
        url: nonBlogPages[0].loc,
        allServicePages: nonBlogPages.slice(0, 10)
      }
    }
    return { url: null, allServicePages: [] }
  }

  // Use Claude to find the best match
  const bestMatch = await findBestServicePage({
    topic: params.topic,
    businessName: params.businessName,
    servicePages,
  })

  // Cache the match result
  matchCache.set(cacheKey, { url: bestMatch, timestamp: Date.now() })
  console.log(`Cached service page match: ${bestMatch || 'none'}`)

  return { url: bestMatch, allServicePages: servicePages }
}
