import type { Metadata } from 'next'
import { ImagePlus } from 'lucide-react'
import { getAllShops } from '@/lib/directory/data'
import { uploadsEnabled } from '@/lib/directory/photos'
import { ManageUploader } from '@/components/directory/ManageUploader'

// Internal photo-management tool. Kept out of the index; the upload API is
// secret-gated, so this page is a convenience form, not a security boundary.
export const metadata: Metadata = {
  title: 'Manage listing photos',
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
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        <ImagePlus width={24} height={24} className="text-blue-600" /> Listing photos
      </h1>
      <p className="mt-2 text-gray-600">
        Add photos to a shop listing. Uploads are stored securely and appear on the
        listing within a few minutes.
      </p>

      {!enabled && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Uploads aren&apos;t configured on this deployment yet. Set{' '}
          <code className="rounded bg-amber-100 px-1">BLOB_READ_WRITE_TOKEN</code> and{' '}
          <code className="rounded bg-amber-100 px-1">DIRECTORY_UPLOAD_SECRET</code> in
          your environment variables to enable it.
        </div>
      )}

      <div className="mt-6">
        <ManageUploader shops={shops} />
      </div>
    </div>
  )
}
