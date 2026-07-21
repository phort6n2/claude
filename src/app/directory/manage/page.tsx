import type { Metadata } from 'next'
import { ImagePlus, Wand2 } from 'lucide-react'
import { getAllShops } from '@/lib/directory/data'
import { uploadsEnabled } from '@/lib/directory/photos'
import { ManageUploader } from '@/components/directory/ManageUploader'
import { WebsiteTools } from '@/components/directory/WebsiteTools'
import { QuoteInbox } from '@/components/directory/QuoteInbox'
import { OwnerKeys } from '@/components/directory/OwnerKeys'
import { ReviewsRefresh } from '@/components/directory/ReviewsRefresh'
import { SpamAudit } from '@/components/directory/SpamAudit'
import { ClaimsInbox } from '@/components/directory/ClaimsInbox'

// Internal agency tools. Kept out of the index; the APIs are secret-gated, so
// this page is a convenience console, not a security boundary.
export const metadata: Metadata = {
  title: 'Manage listings',
  robots: { index: false, follow: false },
}

export default function ManagePage() {
  const shops = getAllShops().map((s) => ({
    slug: s.slug,
    name: s.name,
    city: s.city,
    state: s.state,
  }))
  const enabled = uploadsEnabled()

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        <Wand2 width={24} height={24} className="text-blue-600" /> Listing tools
      </h1>
      <p className="mt-2 text-gray-600">
        Auto-fill new listings from a website, find SEO sales prospects, and add photos.
      </p>

      {!enabled && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some tools need env vars. Set{' '}
          <code className="rounded bg-amber-100 px-1">DIRECTORY_UPLOAD_SECRET</code> (for the
          URL/SEO tools) and connect a Vercel Blob store to add{' '}
          <code className="rounded bg-amber-100 px-1">BLOB_READ_WRITE_TOKEN</code> (for photo
          uploads).
        </div>
      )}

      <div className="mt-8">
        <WebsiteTools />
      </div>

      <div className="mt-8">
        <ClaimsInbox />
      </div>

      <div className="mt-8">
        <QuoteInbox />
      </div>

      <div className="mt-8">
        <OwnerKeys />
      </div>

      <div className="mt-8">
        <ReviewsRefresh />
      </div>

      <div className="mt-8">
        <SpamAudit />
      </div>

      <div className="mt-12">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <ImagePlus width={20} height={20} className="text-blue-600" /> Listing photos
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Add photos to a listing — they appear within a few minutes.
        </p>
        <div className="mt-4">
          <ManageUploader shops={shops} />
        </div>
      </div>
    </div>
  )
}
