export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/admin-guard'
import { missingRequired, sectionsFor, type IntakeAnswers } from '@/lib/client-intake'
import { intakeUrlFor } from '@/lib/intake-token'
import IntakeReview from '@/components/admin/IntakeReview'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()

  const { id } = await params
  const intake = await prisma.clientIntake.findUnique({ where: { id } }).catch(() => null)
  if (!intake) notFound()

  const answers = (intake.answers as IntakeAnswers) || {}
  const url = intakeUrlFor(intake.id)

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/admin/intakes" className="text-sm text-blue-600 hover:underline">
        ← Onboarding
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">{intake.businessName}</h1>
      <p className="text-sm text-gray-500 mt-1">
        {intake.kind === 'EXISTING' ? 'An existing client checking their details' : 'A new shop'}
        {intake.seo ? ' · done-for-you SEO' : ''}
        {intake.submittedAt ? ` · submitted ${intake.submittedAt.toLocaleDateString()}` : ' · not submitted yet'}
      </p>
      {url && (
        <p className="text-xs text-gray-400 mt-1 font-mono break-all">{url}</p>
      )}

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm mt-5">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">What they told us</h2>
          <p className="text-sm text-gray-500">
            Correct anything wrong before approving — what is on this screen is what gets saved
          </p>
        </div>
        <IntakeReview
          intakeId={intake.id}
          sections={sectionsFor(intake.seo)}
          initialAnswers={answers}
          status={intake.status}
          kind={intake.kind}
          missing={missingRequired(answers, intake.seo)}
        />
      </section>
    </div>
  )
}
