import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { getShopBySlug } from '@/lib/directory/data'
import { ClaimForm } from '@/components/directory/ClaimForm'

export const metadata: Metadata = {
  title: 'Add Your Auto Glass Shop — Free Listing',
  description:
    'Add your auto glass or windshield shop to the directory for free. Get found by local drivers searching for repair and replacement.',
}

const BENEFITS = [
  'Free listing — no credit card, no catch',
  'Show up when local drivers search',
  'Display your services, hours, and phone',
  'Structured data that helps you rank on Google',
]

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const shopParam = sp.shop
  const slug = Array.isArray(shopParam) ? shopParam[0] : shopParam
  const existing = slug ? getShopBySlug(slug) : undefined

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h1 className="text-3xl font-bold text-gray-900">
            {existing ? 'Claim your listing' : 'Add your shop — free'}
          </h1>
          <p className="mt-3 text-gray-600">
            Get your auto glass shop in front of local drivers actively looking for
            windshield repair and replacement. It takes two minutes.
          </p>
          <ul className="mt-6 space-y-3">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Check width={13} height={13} />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
            <p className="font-semibold text-gray-900">Want to grow faster?</p>
            <p className="mt-1">
              Beyond the free listing, we offer done-for-you SEO and Google Ads
              management built specifically for auto glass shops. Check the box in
              the form and we&apos;ll send a free assessment.
            </p>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-xl border border-gray-200 p-6 shadow-sm">
            <ClaimForm
              existingShopSlug={existing?.slug}
              existingShopName={existing?.name}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
