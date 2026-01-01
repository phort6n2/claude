// WordPress REST API Integration

import { decrypt } from '../encryption'

interface WordPressCredentials {
  url: string
  username: string
  password: string // Encrypted
}

interface WordPressPost {
  id: number
  link: string
  slug: string
}

interface CreatePostParams {
  title: string
  slug: string
  content: string
  excerpt?: string
  status?: 'draft' | 'publish' | 'pending'
  featuredMediaId?: number
  categories?: number[]
  tags?: number[]
  meta?: Record<string, string>
}

function getAuthHeader(username: string, encryptedPassword: string): string {
  const password = decrypt(encryptedPassword)
  const credentials = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${credentials}`
}

export async function testConnection(credentials: WordPressCredentials): Promise<boolean> {
  try {
    const authHeader = getAuthHeader(credentials.username, credentials.password)
    const response = await fetch(`${credentials.url}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': authHeader,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

export async function createPost(
  credentials: WordPressCredentials,
  params: CreatePostParams
): Promise<WordPressPost> {
  const authHeader = getAuthHeader(credentials.username, credentials.password)

  const response = await fetch(`${credentials.url}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: params.title,
      slug: params.slug,
      content: params.content,
      excerpt: params.excerpt,
      status: params.status || 'publish',
      featured_media: params.featuredMediaId,
      categories: params.categories,
      tags: params.tags,
      meta: params.meta,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WordPress API error: ${error}`)
  }

  const data = await response.json()

  return {
    id: data.id,
    link: data.link,
    slug: data.slug,
  }
}

export async function updatePost(
  credentials: WordPressCredentials,
  postId: number,
  params: Partial<CreatePostParams>
): Promise<WordPressPost> {
  const authHeader = getAuthHeader(credentials.username, credentials.password)

  const response = await fetch(`${credentials.url}/wp-json/wp/v2/posts/${postId}`, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: params.title,
      content: params.content,
      excerpt: params.excerpt,
      status: params.status,
      featured_media: params.featuredMediaId,
      meta: params.meta,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WordPress API error: ${error}`)
  }

  const data = await response.json()

  return {
    id: data.id,
    link: data.link,
    slug: data.slug,
  }
}

export async function uploadMedia(
  credentials: WordPressCredentials,
  imageUrl: string,
  filename: string,
  altText?: string
): Promise<{ id: number; url: string }> {
  const authHeader = getAuthHeader(credentials.username, credentials.password)

  // Fetch the image
  const imageResponse = await fetch(imageUrl)
  const imageBuffer = await imageResponse.arrayBuffer()
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

  const response = await fetch(`${credentials.url}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: imageBuffer,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WordPress API error: ${error}`)
  }

  const data = await response.json()

  // Update alt text if provided
  if (altText) {
    await fetch(`${credentials.url}/wp-json/wp/v2/media/${data.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alt_text: altText }),
    })
  }

  return {
    id: data.id,
    url: data.source_url,
  }
}

