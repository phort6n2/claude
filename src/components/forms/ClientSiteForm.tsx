'use client'

import { useState } from 'react'
import { Loader2, Check, AlertCircle, Star } from 'lucide-react'
import SiteContentEditor from '@/components/admin/SiteContentEditor'

/**
 * "Website" tab — the client's hosted site: which address it lives at, and
 * everything on it.
 *
 * ONE save. The importer writes some of what it finds to the client record
 * (logo, service areas) and the rest to site content; both are committed by
 * the single Save inside the content editor, so an import can never be
 * half-saved.
 */
export default function ClientSiteForm({
  client,
}: {
  client: { id: string; slug: string; siteSubdomain: string | null; logoUrl: string | null; serviceAreas: string[] }
}) {
  const [subdomainInput, setSubdomainInput] = useState(client.siteSubdomain || '')
  const [provisioning, setProvisioning] = useState(false)
  const [provisionMessage, setProvisionMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [reviewsMessage, setReviewsMessage] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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
    if (!res.ok) throw new Error('Failed to save imported logo/service areas')
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

  async function refreshReviews() {
    setRefreshing(true)
    setReviewsMessage(null)
    try {
      const res = await fetch(`/api/clients/${client.id}/refresh-reviews`, { method: 'POST' })
      const data = await res.json()
      setReviewsMessage(data.message || (data.ok ? 'Reviews refreshed.' : 'Refresh failed.'))
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
              onClick={refreshReviews}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
              Refresh Google reviews
            </button>
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
