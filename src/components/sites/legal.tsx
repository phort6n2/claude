import { SiteBaseStyles, telHrefFor, type SiteClient } from '@/components/sites/shared'
import { SiteAnalytics } from '@/components/sites/analytics'
import { sitePaletteVars } from '@/lib/site-theme'
import { canonicalHostFor } from '@/lib/site-origin'

/**
 * Legal pages (privacy / terms) for hosted client sites, ported from the
 * landing-template's legal-privacy.html / legal-terms.html and adapted to
 * describe what THIS platform actually does (form fields, localStorage
 * attribution, lead delivery, Google embeds). Everything renders from the
 * client record; regulator lines appear only when a registration is set.
 */

export interface LegalClient extends SiteClient {
  email?: string | null
  siteSubdomain?: string | null
  clarityProjectId?: string | null
  /** Pre-filtered to the primary domain, so this policy names the address the
   *  reader is actually on rather than the platform subdomain behind it. */
  domains?: Array<{ domain: string; verified: boolean; misconfigured: boolean }>
}

function domainFor(client: LegalClient) {
  return canonicalHostFor(client)
}

export function LegalShell({
  client,
  title,
  basePath,
  registrationNumber,
  pages = [],
  children,
}: {
  client: LegalClient
  title: string
  basePath: string
  registrationNumber?: string | null
  /** Pages kept from the shop's old site — the same list as the main footer. */
  pages?: Array<{ path: string; title: string }>
  children: React.ReactNode
}) {
  const palette = sitePaletteVars(client.primaryColor, client.accentColor)
  const year = new Date().getFullYear()
  return (
    <div
      className="gl-site min-h-screen bg-[var(--paper)] text-[var(--tx)] leading-[1.62]"
      style={palette as React.CSSProperties}
    >
      <SiteBaseStyles />
      <SiteAnalytics projectId={client.clarityProjectId} slug={client.slug} pageType="legal" />
      <header className="border-b border-[var(--line)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 min-h-[64px] flex items-center justify-between gap-4">
          <a href={basePath || '/'} className="font-bold no-underline text-[var(--brand)]">
            ← Back to site
          </a>
          <a
            href={telHrefFor(client.phone)}
            className="font-bold no-underline text-[var(--brand)]"
          >
            {client.phone}
          </a>
        </div>
      </header>
      <main id="main" className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-[clamp(1.875rem,1.5rem+1.5vw,2.6rem)] font-extrabold leading-[1.1] tracking-[-.02em] m-0">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--tx-muted)]">
          Last updated: {year} · Applies to {domainFor(client)}
        </p>
        <div className="mt-8 space-y-8 text-[15px] text-[var(--tx2)] [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-[var(--tx)] [&_h2]:mb-2 [&_h3]:font-bold [&_h3]:text-[var(--tx)] [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mb-1">
          {children}
        </div>
      </main>
      <footer className="border-t border-[var(--line)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 text-sm text-[var(--tx-muted)] space-y-1">
          <div>
            <span className="font-bold text-[var(--tx)]">{client.businessName}</span>
            {client.hasShopLocation && (
              <>
                {' '}
                · {client.streetAddress}, {client.city}, {client.state} {client.postalCode}
              </>
            )}{' '}
            · {client.phone}
          </div>
          {registrationNumber && <div>Registration No. {registrationNumber}</div>}
          {/* This shell has no main footer, so a kept page reached from search
              would otherwise be a dead end with one way back. */}
          {pages.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {pages.map((p) => (
                <a key={p.path} href={`${basePath || ''}${p.path}`} className="text-[var(--brand)]">
                  {p.title}
                </a>
              ))}
            </div>
          )}
          <div>
            © {year} {client.businessName}.{' '}
            <a href={basePath || '/'} className="text-[var(--brand)]">
              Home
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function PrivacyContent({ client }: { client: LegalClient }) {
  return (
    <>
      <p>
        This policy describes what {client.businessName} (&quot;we&quot;, &quot;us&quot;) collects
        through this website, why we collect it, who we share it with, and what you can ask us to
        do about it. It is written for this site specifically: it names the actual fields, the
        actual third parties, and the actual tracking involved.
      </p>
      <section>
        <h2>1. Who we are</h2>
        <p>
          {client.businessName}
          {client.hasShopLocation
            ? `, ${client.streetAddress}, ${client.city}, ${client.state} ${client.postalCode}`
            : `, serving ${client.city}, ${client.state} and nearby`}
          . Phone {client.phone}
          {client.email ? <>. Email {client.email}</> : null}.
        </p>
      </section>
      <section>
        <h2>2. What the quote form collects</h2>
        <p>When you submit the quote form, we receive what you typed into it:</p>
        <ul>
          <li>Full name — so we know who to ask for when we call</li>
          <li>Mobile phone — to call or text you about your quote and appointment</li>
          <li>Email address — to send your quote and appointment confirmation</li>
          <li>Service ZIP code — to confirm the vehicle is somewhere we service</li>
          <li>Service type and vehicle — to identify the correct glass</li>
          <li>VIN (optional) — to identify the exact factory glass variant</li>
          <li>Insurance status and carrier (optional) — to verify coverage before dispatch</li>
          <li>Notes (optional) — anything you choose to tell us about the damage</li>
        </ul>
        <p>
          We do not ask for, and the form does not collect, your policy number, driver&apos;s
          licence number, payment card details, or Social Security number. Please do not enter any
          of those into the form.
        </p>
      </section>
      <section>
        <h2>3. Advertising identifiers captured automatically</h2>
        <p>
          Many visitors reach this site by clicking an ad. When that happens the advertising
          platform adds an identifier to the web address, and we keep it so we can tell which
          advertising produced an enquiry. Specifically, we capture whichever of the following are
          present: Google click identifiers (gclid, gbraid, wbraid), other platform click
          identifiers (msclkid, fbclid, ttclid, li_fat_id), campaign parameters (utm_source,
          utm_medium, utm_campaign, utm_term, utm_content), and page context (the page you landed
          on, the page you submitted from, and the referring website if your browser sent one).
        </p>
        <p>
          These are stored in your browser&apos;s local storage for up to 90 days, so an enquiry
          you send days after clicking the ad is still attributed correctly. They are attached to
          your enquiry when you submit the form. You can clear them at any time by clearing this
          site&apos;s data in your browser.
        </p>
      </section>
      <section>
        <h2>4. Where your enquiry goes</h2>
        <p>
          Form submissions are delivered to the lead-management systems we use to run the shop —
          our website platform and our customer-relationship system — so we can quote, schedule,
          and follow up on your enquiry. We do not sell your information, and we do not share it
          with anyone except the service providers that process it on our behalf.
        </p>
      </section>
      <section>
        <h2>5. Content loaded from third parties</h2>
        <p>
          This site embeds a Google map of our location and displays review content from our
          Google Business Profile. When the map loads, your browser connects to Google, which may
          set its own cookies subject to Google&apos;s privacy policy. Some images on this site are
          served through an image-delivery network.
        </p>
      </section>
      {client.clarityProjectId && (
        <section>
          <h2>6. How this site is measured</h2>
          <p>
            We use a session-analytics service to see how visitors move through this site — which
            pages get read, where people stop scrolling, and which buttons get tapped — so we can
            fix what is confusing. It records page interactions, not the contents of the form:
            what you type into the quote form is excluded from that recording, and we never
            attach your name to it.
          </p>
        </section>
      )}
      <section>
        <h2>{`${client.clarityProjectId ? 7 : 6}. Your choices`}</h2>
        <p>
          You can ask us what information we hold about your enquiry, ask us to correct it, or ask
          us to delete it — call {client.phone}
          {client.email ? <> or email {client.email}</> : null} and we will act on the request. If
          you simply want no follow-up, tell whoever contacts you and we will stop.
        </p>
      </section>
    </>
  )
}

export function TermsContent({
  client,
  warrantyTitle,
  warrantyText,
  registrationNumber,
}: {
  client: LegalClient
  warrantyTitle?: string | null
  warrantyText?: string | null
  registrationNumber?: string | null
}) {
  return (
    <>
      <p>
        These terms cover your use of this website and the auto glass work we perform. By using
        this site or booking work with us, you agree to them. Nothing here removes any right you
        have under your state&apos;s law that cannot be waived.
      </p>
      <section>
        <h2>1. Who you are dealing with</h2>
        <p>
          {client.businessName}
          {client.hasShopLocation
            ? `, with our place of business at ${client.streetAddress}, ${client.city}, ${client.state} ${client.postalCode}`
            : `, serving ${client.city}, ${client.state} and the surrounding area`}
          .{registrationNumber ? ` Our repair-dealer registration number is ${registrationNumber}.` : ''}
        </p>
      </section>
      <section>
        <h2>2. Quotes and estimates</h2>
        <p>
          Any figure we give you before we have seen the vehicle is an estimate, not a fixed
          contract price. We work to make estimates accurate — that is why we ask for your VIN,
          which identifies the exact glass your vehicle takes — but the final price depends on the
          glass actually required and the work actually needed. If the job differs from what was
          described, we will tell you the revised price and get your authorization before
          proceeding. We will not do work you have not agreed to.
        </p>
        <h3>Repair versus replacement</h3>
        <p>
          We will tell you honestly whether your damage can be repaired or needs replacing. A
          repair is only appropriate while the damage is small, away from the edge of the glass,
          and outside the driver&apos;s primary line of sight. If we recommend replacement, it is
          because a repair would not be safe or would not hold.
        </p>
      </section>
      <section>
        <h2>3. Safe drive-away time</h2>
        <p>
          After a bonded glass replacement, the adhesive needs time to cure before it can perform
          in a collision. That period — the safe drive-away time — is set by the adhesive
          manufacturer&apos;s specification and varies with the product, temperature, and humidity
          on the day. We will tell you the applicable time before we finish. Do not drive the
          vehicle before that time has elapsed; doing so can compromise the bond, and any
          resulting failure is not covered by our warranty.
        </p>
      </section>
      {warrantyText && (
        <section>
          <h2>4. {warrantyTitle || 'Workmanship warranty'}</h2>
          <p className="whitespace-pre-line">{warrantyText}</p>
        </section>
      )}
      <section>
        <h2>{warrantyText ? '5' : '4'}. Insurance work</h2>
        <p>
          If you file a claim, we work with your insurance company on your behalf, but our
          customer is you. You are entitled to choose your own repair shop; your insurer cannot
          require you to use a particular one. Your policy&apos;s coverage and deductible are set
          by your insurance contract, not by us, and we will confirm what applies before work
          begins.
        </p>
      </section>
      <section>
        <h2>{warrantyText ? '6' : '5'}. This website</h2>
        <p>
          The content on this site is provided in good faith for general information about our
          services. Review figures shown on this site are drawn from our live Google Business
          Profile at the time the page was generated. We may update this site and these terms at
          any time; the version published here applies.
        </p>
      </section>
    </>
  )
}
