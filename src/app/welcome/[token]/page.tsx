import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { intakeIdFromToken } from '@/lib/intake-token'
import { sectionsFor, type IntakeAnswers } from '@/lib/client-intake'
import { deliverabilityGuide } from '@/lib/alert-deliverability'
import IntakeForm from '@/components/intake/IntakeForm'

export const dynamic = 'force-dynamic'

/**
 * The page behind the welcome email's link.
 *
 * Public by token and NOINDEX. It is not a marketing page and it carries one
 * shop's details; a crawler finding it would be a small privacy failure and a
 * large embarrassment.
 */
export const metadata: Metadata = {
  title: 'Getting set up',
  robots: { index: false, follow: false },
}

export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const id = intakeIdFromToken(token)
  if (!id) notFound()

  const intake = await prisma.clientIntake.findUnique({ where: { id } }).catch(() => null)
  if (!intake) notFound()

  const deliverability = await deliverabilityGuide()

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
            Auto Glass Marketing Pros
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{intake.businessName}</h1>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            {intake.kind === 'EXISTING'
              ? 'Your site and lead tracking are already running. This checks what we hold is right, and switches on the alerts.'
              : 'A few questions and we can build your site. It saves as you go, so you can stop and come back.'}
          </p>
        </header>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <IntakeForm
            token={token}
            businessName={intake.businessName}
            kind={intake.kind}
            sections={sectionsFor(intake.seo)}
            initialAnswers={(intake.answers as IntakeAnswers) || {}}
            initialStatus={intake.status}
            deliverability={deliverability}
          />
        </div>

        <p className="text-xs text-gray-400 mt-6 text-center">
          Nothing here is published until someone on our side has read it.
        </p>
      </div>
    </main>
  )
}
