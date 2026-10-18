'use client'

import { useState, useSyncExternalStore } from 'react'

/**
 * "Your Privacy Choices" — California's opt-out of the sale or sharing of
 * personal information, on the shop's own privacy page.
 *
 * The choice is a first-party cookie (gl_optout=1) that every advertising tag
 * on the site reads before it runs (GoogleTag.tsx: no Meta Pixel, no
 * Microsoft UET, Google in restricted data processing) and that the lead
 * intake reads before sending anything to Meta's Conversions API. The
 * browser's Global Privacy Control signal does the same without anybody
 * pressing anything, and this control says so when it sees one — a visitor
 * who has already opted out at the browser should not be asked again.
 */

const COOKIE = 'gl_optout'
const ONE_YEAR = 365 * 24 * 60 * 60

function readOptOut(): boolean {
  try {
    return new RegExp(`(?:^|; )${COOKIE}=1(?:;|$)`).test(document.cookie)
  } catch {
    return false
  }
}

function readGpc(): boolean {
  try {
    return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  } catch {
    return false
  }
}

// Neither the cookie nor the GPC signal notifies anybody when it changes, so
// there is nothing to subscribe to; the store is read on render, in the
// browser only (the server snapshot is "not known yet", which renders nothing).
const noSubscribe = () => () => {}

export function PrivacyChoicesControl() {
  const stored = useSyncExternalStore(noSubscribe, readOptOut, () => null)
  const gpc = useSyncExternalStore(noSubscribe, readGpc, () => false)
  const [chosen, setChosen] = useState<boolean | null>(null)
  const [changed, setChanged] = useState(false)
  const optedOut = chosen ?? stored

  function set(next: boolean) {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = next
      ? `${COOKIE}=1; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`
      : `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
    setChosen(next)
    setChanged(true)
  }

  if (optedOut === null) return null

  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] bg-white p-4 text-[15px]">
      {gpc ? (
        <p className="m-0">
          <strong>Your browser is sending a Global Privacy Control signal</strong>, so you are already
          opted out on this site: no advertising tags run for you and nothing about your visit or
          enquiry is shared with advertising platforms.
        </p>
      ) : optedOut ? (
        <>
          <p className="m-0">
            <strong>You have opted out</strong> of the sale or sharing of your personal information on
            this site, on this browser.
          </p>
          <button
            type="button"
            onClick={() => set(false)}
            className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm font-semibold"
          >
            Opt back in
          </button>
        </>
      ) : (
        <>
          <p className="m-0">
            You are not opted out. Opting out stops the advertising tags described above from running
            for you, and stops us sending details of your enquiry to advertising platforms.
          </p>
          <button
            type="button"
            onClick={() => set(true)}
            className="mt-3 rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-white"
          >
            Do not sell or share my personal information
          </button>
        </>
      )}
      {changed && (
        <p className="mt-2 mb-0 text-sm text-[var(--tx-muted)]" role="status">
          Saved for this browser. It applies from the next page you open on this site.
        </p>
      )}
    </div>
  )
}
