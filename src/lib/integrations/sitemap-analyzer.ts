// Sitemap Analyzer for Intelligent Internal Linking
// Fetches and analyzes client sitemaps to find relevant pages for internal links

interface SitemapEntry {
  url: string
  lastmod?: string
  priority?: number
  changefreq?: string
}

interface PageInfo {
  url: string
  slug: string
  title: string
  path: string
  keywords: string[]
  lastmod?: string
}

interface LinkSuggestion {
  url: string
  title: string
  relevanceScore: number
  matchedKeywords: string[]
}

/**
 * Fetch and parse a sitemap from URL
 */
export async function fetchSitemap(sitemapUrl: string): Promise<SitemapEntry[]> {
  const response = await fetch(sitemapUrl, {
    headers: {
      'User-Agent': 'WRHQ-Content-Bot/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`)
  }

  const xmlText = await response.text()

  // Parse XML sitemap
  const entries: SitemapEntry[] = []

  // Check if this is a sitemap index
  if (xmlText.includes('<sitemapindex')) {
    // Parse sitemap index and fetch all referenced sitemaps
    const sitemapUrls = extractUrls(xmlText, 'sitemap')

    for (const url of sitemapUrls) {
      try {
        const childEntries = await fetchSitemap(url)
        entries.push(...childEntries)
      } catch (error) {
        console.warn(`Failed to fetch child sitemap ${url}:`, error)
      }
    }
  } else {
    // Parse regular sitemap
    const urlMatches = xmlText.matchAll(/<url>([\s\S]*?)<\/url>/g)

    for (const match of urlMatches) {
      const urlBlock = match[1]

      const locMatch = urlBlock.match(/<loc>(.*?)<\/loc>/)
      if (!locMatch) continue

      const entry: SitemapEntry = {
        url: decodeHtmlEntities(locMatch[1].trim()),
      }

      const lastmodMatch = urlBlock.match(/<lastmod>(.*?)<\/lastmod>/)
      if (lastmodMatch) {
        entry.lastmod = lastmodMatch[1].trim()
      }

      const priorityMatch = urlBlock.match(/<priority>(.*?)<\/priority>/)
      if (priorityMatch) {
        entry.priority = parseFloat(priorityMatch[1])
      }

      const changefreqMatch = urlBlock.match(/<changefreq>(.*?)<\/changefreq>/)
      if (changefreqMatch) {
        entry.changefreq = changefreqMatch[1].trim()
      }

      entries.push(entry)
    }
  }

  return entries
}

/**
 * Extract URLs from sitemap index
 */
function extractUrls(xml: string, tagName: string): string[] {
  const urls: string[] = []
  const regex = new RegExp(`<${tagName}>[\\s\\S]*?<loc>(.*?)<\\/loc>[\\s\\S]*?<\\/${tagName}>`, 'g')

  let match
  while ((match = regex.exec(xml)) !== null) {
    urls.push(decodeHtmlEntities(match[1].trim()))
  }

  return urls
}

/**
 * Decode HTML entities in URLs
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Extract page info from sitemap entries
 */
export function extractPageInfo(entries: SitemapEntry[]): PageInfo[] {
  return entries
    .filter(entry => {
      // Filter out non-page URLs (images, feeds, etc.)
      const url = entry.url.toLowerCase()
      return !url.match(/\.(jpg|jpeg|png|gif|pdf|xml|rss|atom|json)$/i)
    })
    .map(entry => {
      const url = new URL(entry.url)
      const path = url.pathname
      const slug = path.split('/').filter(Boolean).pop() || ''

      // Extract title from slug
      const title = slugToTitle(slug)

      // Extract keywords from path and slug
      const keywords = extractKeywords(path)

      return {
        url: entry.url,
        slug,
        title,
        path,
        keywords,
        lastmod: entry.lastmod,
      }
    })
}

/**
 * Convert slug to title
 */
function slugToTitle(slug: string): string {
  if (!slug) return 'Home'

  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Extract keywords from URL path
 */
function extractKeywords(path: string): string[] {
  const segments = path
    .split('/')
    .filter(Boolean)
    .flatMap(segment => segment.split('-'))
    .filter(word => word.length > 2)
    .map(word => word.toLowerCase())

  // Remove common stop words
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
    'can', 'her', 'was', 'one', 'our', 'out', 'has', 'have',
    'with', 'this', 'that', 'from', 'they', 'been', 'have',
    'page', 'post', 'article', 'blog', 'news',
  ])

  return [...new Set(segments.filter(word => !stopWords.has(word)))]
}

/**
 * Find relevant pages for internal linking based on content keywords
 */
export function findRelevantPages(
  pages: PageInfo[],
  contentKeywords: string[],
  excludeUrls: string[] = [],
  maxSuggestions: number = 5
): LinkSuggestion[] {
  const normalizedKeywords = contentKeywords.map(k => k.toLowerCase())
  const excludeSet = new Set(excludeUrls.map(u => u.toLowerCase()))

  const suggestions: LinkSuggestion[] = pages
    .filter(page => !excludeSet.has(page.url.toLowerCase()))
    .map(page => {
      const matchedKeywords: string[] = []
      let relevanceScore = 0

      // Check for keyword matches
      for (const keyword of normalizedKeywords) {
        // Exact match in page keywords
        if (page.keywords.includes(keyword)) {
          matchedKeywords.push(keyword)
          relevanceScore += 10
        }
        // Partial match in keywords
        else if (page.keywords.some(pk => pk.includes(keyword) || keyword.includes(pk))) {
          matchedKeywords.push(keyword)
          relevanceScore += 5
        }
        // Match in title
        else if (page.title.toLowerCase().includes(keyword)) {
          matchedKeywords.push(keyword)
          relevanceScore += 3
        }
        // Match in URL path
        else if (page.path.toLowerCase().includes(keyword)) {
          matchedKeywords.push(keyword)
          relevanceScore += 2
        }
      }

      return {
        url: page.url,
        title: page.title,
        relevanceScore,
        matchedKeywords: [...new Set(matchedKeywords)],
      }
    })
    .filter(s => s.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxSuggestions)

  return suggestions
}

/**
 * Extract keywords from blog content for linking
 */
export function extractContentKeywords(content: string): string[] {
  // Common auto glass keywords to look for
  const glassKeywords = [
    'windshield', 'auto glass', 'car glass', 'window', 'repair', 'replacement',
    'chip', 'crack', 'adas', 'calibration', 'tint', 'tinting', 'sunroof',
    'moonroof', 'safety', 'insurance', 'quote', 'cost', 'price', 'service',
    'mobile', 'same day', 'oem', 'aftermarket', 'warranty', 'certified',
  ]

  const contentLower = content.toLowerCase()
  const foundKeywords: string[] = []

  for (const keyword of glassKeywords) {
    if (contentLower.includes(keyword)) {
      foundKeywords.push(keyword)
    }
  }

  // Also extract location mentions (cities, states)
  const locationPattern = /(?:in|near|around|serving)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/g
  let match
  while ((match = locationPattern.exec(content)) !== null) {
    foundKeywords.push(match[1].toLowerCase())
  }

  return [...new Set(foundKeywords)]
}

/**
 * Generate internal link HTML from suggestions
 */
export function generateInternalLinks(
  suggestions: LinkSuggestion[],
  format: 'html' | 'markdown' = 'html'
): string[] {
  return suggestions.map(s => {
    if (format === 'markdown') {
      return `[${s.title}](${s.url})`
    }
    return `<a href="${s.url}">${s.title}</a>`
  })
}

/**
 * Inject internal links into blog content
 * Finds natural insertion points and adds relevant links
 */
export function injectInternalLinks(
  content: string,
  suggestions: LinkSuggestion[],
  maxLinks: number = 3
): string {
  if (suggestions.length === 0) return content

  let modifiedContent = content
  let linksAdded = 0

  for (const suggestion of suggestions) {
    if (linksAdded >= maxLinks) break

    // Find a keyword that matches and isn't already linked
    for (const keyword of suggestion.matchedKeywords) {
      // Create regex to find the keyword (not already in a link)
      const regex = new RegExp(
        `(?<!<a[^>]*>)\\b(${escapeRegex(keyword)})\\b(?![^<]*<\\/a>)`,
        'i'
      )

      if (regex.test(modifiedContent)) {
        // Replace first occurrence with a link
        modifiedContent = modifiedContent.replace(regex, (match) => {
          linksAdded++
          return `<a href="${suggestion.url}" title="${suggestion.title}">${match}</a>`
        })
        break
      }
    }
  }

  return modifiedContent
}

/**
 * Escape regex special characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * High-level function to analyze sitemap and cache results
 */
export interface SitemapAnalysis {
  pages: PageInfo[]
  totalPages: number
  lastAnalyzed: Date
  byCategory: Record<string, number>
}

export async function analyzeSitemap(sitemapUrl: string): Promise<SitemapAnalysis> {
  const entries = await fetchSitemap(sitemapUrl)
  const pages = extractPageInfo(entries)

  // Categorize pages
  const byCategory: Record<string, number> = {}

  for (const page of pages) {
    const firstSegment = page.path.split('/').filter(Boolean)[0] || 'root'
    byCategory[firstSegment] = (byCategory[firstSegment] || 0) + 1
  }

  return {
    pages,
    totalPages: pages.length,
    lastAnalyzed: new Date(),
    byCategory,
  }
}

/**
 * Get link suggestions for a content item
 */
export interface GetLinkSuggestionsParams {
  sitemapUrl: string
  blogContent: string
  currentUrl?: string
  maxSuggestions?: number
}

export async function getLinkSuggestions(
  params: GetLinkSuggestionsParams
): Promise<LinkSuggestion[]> {
  const { pages } = await analyzeSitemap(params.sitemapUrl)

  const contentKeywords = extractContentKeywords(params.blogContent)

  const excludeUrls = params.currentUrl ? [params.currentUrl] : []

  return findRelevantPages(
    pages,
    contentKeywords,
    excludeUrls,
    params.maxSuggestions || 5
  )
}
