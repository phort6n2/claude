/**
 * Does this business HAVE a Google Business Profile?
 *
 * A missing Place ID used to mean one thing to every check here: somebody has
 * not linked it yet. That is a real fault for most shops — no rating on the
 * site, no rank grid, a red cross until it is fixed — and it is not a fault at
 * all for a shop that has no profile to link. Diamond is the case that showed
 * it: two red crosses on the health board that no amount of work could clear.
 *
 * The two cannot be told apart from the data, so an operator answers it (the
 * tick on the Business tab). A stored Place ID ALWAYS wins over the tick: the
 * tick is a statement about an absence, and a linked listing is proof against
 * it, so a shop that gets a profile later is checked again the moment it is
 * linked, without anybody remembering to untick anything.
 *
 * Leaf module, no imports, so the health board, readiness and rank tracking
 * all ask the same question the same way.
 */
export function hasNoBusinessProfile(client: {
  noBusinessProfile: boolean
  googlePlaceId: string | null
}): boolean {
  return client.noBusinessProfile && !client.googlePlaceId?.trim()
}
