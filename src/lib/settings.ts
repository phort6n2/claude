// Settings helper functions for WRHQ and global configuration
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

// WRHQ Configuration Keys
export const WRHQ_SETTINGS_KEYS = {
  // Master Enable/Disable
  WRHQ_ENABLED: 'WRHQ_ENABLED',

  // WordPress Config
  WRHQ_WORDPRESS_URL: 'WRHQ_WORDPRESS_URL',
  WRHQ_WORDPRESS_USERNAME: 'WRHQ_WORDPRESS_USERNAME',
  WRHQ_WORDPRESS_APP_PASSWORD: 'WRHQ_WORDPRESS_APP_PASSWORD',

  // Social Media Config (Late Account IDs)
  WRHQ_LATE_FACEBOOK_ID: 'WRHQ_LATE_FACEBOOK_ID',
  WRHQ_LATE_INSTAGRAM_ID: 'WRHQ_LATE_INSTAGRAM_ID',
  WRHQ_LATE_LINKEDIN_ID: 'WRHQ_LATE_LINKEDIN_ID',
  WRHQ_LATE_TWITTER_ID: 'WRHQ_LATE_TWITTER_ID',
  WRHQ_LATE_TIKTOK_ID: 'WRHQ_LATE_TIKTOK_ID',
  WRHQ_LATE_GBP_ID: 'WRHQ_LATE_GBP_ID',
  WRHQ_LATE_YOUTUBE_ID: 'WRHQ_LATE_YOUTUBE_ID',
  WRHQ_LATE_BLUESKY_ID: 'WRHQ_LATE_BLUESKY_ID',
  WRHQ_LATE_THREADS_ID: 'WRHQ_LATE_THREADS_ID',
  WRHQ_LATE_REDDIT_ID: 'WRHQ_LATE_REDDIT_ID',
  WRHQ_LATE_PINTEREST_ID: 'WRHQ_LATE_PINTEREST_ID',
  WRHQ_LATE_TELEGRAM_ID: 'WRHQ_LATE_TELEGRAM_ID',

  // Publishing Preferences
  WRHQ_PUBLISH_TIME: 'WRHQ_PUBLISH_TIME',
  WRHQ_TIMEZONE: 'WRHQ_TIMEZONE',
  WRHQ_ENABLED_PLATFORMS: 'WRHQ_ENABLED_PLATFORMS',
} as const

// Keys that should be encrypted
const ENCRYPTED_KEYS: Set<string> = new Set([
  WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_APP_PASSWORD,
])

export interface WRHQConfig {
  wordpress: {
    url: string | null
    username: string | null
    appPassword: string | null
    isConfigured: boolean
  }
  socialMedia: {
    facebook: string | null
    instagram: string | null
    linkedin: string | null
    twitter: string | null
    tiktok: string | null
    gbp: string | null
    youtube: string | null
    bluesky: string | null
    threads: string | null
    reddit: string | null
    pinterest: string | null
    telegram: string | null
    enabledPlatforms: string[]
  }
  publishing: {
    preferredTime: string
    timezone: string
  }
}

/**
 * Get a setting value by key
 * Checks database first, then falls back to environment variables
 */
export async function getSetting(key: string): Promise<string | null> {
  // First check database
  const setting = await prisma.setting.findUnique({
    where: { key },
  })

  if (setting) {
    if (setting.encrypted) {
      try {
        return decrypt(setting.value)
      } catch (error) {
        console.error(`Failed to decrypt setting: ${key}`, error)
        // Return null so the calling code can handle missing credentials gracefully
        return null
      }
    }
    return setting.value
  }

  // Fall back to environment variable
  return process.env[key] || null
}

/**
 * Set a setting value
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const shouldEncrypt = ENCRYPTED_KEYS.has(key)
  const storedValue = shouldEncrypt ? encrypt(value) : value

  await prisma.setting.upsert({
    where: { key },
    update: {
      value: storedValue,
      encrypted: shouldEncrypt,
      updatedAt: new Date(),
    },
    create: {
      key,
      value: storedValue,
      encrypted: shouldEncrypt,
    },
  })
}

/**
 * Delete a setting
 */
export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key },
  })
}

/**
 * Get multiple settings at once
 */
export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const settings = await prisma.setting.findMany({
    where: { key: { in: keys } },
  })

  const result: Record<string, string | null> = {}

  for (const key of keys) {
    result[key] = null
  }

  for (const setting of settings) {
    if (setting.encrypted) {
      try {
        result[setting.key] = decrypt(setting.value)
      } catch {
        result[setting.key] = null
      }
    } else {
      result[setting.key] = setting.value
    }
  }

  return result
}

/**
 * Get WRHQ configuration
 */
