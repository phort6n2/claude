'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Loader2,
  PhoneCall,
  Smartphone,
} from 'lucide-react'
import { errorFrom } from '@/lib/http-error'

/**
 * The day-one walkthrough, rendered on the portal home until it is done or
 * dismissed.
 *
 * Four steps, in the order they matter: prove an alert reaches a phone,
 * put the portal where a lead is one tap away, then two the shop does not do
 * at all — they complete themselves when the first lead lands and when it is
 * first acted on. Self-completing steps are the point: a checklist should
 * show the product working, not generate homework.
 *
 * "It arrived" is a claim only the shop can make, which is why the button
 * exists instead of us marking the step done when the send succeeds. A 200
 * from the email provider and a message a human saw are different facts, and
 * the gap between them — the spam folder — is the reason this card exists.
 */

export interface WhitelistSteps {
  platform: string
  steps: string[]
}

export default function GettingStartedCard({
  senders,
  emailSteps,
  smsSteps,
  recipients,
  hasRecipients,
  testSentAt,
  alertsConfirmed,
  appInstalled,
  hasLead,
  hasActioned,
}: {
  senders: { emailAddress: string | null; emailName: string; smsNumber: string | null }
  emailSteps: WhitelistSteps[]
  smsSteps: WhitelistSteps[]
  recipients: { emails: string[]; phones: string[] }
  hasRecipients: boolean
  testSentAt: string | null
  alertsConfirmed: boolean
  appInstalled: boolean
  hasLead: boolean
  hasActioned: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)
  const [showSteps, setShowSteps] = useState(false)

  const done = [alertsConfirmed, appInstalled, hasLead, hasActioned].filter(Boolean).length

  async function act(action: string) {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error(await errorFrom(res, 'Could not save that'))
      if (action === 'send-test') setJustSent(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const testWasSent = justSent || !!testSentAt

  const Step = ({
    stepDone,
    icon: Icon,
    title,
    children,
  }: {
    stepDone: boolean
    icon: React.ElementType
    title: string
    children?: React.ReactNode
  }) => (
    <li className="flex gap-3">
      {stepDone ? (
        <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
      ) : (
        <Icon className="h-5 w-5 mt-0.5 shrink-0 text-gray-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${stepDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {title}
        </p>
        {!stepDone && children}
      </div>
    </li>
  )

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-gray-900">Getting set up</h2>
        <span className="text-sm text-gray-500 tabular-nums">{done} of 4</span>
      </div>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">
        The short list that makes sure the first real lead reaches you.
      </p>

      <ol className="space-y-4">
        <Step stepDone={alertsConfirmed} icon={BellRing} title="Prove a lead alert reaches you">
          <div className="mt-1 space-y-2 text-sm text-gray-600">
            {hasRecipients ? (
              <>
                <p>
                  Alerts go to{' '}
                  <span className="font-medium text-gray-800">
                    {[...recipients.emails, ...recipients.phones].join(', ')}
                  </span>
                  {senders.emailAddress && (
                    <>
                      {' '}
                      from <span className="font-medium text-gray-800">{senders.emailAddress}</span>{' '}
                      (sender name {senders.emailName})
                    </>
                  )}
                  {senders.smsNumber && (
                    <>
                      {recipients.phones.length > 0 && (
                        <>
                          , texts from{' '}
                          <span className="font-medium text-gray-800">{senders.smsNumber}</span>
                        </>
                      )}
                    </>
                  )}
                  . Save that in your contacts first, so it never lands in spam.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSteps((v) => !v)}
                  className="inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: 'var(--brand-ink)' }}
                >
                  How to whitelist it on your phone
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${showSteps ? 'rotate-180' : ''}`}
                  />
                </button>
                {showSteps && (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-3">
                    {[...emailSteps, ...(recipients.phones.length ? smsSteps : [])].map((entry) => (
                      <div key={entry.platform}>
                        <p className="font-semibold text-gray-800">{entry.platform}</p>
                        <ul className="list-disc ml-5 mt-0.5 space-y-0.5">
                          {entry.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => act('send-test')}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60"
                    style={{ backgroundColor: 'var(--brand)' }}
                  >
                    {busy === 'send-test' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {testWasSent ? 'Send another test' : 'Send me a test alert'}
                  </button>
                  {testWasSent && (
                    <button
                      type="button"
                      onClick={() => act('confirm-alerts')}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-green-600 text-green-700 text-sm font-semibold disabled:opacity-60"
                    >
                      {busy === 'confirm-alerts' && <Loader2 className="h-4 w-4 animate-spin" />}
                      It arrived
                    </button>
                  )}
                </div>
                {testWasSent && (
                  <p className="text-xs text-gray-500">
                    Sent. Nothing after a minute? Check the spam folder and the steps above — then
                    press &ldquo;It arrived&rdquo; only once it actually has.
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-start gap-1.5 text-amber-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                We don&apos;t have anywhere to send your alerts yet — get in touch and tell us which
                phones and inboxes should hear about new leads.
              </p>
            )}
          </div>
        </Step>

        <Step stepDone={appInstalled} icon={Smartphone} title="Put this portal on your phone">
          <div className="mt-1 space-y-2 text-sm text-gray-600">
            <p>
              A lead is worth the most in the first few minutes, so this page belongs one tap from
              your thumb — not behind a browser and a bookmark.
            </p>
            <ul className="list-disc ml-5 space-y-0.5">
              <li>
                <span className="font-medium text-gray-800">iPhone:</span> open this page in Safari
                → Share button → &ldquo;Add to Home Screen&rdquo;.
              </li>
              <li>
                <span className="font-medium text-gray-800">Android:</span> open it in Chrome → ⋮
                menu → &ldquo;Add to Home screen&rdquo;.
              </li>
            </ul>
            <button
              type="button"
              onClick={() => act('app-installed')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold disabled:opacity-60"
            >
              {busy === 'app-installed' && <Loader2 className="h-4 w-4 animate-spin" />}
              It&apos;s on my home screen
            </button>
          </div>
        </Step>

        <Step stepDone={hasLead} icon={Inbox} title="Your first lead arrives">
          <p className="mt-1 text-sm text-gray-600">
            Nothing to do — when someone asks for a quote, it lands here and your alert fires. This
            ticks itself.
          </p>
        </Step>

        <Step stepDone={hasActioned} icon={PhoneCall} title="Call it, then mark what happened">
          <p className="mt-1 text-sm text-gray-600">
            When it comes in: call while the glass is still broken and they&apos;re still looking,
            then tap the lead and mark how it went. That one tap is what makes every number in this
            portal true.
          </p>
        </Step>
      </ol>

      {error && (
        <p className="mt-3 text-sm text-red-600 flex items-start gap-1.5">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100 text-right">
        <button
          type="button"
          onClick={() => act('dismiss')}
          disabled={busy !== null}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Hide this list
        </button>
      </div>
    </section>
  )
}
