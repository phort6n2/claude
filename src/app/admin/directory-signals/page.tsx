export const dynamic = 'force-dynamic'

import { requireAdminPage } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { signalsEnabled } from '@/lib/directory-signals'
import DirectorySignalsList, {
  type SignalRow,
} from '@/components/admin/DirectorySignalsList'

/**
 * Shops on windshieldrepairhq.com that have shown they are in the market.
 *
 * NEW leads; the dismissed tail is kept 30 days so "did I already ring them"
 * stays answerable, and because a shop that claimed a listing in March and
 * dropped in rank in May is one conversation, not two.
 */
export default async function Page() {
  await requireAdminPage()

  const monthAgo = new Date(Date.now() - 30 * 86_400_000)
  const [signals, lastTest, configured] = await Promise.all([
    prisma.directorySignal
      .findMany({
        // isTest excluded, never merely styled differently. This is the list
        // somebody rings, and "TEST — Windshield Repair HQ wiring check" in
        // Testville with a phone number on it is exactly the row that gets
        // dialled at the end of a long afternoon.
        where: { isTest: false, OR: [{ status: 'NEW' }, { occurredAt: { gte: monthAgo } }] },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      })
      .catch(() => []),
    // Surfaced as one line instead, so pressing the directory's test button
    // still has somewhere here that visibly answers.
    prisma.directorySignal
      .findFirst({
        where: { isTest: true },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      })
      .catch(() => null),
    signalsEnabled(),
  ])

  const rows: SignalRow[] = signals.map((s) => ({
    id: s.id,
    type: s.type,
    slug: s.slug,
    name: s.name,
    email: s.email,
    phone: s.phone,
    city: s.city,
    state: s.state,
    website: s.website,
    rank: s.rank,
    totalInCity: s.totalInCity,
    previousRank: s.previousRank,
    monthlyVolume: s.monthlyVolume,
    frustration: s.frustration,
    wantsMarketingHelp: s.wantsMarketingHelp,
    status: s.status,
    occurredAt: s.occurredAt.toISOString(),
  }))

  return (
    <div className="max-w-4xl p-6">
      <h1 className="text-2xl font-bold text-gray-900">Shop signals</h1>
      <p className="mt-1 text-sm text-gray-500">
        Shops on Windshield Repair HQ that have done something suggesting they are shopping —
        claimed their listing, paid for Featured, or lost ground in their city. They arrive the
        moment they happen and you get an email when something new lands.
      </p>

      {!configured && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Nothing can arrive yet.</p>
          <p className="mt-1">
            Set <code className="font-mono">WRHQ_EVENT_SECRET</code> here and the same value as{' '}
            <code className="font-mono">AGMP_WEBHOOK_SECRET</code> on the directory, with{' '}
            <code className="font-mono">AGMP_WEBHOOK_URL</code> pointed at{' '}
            <code className="font-mono">/api/webhooks/wrhq/events</code>. Until then every event is
            refused — a missing secret must never read as &ldquo;authentic&rdquo;.
          </p>
        </div>
      )}

      {lastTest && (
        <p className="mt-4 text-xs text-gray-500">
          Wiring test last received{' '}
          {new Date(lastTest.occurredAt).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          . Test events are kept out of the list below.
        </p>
      )}

      <div className="mt-6">
        <DirectorySignalsList rows={rows} />
      </div>
    </div>
  )
}
