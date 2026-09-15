import type { MonthlyDigest } from '@/lib/monthly-digest'

/**
 * Last month in depth, above the twelve-month trend on the same page.
 *
 * ONE PAGE, NOT TWO. "Results" already answered "what did I get" as a trend;
 * this answers "what happened in February" and they belong together — a shop
 * owner asking one of those questions is thirty seconds from asking the other,
 * and two monthly reports in a six-tab portal is two places to look for one
 * answer.
 *
 * IT RENDERS THE STORED SNAPSHOT, not a live query. The email sent on the 1st
 * and this page opened in June show the same numbers because they are the same
 * numbers — see lib/monthly-digest.ts.
 *
 * Every block strips itself when it has no data, per § 2. A self-serve shop
 * has no ads account and no ads block; that is their report, not a broken
 * version of somebody else's.
 */

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const money2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const round1 = (n: number) => Math.round(n * 10) / 10

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-2xl font-extrabold tabular-nums text-gray-900">{value}</div>
      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </section>
  )
}

export default function LastMonthReport({
  digest,
  note,
}: {
  digest: MonthlyDigest
  note: string | null
}) {
  const e = digest.enquiries
  const a = digest.ads

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.08em] text-[var(--brand-ink,#1d4ed8)]">
          {digest.label}
        </p>
        <h2 className="text-xl font-bold text-gray-900">Last month in detail</h2>
      </div>

      <Section title="Enquiries">
        {/* Two across on a phone rather than four: at 360px a four-column grid
            gives each figure 78px, and "Cost / conversion" wraps to three
            lines under a number nobody can read. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total enquiries" value={String(e.total)} />
          <Stat label="Calls" value={String(e.byChannel.phone)} />
          <Stat label="Form" value={String(e.byChannel.form)} />
          {e.byChannel.sms > 0 && <Stat label="Texts" value={String(e.byChannel.sms)} />}
        </div>
        {/* A zero booked count reads as "this does not work" when it usually
            means nobody ticked the box, so the page says which it is — the
            same rule the trend below follows. */}
        {e.booked > 0 ? (
          <p className="text-sm text-gray-700">
            <strong>
              {e.booked} marked booked{e.revenue > 0 ? `, ${money(e.revenue)} in work` : ''}.
            </strong>
            {e.open > 0 && ` ${e.open} still open — those are worth a second call.`}
          </p>
        ) : e.total > 0 ? (
          <p className="text-sm text-gray-700">
            None of these are marked booked yet, so there is no revenue figure for the month.
            Marking them on the Leads tab is what lets you hold the spend against the work.
          </p>
        ) : (
          <p className="text-sm text-gray-700">No enquiries came in last month.</p>
        )}
      </Section>

      {a && (
        <Section title="Google Ads">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Spend" value={money(a.spend)} />
            <Stat label="Clicks" value={a.clicks.toLocaleString('en-US')} />
            <Stat label="Conversions" value={String(round1(a.conversions))} />
            <Stat
              label="Cost / conversion"
              value={a.costPerConversion === null ? '—' : money2(a.costPerConversion)}
            />
          </div>
          {/* SAID OUT LOUD, because the two numbers on this page do not match
              and a shop who spots that without being told concludes one of
              them is invented. Google counts only what it can attribute to an
              ad click; the enquiry count above includes organic and direct. */}
          <p className="text-xs text-gray-500">
            Spend and conversions are Google&rsquo;s own figures for the month, so they match your
            Ads account. They count only the enquiries Google can tie back to an ad click, which
            is why the conversion count is lower than the total above.
          </p>

          {a.campaigns.length > 0 && (
            // Its own scroll box: the page body never scrolls sideways.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    <th className="pb-2 pr-3">Campaign</th>
                    <th className="pb-2 pr-3">Spend</th>
                    <th className="pb-2 pr-3">Clicks</th>
                    <th className="pb-2">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {a.campaigns.map((c) => (
                    <tr key={c.name} className="border-t border-gray-200">
                      <td className="py-2 pr-3 text-gray-900">{c.name}</td>
                      <td className="py-2 pr-3 tabular-nums text-gray-700">{money(c.spend)}</td>
                      <td className="py-2 pr-3 tabular-nums text-gray-700">{c.clicks}</td>
                      <td className="py-2 tabular-nums text-gray-700">{round1(c.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {a.keywords.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Where the money went</h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <th className="pb-2 pr-3">Search term matched</th>
                      <th className="pb-2 pr-3">Spend</th>
                      <th className="pb-2 pr-3">Clicks</th>
                      <th className="pb-2">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.keywords.map((k) => (
                      <tr key={`${k.campaign}:${k.text}`} className="border-t border-gray-200">
                        <td className="py-2 pr-3 text-gray-900">{k.text}</td>
                        <td className="py-2 pr-3 tabular-nums text-gray-700">{money(k.spend)}</td>
                        <td className="py-2 pr-3 tabular-nums text-gray-700">{k.clicks}</td>
                        <td className="py-2 tabular-nums text-gray-700">{round1(k.conversions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* A failure is not an absence. Silently dropping the ads block during
          an outage reads as "we spent nothing on your ads last month". */}
      {!a && digest.adsError && (
        <Section title="Google Ads">
          <p className="text-sm text-gray-700">
            We could not read your Ads account when this report was built, so the spend figures
            are missing rather than zero.
          </p>
        </Section>
      )}

      {digest.work.length > 0 && (
        <Section title="What we did">
          <ul className="space-y-2">
            {digest.work.map((w, i) => (
              <li key={`${w.at}-${i}`} className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{w.title}</span>
                {w.detail && <span className="block text-xs text-gray-500">{w.detail}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(note?.trim() || digest.nextSteps.length > 0) && (
        <Section title="What's next">
          {note?.trim() && (
            <div className="space-y-2 text-sm text-gray-700">
              {note
                .trim()
                .split(/\n+/)
                .map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
            </div>
          )}
          {digest.nextSteps.length > 0 && (
            <ul className="space-y-2">
              {digest.nextSteps.map((s, i) => (
                <li key={i} className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{s.title}</span>
                  <span className="block text-xs text-gray-500">{s.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}
