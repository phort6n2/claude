import { prisma } from '@/lib/db'

/**
 * The portal invite — a MANUAL action, on purpose.
 *
 * Approval used to send this automatically, and that put the shop inside
 * the portal while the site was still half-built: no photos, no logo, a
 * walkthrough pointing at alerts that were not wired yet. First impressions
 * are the product here. So approval creates the account's raw material and
 * says nothing, and the operator sends this from the client page when they
 * decide the setup is worth looking at.
 */
export async function sendPortalInvite(
  clientId: string,
  email: string,
  name?: string | null
): Promise<{ emailed: boolean; to?: string; note?: string }> {
  const addr = email.toLowerCase().trim()
  if (!addr) return { emailed: false, note: 'No email address to send to.' }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true },
  })
  if (!client) return { emailed: false, note: 'Client not found.' }

  try {
    const existing = await prisma.clientUser.findUnique({
      where: { email: addr },
      select: { clientId: true },
    })
    // Emails are one login each, platform-wide. An address already attached
    // to ANOTHER client is not silently reassigned — that would swap someone
    // out of their own portal because two shops share a bookkeeper.
    if (existing && existing.clientId !== clientId) {
      return {
        emailed: false,
        note: `${addr} already signs in to a different client's portal. Use a different address.`,
      }
    }
    if (!existing) {
      await prisma.clientUser.create({ data: { clientId, email: addr, name: name || null } })
    }

    const { createMagicLink } = await import('@/lib/portal-auth')
    const { portalVerifyUrl, sendPortalReadyEmail } = await import('@/lib/portal-email')
    const link = await createMagicLink(addr)
    const base = process.env.APP_URL || 'https://glassleads.app'
    // A link that could not be minted degrades to the login page, where a
    // fresh one is self-serve — never a broken button in the one email that
    // announces the account works.
    const url = link.success && link.token ? portalVerifyUrl(link.token) : `${base}/portal/login`

    const sent = await sendPortalReadyEmail({ to: addr, businessName: client.businessName, url })
    if (!sent.ok) {
      return { emailed: false, note: `The invite email failed: ${sent.error}` }
    }
    return { emailed: true, to: addr }
  } catch (error) {
    return {
      emailed: false,
      note: `The invite failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }
}
