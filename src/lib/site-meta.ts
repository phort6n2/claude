import { prisma } from '@/lib/db'
import { getInsuranceProgram } from '@/lib/site-content'
import { networkHighlight } from '@/lib/insurance-programs'
import type { DescriptionFacts } from '@/lib/meta-description'

/**
 * The facts a meta description may state, loaded the same way for every page
 * type so no two pages can disagree about whether the shop is in a network.
 * Defensive like the page reads: a missing table costs the sentence, not the
 * page's metadata.
 */
export async function descriptionFacts(
  client: { id: string; businessName: string; filesInsuranceClaims: boolean; offersMobileService: boolean },
  phone: string
): Promise<DescriptionFacts> {
  const [program, reviews] = await Promise.all([
    getInsuranceProgram(client.id),
    prisma.clientGbpReviews
      .findUnique({ where: { clientId: client.id }, select: { rating: true, reviewCount: true } })
      .catch(() => null),
  ])
  const network = networkHighlight(program.program, program.record, {
    businessName: client.businessName,
    filesClaims: client.filesInsuranceClaims,
  })
  return { networkLabel: network?.label ?? null, mobile: client.offersMobileService, rating: reviews, phone }
}
