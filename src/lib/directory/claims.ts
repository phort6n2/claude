// ============================================
// DIRECTORY — CLAIM / SUBMISSION QUEUE
// ============================================
// Pending listing claims land here for the operator to review and approve into
// the directory. Stored server-side in Vercel Blob (like quotes). Includes the
// Google Business Profile data the owner picked plus the anti-spam category
// verdict, so review is a glance. Degrades gracefully: with no blob token the
// claim is logged (operator told to configure storage) and reads return empty.

import { list, put } from '@vercel/blob'

const PREFIX = 'directory/claims'

export interface Claim {
  id: string
  type: 'claim' | 'new_listing'
  businessName: string
  email: string
  contactName?: string
  phone?: string
  website?: string
  city?: string
  state?: string
  stateFull?: string
  street?: string
  zip?: string
  // From the Google Business Profile picker (when used):
  placeId?: string
  googleCategory?: string
  verifyVerdict?: string
  serviceAreaOnly?: boolean
  // Claiming an existing listing:
  existingShopSlug?: string
  wantsMarketingHelp?: boolean
  message?: string
  createdAt: string
}

export function claimsEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

export async function saveClaim(claim: Claim): Promise<boolean> {
  if (!claimsEnabled()) {
    console.log('[directory:claim:unstored]', JSON.stringify(claim))
    return false
  }
  await put(`${PREFIX}/${claim.id}.json`, JSON.stringify(claim), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
  })
  return true
}

export async function listClaims(): Promise<Claim[]> {
  if (!claimsEnabled()) return []
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/` })
    const claims = await Promise.all(
      blobs.map(async (b) => {
        try {
          const res = await fetch(b.url, { cache: 'no-store' })
          return (await res.json()) as Claim
        } catch {
          return null
        }
      })
    )
    return claims
      .filter((c): c is Claim => !!c)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  } catch {
    return []
  }
}
