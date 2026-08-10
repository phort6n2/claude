'use client'

import { useState } from 'react'
import { useDirtyForm, confirmDiscard } from '@/hooks/useDirtyForm'
import SaveBar from '@/components/forms/SaveBar'
import WebhookDestinationsManager from '@/components/admin/WebhookDestinationsManager'
import CopyField from '@/components/admin/CopyField'
import LeadNotificationsCard from '@/components/admin/LeadNotificationsCard'

/**
 * "Lead delivery" tab — everything touched when a client says "I stopped
 * getting leads": where leads are forwarded, which sites may post to us, and
 * call coaching.
 *
 * Webhook destinations apply immediately (they are verb buttons); the typed
 * fields below stage until Save.
 */
export default function ClientLeadsForm({
  client,
}: {
  client: { id: string; slug: string; allowedOrigins: string[]; callCoachingEnabled: boolean | null }
}) {
  interface LeadsFields { allowedOrigins: string[]; callCoachingEnabled: boolean }
  const { values: formData, setField, dirtyFields, isDirty, changedPayload, commit, discard } =
    useDirtyForm<LeadsFields>({
      allowedOrigins: client.allowedOrigins || [],
      callCoachingEnabled: client.callCoachingEnabled ?? true,
    })
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
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
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
            Who hears about a lead, and how fast
          </p>
        </div>
        <LeadNotificationsCard clientId={client.id} />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Where leads go</h2>
          <p className="text-sm text-gray-500">
            Every lead is stored here first, then forwarded to each enabled destination. Changes
            below apply immediately.
          </p>
        </div>
        <div className="p-6 pt-4">
          <WebhookDestinationsManager clientId={client.id} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-6 pt-5 pb-1">
          <h2 className="font-semibold text-gray-900">Where leads come from</h2>
          <p className="text-sm text-gray-500">
            Sites allowed to post to this client&apos;s webhook, and the snippets to install.
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
          <h2 className="font-semibold text-gray-900">Call coaching</h2>
          <p className="text-sm text-gray-500">Score and coach recorded calls for this client.</p>
        </div>
        <div className="p-6 pt-4">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.callCoachingEnabled ?? true}
              onChange={(e) => updateField('callCoachingEnabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            <span className="ml-3 text-sm text-gray-700">
              {formData.callCoachingEnabled ?? true ? 'Enabled' : 'Disabled'}
            </span>
          </label>
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
