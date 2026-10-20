/**
 * Who may open Master Leads: ONE address, `MASTER_LEADS_EMAIL`, on top of
 * being a signed-in admin. Unset means nobody — the safe default for a screen
 * that shows every shop's customers at once.
 *
 * One function because two screens now ask (the leads list's own auth check
 * and the campaign table's server page), and two copies of an access rule is
 * how one of them ends up a character more lenient than the other.
 */
export function isMasterLeadsEmail(email: string | null | undefined): boolean {
  const allowed = process.env.MASTER_LEADS_EMAIL
  if (!allowed || !email) return false
  return email.toLowerCase() === allowed.toLowerCase()
}