export async function getWRHQConfig(): Promise<WRHQConfig> {
  const allKeys = Object.values(WRHQ_SETTINGS_KEYS)
  const settings = await getSettings(allKeys)

  const wordpressUrl = settings[WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_URL]
  const wordpressUsername = settings[WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_USERNAME]
  const wordpressAppPassword = settings[WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_APP_PASSWORD]

  // Parse enabled platforms (stored as comma-separated)
  const enabledPlatformsStr = settings[WRHQ_SETTINGS_KEYS.WRHQ_ENABLED_PLATFORMS]
  const enabledPlatforms = enabledPlatformsStr
    ? enabledPlatformsStr.split(',').map(p => p.trim()).filter(Boolean)
    : ['facebook', 'instagram', 'linkedin', 'twitter'] // Default platforms

  return {
    wordpress: {
      url: wordpressUrl,
      username: wordpressUsername,
      appPassword: wordpressAppPassword,
      isConfigured: !!(wordpressUrl && wordpressUsername && wordpressAppPassword),
    },
    socialMedia: {
      facebook: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_FACEBOOK_ID],
      instagram: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_INSTAGRAM_ID],
      linkedin: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_LINKEDIN_ID],
      twitter: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_TWITTER_ID],
      tiktok: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_TIKTOK_ID],
      gbp: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_GBP_ID],
      youtube: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_YOUTUBE_ID],
      bluesky: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_BLUESKY_ID],
      threads: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_THREADS_ID],
      reddit: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_REDDIT_ID],
      pinterest: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_PINTEREST_ID],
      telegram: settings[WRHQ_SETTINGS_KEYS.WRHQ_LATE_TELEGRAM_ID],
      enabledPlatforms,
    },
    publishing: {
      preferredTime: settings[WRHQ_SETTINGS_KEYS.WRHQ_PUBLISH_TIME] || '10:00',
      timezone: settings[WRHQ_SETTINGS_KEYS.WRHQ_TIMEZONE] || 'America/Los_Angeles',
    },
  }
}

/**
 * Update WRHQ WordPress configuration
 */
export async function updateWRHQWordPress(config: {
  url?: string
  username?: string
  appPassword?: string
}): Promise<void> {
  const updates: Promise<void>[] = []

  if (config.url !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_URL, config.url))
  }
  if (config.username !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_USERNAME, config.username))
  }
  if (config.appPassword !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_WORDPRESS_APP_PASSWORD, config.appPassword))
  }

  await Promise.all(updates)
}

/**
 * Update WRHQ social media account IDs
 */
export async function updateWRHQSocialMedia(accounts: {
  facebook?: string
  instagram?: string
  linkedin?: string
  twitter?: string
  tiktok?: string
  gbp?: string
  youtube?: string
  bluesky?: string
  threads?: string
  reddit?: string
  pinterest?: string
  telegram?: string
  enabledPlatforms?: string[]
}): Promise<void> {
  const updates: Promise<void>[] = []

  if (accounts.facebook !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_FACEBOOK_ID, accounts.facebook))
  }
  if (accounts.instagram !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_INSTAGRAM_ID, accounts.instagram))
  }
  if (accounts.linkedin !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_LINKEDIN_ID, accounts.linkedin))
  }
  if (accounts.twitter !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_TWITTER_ID, accounts.twitter))
  }
  if (accounts.tiktok !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_TIKTOK_ID, accounts.tiktok))
  }
  if (accounts.gbp !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_GBP_ID, accounts.gbp))
  }
  if (accounts.youtube !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_YOUTUBE_ID, accounts.youtube))
  }
  if (accounts.bluesky !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_BLUESKY_ID, accounts.bluesky))
  }
  if (accounts.threads !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_THREADS_ID, accounts.threads))
  }
  if (accounts.reddit !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_REDDIT_ID, accounts.reddit))
  }
  if (accounts.pinterest !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_PINTEREST_ID, accounts.pinterest))
  }
  if (accounts.telegram !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_LATE_TELEGRAM_ID, accounts.telegram))
  }
  if (accounts.enabledPlatforms !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_ENABLED_PLATFORMS, accounts.enabledPlatforms.join(',')))
  }

  await Promise.all(updates)
}

/**
 * Update WRHQ publishing preferences
 */
export async function updateWRHQPublishing(prefs: {
  preferredTime?: string
  timezone?: string
}): Promise<void> {
  const updates: Promise<void>[] = []

  if (prefs.preferredTime !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_PUBLISH_TIME, prefs.preferredTime))
  }
  if (prefs.timezone !== undefined) {
    updates.push(setSetting(WRHQ_SETTINGS_KEYS.WRHQ_TIMEZONE, prefs.timezone))
  }

  await Promise.all(updates)
}

/**
 * Get WRHQ Late account IDs as a record for the scheduling function
 */
export async function getWRHQLateAccountIds(): Promise<Record<string, string>> {
  const config = await getWRHQConfig()
  const accounts: Record<string, string> = {}

  if (config.socialMedia.facebook) accounts.facebook = config.socialMedia.facebook
  if (config.socialMedia.instagram) accounts.instagram = config.socialMedia.instagram
  if (config.socialMedia.linkedin) accounts.linkedin = config.socialMedia.linkedin
  if (config.socialMedia.twitter) accounts.twitter = config.socialMedia.twitter
  if (config.socialMedia.tiktok) accounts.tiktok = config.socialMedia.tiktok
  if (config.socialMedia.gbp) accounts.gbp = config.socialMedia.gbp
  if (config.socialMedia.youtube) accounts.youtube = config.socialMedia.youtube
  if (config.socialMedia.bluesky) accounts.bluesky = config.socialMedia.bluesky
  if (config.socialMedia.threads) accounts.threads = config.socialMedia.threads
  if (config.socialMedia.reddit) accounts.reddit = config.socialMedia.reddit
  if (config.socialMedia.pinterest) accounts.pinterest = config.socialMedia.pinterest
  if (config.socialMedia.telegram) accounts.telegram = config.socialMedia.telegram

  return accounts
}

/**
 * Check if WRHQ WordPress is properly configured
 */
export async function isWRHQWordPressConfigured(): Promise<boolean> {
  const config = await getWRHQConfig()
  return config.wordpress.isConfigured
}

/**
 * Check if WRHQ has any social media accounts configured
 */
export async function hasWRHQSocialMediaConfigured(): Promise<boolean> {
  const accounts = await getWRHQLateAccountIds()
  return Object.keys(accounts).length > 0
}
