import type { Metadata } from 'next'
import Link from 'next/link'
import { PhoneCall, MessagesSquare, Globe2, LineChart } from 'lucide-react'

/**
 * The page behind the "Powered by GlassLeads" link in every client site's
 * footer. Until the real sales page is written this is deliberately a brand
 * card, not a pitch: what the platform does, in one screen, with no invented
 * contact details, pricing, or claims. It replaces a bare redirect to the
 * admin login — the person clicking that footer link is a shop owner sizing
 * us up, and a login form told them nothing.
 */

export const metadata: Metadata = {
  title: 'GlassLeads — lead capture, call coaching, and websites for auto glass shops',
  description:
    'GlassLeads runs the lead pipeline for auto glass shops: instant lead alerts by text and email, tracked and recorded calls for coaching, fast hosted websites, and ad attribution that follows the job all the way to booked.',
}

const FEATURES = [
  {
    icon: MessagesSquare,
    title: 'Instant lead alerts',
    text: 'Every quote request hits the shop’s phones by text and email the moment it lands — with one-tap call, text-back, and “we booked it” buttons.',
  },
  {
    icon: PhoneCall,
    title: 'Call tracking & coaching',
    text: 'Tracking numbers record the calls your ads generate, so missed calls get caught the same day and the person answering gets coached, not guessed at.',
  },
  {
    icon: Globe2,
    title: 'Websites that book work',
    text: 'A fast hosted site built from the shop’s real photos, real warranty, and real service area — with a quote form wired straight into the alerts.',
  },
  {
    icon: LineChart,
    title: 'Attribution to the dollar',
    text: 'Leads keep their ad click all the way through, and booked jobs flow back into Google Ads — so budget follows the campaigns that actually sell glass.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      <header className="max-w-5xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <div className="text-lg font-bold tracking-tight text-white">
          Glass<span className="text-sky-400">Leads</span>
        </div>
        <Link
          href="/admin/dashboard"
          className="text-sm font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-4 py-2 transition-colors"
        >
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-5xl w-full mx-auto px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-sky-400 mb-4">
            For auto glass shops
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.1]">
            The lead pipeline, run like it&apos;s your best employee.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
            GlassLeads captures the leads your ads and website generate, gets them to your
            phone in seconds, records the calls so you can coach what happens next, and
            follows every booked job back to the ad that paid for it.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <f.icon className="h-6 w-6 text-sky-400" aria-hidden="true" />
                <h2 className="mt-3 text-base font-semibold text-white">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto px-6 py-8 text-sm text-slate-500 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70">
        <span>© {new Date().getFullYear()} GlassLeads</span>
        <span>Websites, alerts, and call coaching for auto glass shops.</span>
      </footer>
    </div>
  )
}
