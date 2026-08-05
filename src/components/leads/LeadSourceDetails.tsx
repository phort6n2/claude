'use client'

import { ExternalLink } from 'lucide-react'
import { ChannelBadge } from './ChannelBadge'
import { formatUrlForDisplay } from '@/lib/lead-display'
import type { LeadAttribution } from '@/lib/lead-channel'

interface SourceDetailFields extends LeadAttribution {
  landingPageUrl?: string | null
  formName?: string | null
  duplicates?: LeadAttribution[] | null
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-xs text-gray-500 shrink-0 w-14">{label}</span>
      <div className="min-w-0 flex-1 text-xs text-gray-700">{children}</div>
    </div>
  )
}

/**
 * "Where did this lead come from" — the channel badge plus the page they
 * actually submitted on and what referred them. Shown when a lead is expanded.
 */
export function LeadSourceDetails({ lead }: { lead: SourceDetailFields }) {
  const page = formatUrlForDisplay(lead.landingPageUrl)
  const referrer = formatUrlForDisplay(lead.referrerUrl)

  return (
    <div className="space-y-1.5 pt-2 border-t border-gray-100">
      <Row label="Source">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <ChannelBadge lead={lead} />
          {lead.utmCampaign && <span className="text-gray-600">{lead.utmCampaign}</span>}
        </span>
      </Row>

      {page && (
        <Row label="Page">
          {lead.landingPageUrl?.startsWith('http') ? (
            <a
              href={lead.landingPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={lead.landingPageUrl}
              className="text-blue-600 hover:underline inline-flex items-center gap-1 break-all"
            >
              {page}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="break-all">{page}</span>
          )}
        </Row>
      )}

      {referrer && (
        <Row label="From">
          <span className="break-all text-gray-600" title={lead.referrerUrl ?? undefined}>
            {referrer}
          </span>
        </Row>
      )}

      {lead.formName && <Row label="Form">{lead.formName}</Row>}
    </div>
  )
}
