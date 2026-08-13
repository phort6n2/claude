import { prisma } from '@/lib/db'
import { leadIdFromToken } from '@/lib/lead-outcome-token'
import { OutcomeForm } from './OutcomeForm'
import { telHref } from '@/lib/contact-links'
import { formatPhoneDisplay } from '@/lib/lead-display'

export const dynamic = 'force-dynamic'

/** Never let a lead's details reach a search index. */
export const metadata = {
  title: 'Did this one book?',
  robots: { index: false, follow: false },
}

function detail(formData: unknown, keys: string[]): string | null {
  const fd = (formData || {}) as Record<string, unknown>
  const raw = (fd._rawPayload || {}) as Record<string, unknown>
  for (const key of keys) {
    const v = fd[key] ?? raw[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/**
 * The page the alert's "Did this book?" buttons open.
 *
 * Deliberately not behind a login — the point is that recording an outcome
 * costs one tap while the job is still fresh. The signed token in the URL is
 * the authority, and it reaches exactly this one lead.
 *
 * What it shows is what a person needs to recognise the enquiry: who, what
 * car, what job. Not the whole record — the less this page carries, the less
 * a forwarded email gives away.
 */
export default async function LeadOutcomePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const leadId = leadIdFromToken(token)

  const lead = leadId
    ? await prisma.lead
        .findUnique({
          where: { id: leadId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            saleValue: true,
            formData: true,
            createdAt: true,
            client: { select: { businessName: true } },
          },
        })
        .catch(() => null)
    : null

  if (!lead) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">This link doesn&apos;t work</h1>
          <p className="mt-2 text-sm text-gray-500">
            It may have been changed by an email app, or the lead may have been removed. Open the
            lead from your leads list instead.
          </p>
        </div>
      </main>
    )
  }

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'This enquiry'
  const service = detail(lead.formData, ['service_label', 'interested_in', 'service'])
  const vehicle =
    detail(lead.formData, ['vehicle']) ||
    [
      detail(lead.formData, ['vehicle_year']),
      detail(lead.formData, ['vehicle_make']),
      detail(lead.formData, ['vehicle_model']),
    ]
      .filter(Boolean)
      .join(' ') ||
    null
  const tel = telHref(lead.phone)

  return (
    <main className="flex min-h-screen items-start justify-center bg-gray-50 p-4 sm:items-center">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            {lead.client.businessName}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {[service, vehicle].filter(Boolean).join(' · ') || 'Enquiry'}
          </p>
          <p className="mt-0.5 text-sm text-gray-400">
            {new Date(lead.createdAt).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </p>

          {tel && (
            <a
              href={tel}
              className="mt-4 block rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-blue-700 hover:bg-gray-50"
            >
              Call {formatPhoneDisplay(lead.phone)}
            </a>
          )}

          <div className="mt-6 border-t border-gray-100 pt-6">
            <OutcomeForm
              token={token}
              initialStatus={lead.status}
              initialAmount={lead.saleValue}
            />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">
          Recorded against your leads at glassleads.app
        </p>
      </div>
    </main>
  )
}
