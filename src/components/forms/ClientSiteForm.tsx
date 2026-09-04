'use client'

import { useState } from 'react'
import { Loader2, Check, AlertCircle, Star } from 'lucide-react'
import SiteContentEditor from '@/components/admin/SiteContentEditor'
import { errorFrom } from '@/lib/http-error'
import CustomDomainsCard from '@/components/admin/CustomDomainsCard'
import CityContentEditor from '@/components/admin/CityContentEditor'
import PhotoManager from '@/components/admin/PhotoManager'
import LogoCard from '@/components/admin/LogoCard'
import ServiceAreaPlanner from '@/components/admin/ServiceAreaPlanner'
import SiteScriptsCard from '@/components/admin/SiteScriptsCard'

/**
 * "Website" tab — the client's hosted site: which address it lives at, and
 * everything on it.
 *
 * ONE write path. The importer writes some of what it finds to the client
 * record (logo, service areas) and the rest to site content; both are
 * committed by the content editor's autosave, so an import can never be
 * half-saved.
 */
export default function ClientSiteForm({
  client,
}: {
  client: {
    id: string
    slug: string
    businessName: string
    siteSubdomain: string | null
    logoUrl: string | null
    footerLogoUrl: string | null
    serviceAreas: string[]
    headScripts: string | null
    bodyEndScripts: string | null
  }
}) {
  const [subdomainInput, setSubdomainInput] = useState(client.siteSubdomain || '')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionMessage, setProvisionMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [reviewsMessage, setReviewsMessage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)

  // Staged client-record fields the importer may set; flushed by the content save.
  const [pendingLogo, setPendingLogo] = useState<string | null>(null)
  const [pendingAreas, setPendingAreas] = useState<string[] | null>(null)

  async function persistClientFields() {
    if (!pendingLogo && !pendingAreas) return
    const patch: Record<string, unknown> = {}
    if (pendingLogo) patch.logoUrl = pendingLogo
    if (pendingAreas) {
      const existing = client.serviceAreas || []
      const lower = new Set(existing.map((a) => a.toLowerCase()))
      patch.serviceAreas = [...existing, ...pendingAreas.filter((a) => !lower.has(a.toLowerCase()))]
    }
    const res = await fetch(`/api/clients/${client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      // Carrying what the server said, not a fixed sentence. "Failed to save
      // imported logo/service areas" was true and useless: the actual cause
      // was a 500 from a missing image library, and nothing on screen could
      // have told anybody that.
      const detail = await errorFrom(res, `the server answered ${res.status}`)
      throw new Error(`The imported logo and service areas did not save — ${detail}`)
    }
    setPendingLogo(null)
    setPendingAreas(null)
  }

  async function connectSubdomain() {
    if (!subdomainInput.trim()) return
    setProvisioning(true)
    setProvisionMessage(null)
    try {
      const res = await fetch(`/api/clients/${client.id}/provision-subdomain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: subdomainInput }),
      })
      const data = await res.json()
      if (data.error) {
        setProvisionMessage({ ok: false, text: data.error })
      } else {
        const failed = (data.steps || []).filter((s: { ok: boolean }) => !s.ok)
        setProvisionMessage(
          data.ok
            ? { ok: true, text: `Connected — https://${data.domain} will be live within a few minutes.` }
            : {
                ok: false,
                text: failed.map((s: { step: string; detail: string }) => `${s.step}: ${s.detail}`).join(' · '),
              }
        )
      }
    } catch {
      setProvisionMessage({ ok: false, text: 'Provisioning failed' })
    } finally {
      setProvisioning(false)
    }
  }

  async function refreshReviews(force = false) {
    setRefreshing(true)
    setReviewsMessage(null)
    try {
      const res = await fetch(`/api/clients/${client.id}/refresh-reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await res.json()
      setReviewsMessage(data.message || (data.ok ? 'Reviews refreshed.' : 'Refresh failed.'))
      setRateLimited(data.rateLimited === true)
    } catch {
      setReviewsMessage('Refresh failed.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Applies immediately — separated from the staged content below */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Site address</h2>
          <p className="text-sm text-gray-500">Applies immediately — no save needed.</p>
        </div>
        <div className="p-6 pt-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Subdomain</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={subdomainInput}
              onChange={(e) => setSubdomainInput(e.target.value)}
              placeholder="collision"
              className="px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">.glassleads.app</span>
            <button
              type="button"
              onClick={connectSubdomain}
              disabled={provisioning || !subdomainInput.trim()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {provisioning && <Loader2 className="h-4 w-4 animate-spin" />}
              {client.siteSubdomain ? 'Reconnect' : 'Connect'}
            </button>
            <button
              type="button"
              onClick={() => refreshReviews(false)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
              Refresh Google reviews
            </button>
            {/* Only after the weekly gate has actually refused. The gate is
                there because every call costs money and review counts do not
                move fast enough to justify polling — but it also holds back a
                change to WHICH reviews qualify for up to seven days, since the
                stored quotes are only rewritten by a fetch. */}
            {rateLimited && (
              <button
                type="button"
                onClick={() => refreshReviews(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Fetch anyway (costs a Places call)
              </button>
            )}
          </div>
          {provisionMessage && (
            <p className={`text-sm flex items-start gap-1.5 ${provisionMessage.ok ? 'text-green-700' : 'text-red-700'}`}>
              {provisionMessage.ok ? <Check className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
              {provisionMessage.text}
            </p>
          )}
          {reviewsMessage && <p className="text-sm text-gray-600">{reviewsMessage}</p>}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Custom domain</h2>
          <p className="text-sm text-gray-500">
            The client&apos;s own domain, pointed at this site
          </p>
        </div>
        <CustomDomainsCard
          clientId={client.id}
          subdomain={`${client.siteSubdomain || client.slug}.glassleads.app`}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Logo</h2>
          <p className="text-sm text-gray-500">
            What the header and the footer draw — and what watermarks the photos
          </p>
        </div>
        <LogoCard
          clientId={client.id}
          headerLogoUrl={pendingLogo || client.logoUrl}
          footerLogoUrl={client.footerLogoUrl}
          businessName={client.businessName}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Photos</h2>
          <p className="text-sm text-gray-500">
            Real photos of the shop and the work, watermarked with the logo
          </p>
        </div>
        <PhotoManager
          listUrl={`/api/clients/${client.id}/photos`}
          uploadUrl={`/api/clients/${client.id}/photos`}
          deleteUrl={`/api/clients/${client.id}/photos`}
          patchUrl={`/api/clients/${client.id}/photos`}
          hasLogo={!!(pendingLogo || client.logoUrl)}
          emptyHint="The first photo becomes the washed background behind the hero; the rest fill the gallery. Photos of the actual van, bay and vehicles beat stock every time."
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Custom scripts</h2>
          <p className="text-sm text-gray-500">
            Tags you want on every page of this shop&apos;s site — yours to set, not the
            client&apos;s
          </p>
        </div>
        <SiteScriptsCard
          clientId={client.id}
          headScripts={client.headScripts}
          bodyEndScripts={client.bodyEndScripts}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Location pages</h2>
          <p className="text-sm text-gray-500">
            Which cities get a page, and what each one says that no other says
          </p>
        </div>
        <ServiceAreaPlanner clientId={client.id} serviceAreas={client.serviceAreas || []} />
        <CityContentEditor clientId={client.id} previewBase={`/sites/${client.slug}`} />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-6">
          <SiteContentEditor
            clientId={client.id}
            onLogoFound={(url) => setPendingLogo(url)}
            onAreasFound={(areas) => setPendingAreas(areas)}
            persistClientFields={persistClientFields}
          />
        </div>
      </section>
    </div>
  )
}
