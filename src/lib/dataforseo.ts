/**
 * DataForSEO SERP API Integration
 *
 * Fetches "People Also Ask" questions from Google search results
 * for a given location to generate relevant content ideas.
 */

export interface PAASuggestion {
  question: string
  answer?: string
  source?: string
}

export interface DataForSEOResult {
  success: boolean
  paas: PAASuggestion[]
  cost?: number
  error?: string
}

interface PAAExpandedElement {
  type: string
  featured_title?: string
  url?: string
  domain?: string
  title?: string
  description?: string
}

interface PAAElement {
  type: string
  title?: string
  seed_question?: string | null
  expanded_element?: PAAExpandedElement[]
}

interface DataForSEOItem {
  type: string
  title?: string
  // For people_also_ask, questions are in items array
  items?: PAAElement[]
  expanded_element?: PAAExpandedElement[]
}

interface DataForSEOTask {
  result?: Array<{
    items?: DataForSEOItem[]
    cost?: number
  }>
}

interface DataForSEOResponse {
  tasks?: DataForSEOTask[]
  status_code?: number
  status_message?: string
}

/**
 * Fetch PAA questions from Google for auto glass searches in a specific location
 */
export async function fetchPAAsForLocation(
  city: string,
  state: string,
  options: {
    login: string
    password: string
    keywords?: string[]
  }
): Promise<DataForSEOResult> {
  const { login, password, keywords } = options

  // Default auto glass related keywords to search
  const searchKeywords = keywords || [
    'auto glass replacement',
    'windshield replacement',
    'windshield repair near me',
  ]

  const location = `${city}, ${state}`
  const allPAAs: PAASuggestion[] = []
  let totalCost = 0

  try {
    // Use broad, popular keywords that trigger PAAs
    // Don't include location - PAAs are usually location-agnostic
    const broadKeywords = [
      'windshield replacement',
      'auto glass repair',
      'windshield repair',
    ]

    // Use just one keyword to minimize cost (PAAs are similar across keywords)
    const keyword = broadKeywords[0]
    console.log('[DataForSEO] Searching for keyword:', keyword)

    // Single task with reduced depth to minimize cost
    const requestTasks = [{
      keyword,
      location_name: 'United States',
      language_name: 'English',
      device: 'desktop',
      os: 'windows',
      depth: 20, // PAAs usually appear in top 20 results
    }]

    const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestTasks),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        paas: [],
        error: `API request failed: ${response.status} - ${errorText}`,
      }
    }

    const data: DataForSEOResponse = await response.json()

    if (data.status_code !== 20000) {
      return {
        success: false,
        paas: [],
        error: data.status_message || 'Unknown API error',
      }
    }

    // Extract PAAs from results
    const responseTasks = data.tasks || []
    console.log('[DataForSEO] Tasks returned:', responseTasks.length)

    for (const task of responseTasks) {
      const results = task.result || []
      console.log('[DataForSEO] Results in task:', results.length)

      for (const result of results) {
        totalCost += result.cost || 0
        const items = result.items || []

        // Log all item types for debugging
        const itemTypes = items.map(i => i.type)
        console.log('[DataForSEO] Item types found:', [...new Set(itemTypes)])

        for (const item of items) {
          if (item.type === 'people_also_ask') {
            // PAA questions are in the nested items array
            const paaItems = item.items || []
            console.log('[DataForSEO] PAA block found with', paaItems.length, 'questions')

            for (const paaItem of paaItems) {
              if (paaItem.type === 'people_also_ask_element' && paaItem.title) {
                // Get answer from expanded_element if available
                const expanded = paaItem.expanded_element?.[0]
                allPAAs.push({
                  question: paaItem.title,
                  answer: expanded?.description,
                  source: expanded?.url,
                })
              }
            }
          }
        }
      }
    }

    // Deduplicate PAAs by question
    const uniquePAAs = Array.from(
      new Map(allPAAs.map(p => [p.question.toLowerCase(), p])).values()
    )
    console.log('[DataForSEO] Total PAAs found:', allPAAs.length, '| Unique:', uniquePAAs.length)

    return {
      success: true,
      paas: uniquePAAs,
      cost: totalCost,
    }
  } catch (error) {
    return {
      success: false,
      paas: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Convert a Google PAA question to a template with {location} placeholder
 * Strips out ANY location mentions (states, cities, etc.) and replaces with {location}
 */
export function formatPAAAsTemplate(question: string, city: string, state: string): string {
  let template = question

  // All US state names and abbreviations
  const states = [
    'Alabama', 'AL', 'Alaska', 'AK', 'Arizona', 'AZ', 'Arkansas', 'AR', 'California', 'CA',
    'Colorado', 'CO', 'Connecticut', 'CT', 'Delaware', 'DE', 'Florida', 'FL', 'Georgia', 'GA',
    'Hawaii', 'HI', 'Idaho', 'ID', 'Illinois', 'IL', 'Indiana', 'IN', 'Iowa', 'IA',
    'Kansas', 'KS', 'Kentucky', 'KY', 'Louisiana', 'LA', 'Maine', 'ME', 'Maryland', 'MD',
    'Massachusetts', 'MA', 'Michigan', 'MI', 'Minnesota', 'MN', 'Mississippi', 'MS', 'Missouri', 'MO',
    'Montana', 'MT', 'Nebraska', 'NE', 'Nevada', 'NV', 'New Hampshire', 'NH', 'New Jersey', 'NJ',
    'New Mexico', 'NM', 'New York', 'NY', 'North Carolina', 'NC', 'North Dakota', 'ND', 'Ohio', 'OH',
    'Oklahoma', 'OK', 'Oregon', 'OR', 'Pennsylvania', 'PA', 'Rhode Island', 'RI', 'South Carolina', 'SC',
    'South Dakota', 'SD', 'Tennessee', 'TN', 'Texas', 'TX', 'Utah', 'UT', 'Vermont', 'VT',
    'Virginia', 'VA', 'Washington', 'WA', 'West Virginia', 'WV', 'Wisconsin', 'WI', 'Wyoming', 'WY'
  ]

  // Replace the specific client city/state first
  const locationPatterns = [
    new RegExp(`\\b${city},?\\s*${state}\\b`, 'gi'),
    new RegExp(`\\b${city}\\s+${state}\\b`, 'gi'),
    new RegExp(`\\b${city}\\b`, 'gi'),
    new RegExp(`\\b${state}\\b`, 'gi'),
  ]

  for (const pattern of locationPatterns) {
    template = template.replace(pattern, '{location}')
  }

  // Replace any US state mentions (full names first, then abbreviations)
  for (const stateName of states) {
    // Only replace 2-letter abbreviations if they're standalone words
    if (stateName.length === 2) {
      template = template.replace(new RegExp(`\\b${stateName}\\b`, 'g'), '{location}')
    } else {
      template = template.replace(new RegExp(`\\b${stateName}\\b`, 'gi'), '{location}')
    }
  }

  // Replace common location phrases
  const genericPatterns = [
    /\bnear me\b/gi,
    /\bin my area\b/gi,
    /\blocal\b/gi,
    /\bnearby\b/gi,
    /\bin your area\b/gi,
    /\bin the area\b/gi,
  ]

  for (const pattern of genericPatterns) {
    template = template.replace(pattern, '{location}')
  }

  // Clean up multiple {location} placeholders and extra commas
  template = template.replace(/\{location\}(,?\s*\{location\})+/g, '{location}')
  template = template.replace(/,\s*\{location\}\s*,/g, ' {location}')
  template = template.replace(/\s+/g, ' ').trim()

  // If no location placeholder was added, append it intelligently
  if (!template.includes('{location}')) {
    if (template.endsWith('?')) {
      template = template.slice(0, -1) + ' in {location}?'
    } else {
      template = template + ' in {location}?'
    }
  }

  // Ensure it ends with a question mark
  if (!template.endsWith('?')) {
    template = template + '?'
  }

  return template
}
