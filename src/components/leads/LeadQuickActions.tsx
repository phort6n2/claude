'use client'

import { Phone, MessageSquare, Mail } from 'lucide-react'
import { telHref, smsHref, firstTextTo, type FirstTextInput } from '@/lib/contact-links'

/**
 * Call / Text / Email for one lead, identical everywhere a lead is shown.
 *
 * Three lists rendered these buttons separately and they had already drifted:
 * all three passed the raw stored phone straight into `tel:` and `sms:`, so a
 * number saved as "(503) 555-0142" opened the dialler with whatever the OS
 * made of the punctuation. Text also opened an empty message, which is the
 * moment a busy shop owner gives up and calls instead — or does nothing.
 */
export function LeadQuickActions({
  phone,
  email,
  lead,
  className = '',
}: {
  phone: string | null | undefined
  email: string | null | undefined
  /** Everything the pre-written first text is built from. */
  lead: FirstTextInput
  className?: string
}) {
  const tel = telHref(phone)
  const sms = smsHref(phone, firstTextTo(lead))

  const base =
    'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-white rounded-lg text-sm font-medium'

  return (
    <>
      {tel && (
        <a
          href={tel}
          className={`${base} bg-green-500 hover:bg-green-600 active:bg-green-700 ${className}`}
        >
          <Phone className="h-4 w-4" />
          Call
        </a>
      )}
      {sms && (
        <a
          href={sms}
          className={`${base} bg-purple-500 hover:bg-purple-600 active:bg-purple-700 ${className}`}
        >
          <MessageSquare className="h-4 w-4" />
          Text
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          className={`${base} bg-blue-500 hover:bg-blue-600 active:bg-blue-700 ${className}`}
        >
          <Mail className="h-4 w-4" />
          Email
        </a>
      )}
    </>
  )
}
