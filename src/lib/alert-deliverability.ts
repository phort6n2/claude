import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { formatUsPhone } from '@/lib/contact-links'

/**
 * Tell a shop to let our alerts through, and say exactly how.
 *
 * This is not filler copy. A lead alert is a message from an address the shop
 * has never corresponded with, carrying a phone number and a link, sent to a
 * small-business inbox — which is the exact profile of the mail that lands in
 * spam. The text alert has the same problem: an unknown number sending a link
 * is what iOS "Filter Unknown Senders" and every Android spam filter exist to
 * catch.
 *
 * The cost of losing one is not an unread email. It is a customer who called
 * the next shop down the list, and a platform that looks like it does not
 * work — which is how it gets described before anyone thinks to check a spam
 * folder.
 *
 * So the addresses are read from the configuration that actually sends, not
 * hardcoded here. Instructions naming the wrong sender are worse than none:
 * somebody follows them, whitelists an address we do not send from, and now
 * believes it is handled.
 */

async function setting(key: string): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (!row) return process.env[key] || null
    if (row.encrypted) {
      try {
        return decrypt(row.value)
      } catch {
        return null
      }
    }
    return row.value
  } catch {
    return process.env[key] || null
  }
}

export interface AlertSenders {
  /** The address lead alerts actually come from. */
  emailAddress: string | null
  /** The name that appears in the sender column. */
  emailName: string
  /** The number texts come from, when SMS is configured. */
  smsNumber: string | null
}

export async function alertSenders(): Promise<AlertSenders> {
  const configured = (await setting('RESEND_FROM')) || 'GlassLeads <leads@glassleads.app>'
  const emailAddress = /<([^>]+)>/.exec(configured)?.[1] || configured
  // Stored in E.164 because Twilio requires it; shown as a human would write
  // it, because a person is retyping it into their contacts by hand. Every
  // surface that names this number reads it from here, so the formatting
  // happens once.
  const smsNumber = formatUsPhone(await setting('TWILIO_FROM_NUMBER'))
  return {
    emailAddress: emailAddress || null,
    // Fixed, and worth naming in the instructions — a shop owner triages by
    // sender, and this is what they will be looking for.
    emailName: 'AUTO GLASS LEAD',
    smsNumber: smsNumber || null,
  }
}

export interface DeliverabilityStep {
  platform: string
  steps: string[]
}

export function emailWhitelistSteps(address: string): DeliverabilityStep[] {
  return [
    {
      platform: 'Gmail',
      steps: [
        `Open Contacts (contacts.google.com) → Create contact → add ${address}. Mail from a contact is not filtered as spam.`,
        `Then Gmail → Settings → Filters and Blocked Addresses → Create a new filter → From: ${address} → Create filter → tick "Never send it to Spam" and "Always mark it as important".`,
        'If one already landed in Spam, open it and press "Report not spam" — that teaches the filter faster than anything else.',
      ],
    },
    {
      platform: 'Outlook / Microsoft 365',
      steps: [
        `Settings → Mail → Junk email → Safe senders and domains → Add ${address}.`,
        'Save. Anything already in Junk from that address should be moved to Inbox by hand once.',
      ],
    },
    {
      platform: 'Apple Mail / iCloud',
      steps: [
        `Add ${address} to your Contacts on the iPhone.`,
        'Mail → Settings → Junk Mail → make sure "Trust email from my contacts" is on.',
      ],
    },
    {
      platform: 'Anything else',
      steps: [
        `Add ${address} to your contacts or address book.`,
        'Find the spam/junk settings and add it as a safe or allowed sender.',
      ],
    },
  ]
}

export function smsWhitelistSteps(number: string): DeliverabilityStep[] {
  return [
    {
      platform: 'iPhone',
      steps: [
        `Save ${number} as a contact — call it "Auto Glass Leads".`,
        'Settings → Apps → Messages → turn OFF "Filter Unknown Senders", or the first alert sits in a separate tab with no notification.',
        'Settings → Notifications → Messages → Allow Notifications on, and set Alerts to persist on the Lock Screen.',
      ],
    },
    {
      platform: 'Android',
      steps: [
        `Save ${number} as a contact — call it "Auto Glass Leads".`,
        'Messages → ⋮ → Spam & blocked → make sure the number is not there.',
        'On Samsung: Messages → Settings → Block numbers and spam → turn off "Block unknown senders" for this number.',
      ],
    },
  ]
}

/**
 * The whole thing, ready to render. Sections whose sender is not configured
 * are omitted rather than shown with a blank — instructions to whitelist
 * "null" are worse than no instructions.
 */
export async function deliverabilityGuide(): Promise<{
  senders: AlertSenders
  email: DeliverabilityStep[]
  sms: DeliverabilityStep[]
}> {
  const senders = await alertSenders()
  return {
    senders,
    email: senders.emailAddress ? emailWhitelistSteps(senders.emailAddress) : [],
    sms: senders.smsNumber ? smsWhitelistSteps(senders.smsNumber) : [],
  }
}
