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
  status_code?: number
  status_message?: string
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

// Map state abbreviations to full names for DataForSEO
const stateAbbreviations: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

/**
 * Fetch PAA questions from Google for auto glass searches in a specific location
 * Optionally searches additional service areas for more variety
 */
export async function fetchPAAsForLocation(
  city: string,
  state: string,
  options: {
    login: string
    password: string
    keywords?: string[]
    serviceAreas?: string[] // Additional cities to search (e.g., ["Beaverton", "Gresham"])
  }
): Promise<DataForSEOResult> {
  const { login, password, serviceAreas } = options

  const allPAAs: PAASuggestion[] = []
  let totalCost = 0

  try {
    // Search multiple keywords to get more PAA variety
    const searchKeywords = ['auto glass repair', 'windshield replacement']

    // Convert state abbreviation to full name if needed
    const fullStateName = stateAbbreviations[state.toUpperCase()] || state

    // Build list of locations to search: main city + up to 2 service areas
    const locations: string[] = [`${city},${fullStateName},United States`]

    // Add service areas (limit to 2 to control costs)
    if (serviceAreas && serviceAreas.length > 0) {
      const additionalLocations = serviceAreas
        .slice(0, 2) // Max 2 additional locations
        .map(area => `${area},${fullStateName},United States`)
      locations.push(...additionalLocations)
    }

    console.log('[DataForSEO] Searching for:', searchKeywords.join(', '), 'in locations:', locations)

    // Create a task for each keyword + location combination
    const requestTasks: Array<{
      keyword: string
      location_name: string
      language_name: string
      device: string
      os: string
      depth: number
    }> = []

    for (const locationName of locations) {
      for (const keyword of searchKeywords) {
        requestTasks.push({
          keyword,
          location_name: locationName,
          language_name: 'English',
          device: 'desktop',
          os: 'windows',
          depth: 10, // PAAs usually appear in top 10 results
        })
      }
    }

    console.log('[DataForSEO] Total tasks:', requestTasks.length, '(2 keywords ×', locations.length, 'locations)')
    console.log('[DataForSEO] Request tasks being sent:', JSON.stringify(requestTasks.map(t => ({ keyword: t.keyword, location: t.location_name }))))

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
    console.log('[DataForSEO] Response status_code:', data.status_code, 'message:', data.status_message)
    console.log('[DataForSEO] Raw response structure:', JSON.stringify({
      tasks_count: data.tasks?.length,
      first_task_results: data.tasks?.[0]?.result?.length,
      first_result_items: data.tasks?.[0]?.result?.[0]?.items?.length,
      item_types: data.tasks?.[0]?.result?.[0]?.items?.map(i => i.type),
    }))

    if (data.status_code !== 20000) {
      console.log('[DataForSEO] Full error response:', JSON.stringify(data, null, 2))
      return {
        success: false,
        paas: [],
        error: data.status_message || 'Unknown API error',
      }
    }

    // Extract PAAs from results
    const responseTasks = data.tasks || []
    console.log('[DataForSEO] Tasks returned:', responseTasks.length)

    // Log task-level status for debugging
    for (const task of responseTasks) {
      console.log('[DataForSEO] Task status:', task.status_code, task.status_message)
    }

    for (const task of responseTasks) {
      const results = task.result || []
      console.log('[DataForSEO] Results in task:', results.length)

      for (const result of results) {
        totalCost += result.cost || 0
        const items = result.items || []

        // Log all item types for debugging
        const itemTypes = items.map(i => i.type)
        console.log('[DataForSEO] Item types found:', [...new Set(itemTypes)])
        console.log('[DataForSEO] Total items to scan:', items.length)

        for (const item of items) {
          // Log each item's type for debugging
          if (item.type === 'people_also_ask') {
            console.log('[DataForSEO] Found people_also_ask item:', JSON.stringify(item, null, 2).slice(0, 500))
            // PAA questions are in the nested items array
            const paaItems = item.items || []
            console.log('[DataForSEO] PAA block found with', paaItems.length, 'questions')

            for (const paaItem of paaItems) {
              console.log('[DataForSEO] PAA element:', paaItem.type, '| title:', paaItem.title)
              if (paaItem.type === 'people_also_ask_element' && paaItem.title) {
                // Get answer from expanded_element if available
                const expanded = paaItem.expanded_element?.[0]
                allPAAs.push({
                  question: paaItem.title,
                  answer: expanded?.description,
                  source: expanded?.url,
                })
                console.log('[DataForSEO] Added PAA:', paaItem.title)
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