export async function getPages(credentials: WordPressCredentials): Promise<Array<{
  id: number
  title: string
  slug: string
  link: string
}>> {
  const authHeader = getAuthHeader(credentials.username, credentials.password)

  const response = await fetch(`${credentials.url}/wp-json/wp/v2/pages?per_page=100`, {
    headers: {
      'Authorization': authHeader,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WordPress API error: ${error}`)
  }

  const data = await response.json()

  return data.map((page: { id: number; title: { rendered: string }; slug: string; link: string }) => ({
    id: page.id,
    title: page.title.rendered,
    slug: page.slug,
    link: page.link,
  }))
}

/**
 * Get category ID by slug, or create it if it doesn't exist
 */
export async function getCategoryBySlug(
  credentials: WordPressCredentials,
  slug: string,
  name?: string
): Promise<number | null> {
  const authHeader = getAuthHeader(credentials.username, credentials.password)

  // Try to find existing category
  const response = await fetch(
    `${credentials.url}/wp-json/wp/v2/categories?slug=${encodeURIComponent(slug)}`,
    {
      headers: {
        'Authorization': authHeader,
      },
    }
  )

  if (response.ok) {
    const categories = await response.json()
    if (categories.length > 0) {
      return categories[0].id
    }
  }

  // Category doesn't exist, try to create it
  if (name) {
    const createResponse = await fetch(`${credentials.url}/wp-json/wp/v2/categories`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        slug,
      }),
    })

    if (createResponse.ok) {
      const newCategory = await createResponse.json()
      return newCategory.id
    }
  }

  return null
}

export async function injectSchemaMarkup(
  credentials: WordPressCredentials,
  postId: number,
  schemaJson: string
): Promise<void> {
  const authHeader = getAuthHeader(credentials.username, credentials.password)

  // Try to update via custom field first
  await fetch(`${credentials.url}/wp-json/wp/v2/posts/${postId}`, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meta: {
        _schema_json: schemaJson,
      },
    }),
  })
}

/**
 * High-level publish function used by content pipeline
 */
export interface PublishToWordPressParams {
  client: {
    wordpressUrl: string | null
    wordpressUsername: string | null
    wordpressAppPassword: string | null
  }
  title: string
  content: string
  excerpt?: string
  slug: string
  scheduledDate: Date
  featuredImageUrl?: string
  metaTitle?: string
  metaDescription?: string
  schemaJson?: string
  categorySlug?: string  // Optional category slug (e.g., 'auto-glass-repair')
  categoryName?: string  // Display name if category needs to be created
}

export interface PublishResult {
  postId: number
  url: string
  featuredImageId?: number
}

export async function publishToWordPress(params: PublishToWordPressParams): Promise<PublishResult> {
  if (!params.client.wordpressUrl || !params.client.wordpressUsername || !params.client.wordpressAppPassword) {
    throw new Error('WordPress credentials not configured')
  }

  const credentials: WordPressCredentials = {
    url: params.client.wordpressUrl,
    username: params.client.wordpressUsername,
    password: params.client.wordpressAppPassword,
  }

  let featuredImageId: number | undefined
  let categoryIds: number[] | undefined

  // Upload featured image if provided
  if (params.featuredImageUrl) {
    try {
      const mediaResult = await uploadMedia(
        credentials,
        params.featuredImageUrl,
        `${params.slug}-featured.jpg`,
        params.title
      )
      featuredImageId = mediaResult.id
    } catch (error) {
      console.error('Failed to upload featured image:', error)
    }
  }

  // Look up category if provided
  if (params.categorySlug) {
    try {
      const categoryId = await getCategoryBySlug(
        credentials,
        params.categorySlug,
        params.categoryName
      )
      if (categoryId) {
        categoryIds = [categoryId]
      }
    } catch (error) {
      console.error('Failed to get category:', error)
    }
  }

  // Create the post
  const post = await createPost(credentials, {
    title: params.title,
    slug: params.slug,
    content: params.content,
    excerpt: params.excerpt,
    status: 'publish',
    featuredMediaId: featuredImageId,
    categories: categoryIds,
    meta: {
      ...(params.metaTitle && { _yoast_wpseo_title: params.metaTitle }),
      ...(params.metaDescription && { _yoast_wpseo_metadesc: params.metaDescription }),
    },
  })

  // Inject schema markup if provided
  if (params.schemaJson) {
    await injectSchemaMarkup(credentials, post.id, params.schemaJson)
  }

  return {
    postId: post.id,
    url: post.link,
    featuredImageId,
  }
}

/**
 * Update an existing WordPress post
 */
export interface UpdateWordPressPostParams {
  client: {
    wordpressUrl: string | null
    wordpressUsername: string | null
    wordpressAppPassword: string | null
  }
  postId: number
  content?: string
  schemaJson?: string
}

export async function updateWordPressPost(params: UpdateWordPressPostParams): Promise<void> {
  if (!params.client.wordpressUrl || !params.client.wordpressUsername || !params.client.wordpressAppPassword) {
    throw new Error('WordPress credentials not configured')
  }

  const credentials: WordPressCredentials = {
    url: params.client.wordpressUrl,
    username: params.client.wordpressUsername,
    password: params.client.wordpressAppPassword,
  }

  if (params.content) {
    await updatePost(credentials, params.postId, {
      content: params.content,
    })
  }

  if (params.schemaJson) {
    await injectSchemaMarkup(credentials, params.postId, params.schemaJson)
  }
}
