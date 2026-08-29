'use client'

import { useState } from 'react'
import { useDirtyForm, confirmDiscard } from '@/hooks/useDirtyForm'
import SaveBar from '@/components/forms/SaveBar'
import WebhookDestinationsManager from '@/components/admin/WebhookDestinationsManager'
import CopyField from '@/components/admin/CopyField'
import LeadNotificationsCard from '@/components/admin/LeadNotificationsCard'
import TrackingNumbersCard from '@/components/admin/TrackingNumbersCard'
import SiteDisplayPhoneCard from '@/components/admin/SiteDisplayPhoneCard'
import CallCoachingToggle from '@/components/admin/CallCoachingToggle'
import { errorFrom } from '@/lib/http-error'

/**
 * "Lead delivery" tab — everything touched when a client says "I stopped
 * getting leads": where leads are forwarded, which sites may post to us, and
 * call coaching.
 *
 * Ordered the way a shop is wired: where leads come FROM, then where they go,
 * then who is told, with call tracking beside the coaching it feeds. Intake
 * used to be last, which is the first thing configured for a new shop.
 *
 * Four save models lived on this page and only one of them said so. Each card
 * now states its own behaviour in its subtitle, and the save bar is down to a
 * single card — call coaching autosaves next to the tracking numbers it
 * depends on rather than staging behind a button two sections away.
 */
export default function ClientLeadsForm({
  client,
}: {
  client: {
    id: string
    slug: string
    allowedOrigins: string[]
    callCoachingEnabled: boolean | null
    phone?: string
    siteDisplayPhone?: string | null
  }
}) {
  // Only the origins list stages now. Everything else on this tab either
  // autosaves or has its own button, and each says which in its subtitle.
  interface LeadsFields { allowedOrigins: string[] }
  const { values: formData, setField, dirtyFields, isDirty, changedPayload, commit, discard } =
    useDirtyForm<LeadsFields>({ allowedOrigins: client.allowedOrigins || [] })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const updateField = <K extends keyof LeadsFields>(field: K, value: LeadsFields[K]) => {
    setField(field, value)
    setMessage(null)
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changedPayload()),
      })
      // Not res.json() — a route that fails before it can answer sends back
      // an HTML error page, and parsing that reported "Unexpected token '<'"
      // to whoever was trying to save.
      if (!res.ok) throw new Error(await errorFrom(res))
      commit()
      setMessage({ ok: true, text: 'Saved.' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const webhookUrl = `https://glassleads.app/api/webhooks/highlevel/lead?client=${client.slug}`
  const embed = `<script src="https://glassleads.app/widget.js" data-client="${client.slug}" async></script>\n<div data-glassleads-widget></div>`

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Lead alerts</h2>
          <p className="text-sm text-gray-500">
            Who hears about a lead, and how fast.{' '}
            <span className="text-gray-400">Saves when you press Save notifications.</span>
          </p>
        </div>
        <LeadNotificationsCard clientId={client.id} />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Call tracking</h2>
          <p className="text-sm text-gray-500">
            Twilio numbers that ring this shop, so calls become leads and get coached.{' '}
            <span className="text-gray-400">Saves as you change it.</span>
          </p>
        </div>
        <TrackingNumbersCard clientId={client.id} />
        <SiteDisplayPhoneCard
          clientId={client.id}
          initialValue={client.siteDisplayPhone ?? null}
          realPhone={client.phone || 'the shop’s own number'}
        />
        <CallCoachingToggle
          clientId={client.id}
          initialEnabled={client.callCoachingEnabled ?? true}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Where leads come from</h2>
          <p className="text-sm text-gray-500">
            Sites allowed to post to this client&apos;s webhook, and the snippets to install.{' '}
            <span className="text-gray-400">Saves when you press Save changes.</span>
          </p>
        </div>
        <div className="p-6 pt-4 space-y-4">
          <CopyField label="Inbound webhook URL" value={webhookUrl} />
          <CopyField label="Widget embed snippet" value={embed} multiline />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outside websites allowed to send leads
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Only pages this app serves can send leads — the hosted site and any custom domain
              pointed here work automatically and must not be listed. Add an origin here only to
              embed the widget on a site we did not build, such as an existing WordPress site.
              Anything listed here can post leads into this client&apos;s account.
            </p>
            <textarea
              value={(formData.allowedOrigins || []).join('\n')}
              onChange={(e) =>
                updateField(
                  'allowedOrigins',
                  e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)
                )
              }
              rows={4}
              className="w-full px-3 py-2 border rounded-md font-mono text-sm focus:ring-2 focus:ring-blue-500"
              placeholder={'https://example.com\nhttps://www.example.com'}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Where leads go</h2>
          <p className="text-sm text-gray-500">
            Every lead is stored here first, then forwarded to each enabled destination.{' '}
            <span className="text-gray-400">Applies immediately.</span>
          </p>
        </div>
        <div className="p-6 pt-4">
          <WebhookDestinationsManager clientId={client.id} />
        </div>
      </section>

      <SaveBar
        dirtyCount={dirtyFields.size}
        saving={saving}
        message={message}
        onSave={handleSave}
        onDiscard={() => { if (confirmDiscard(isDirty)) discard() }}
      />
    </div>
  )
}
