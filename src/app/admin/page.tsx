import { redirect } from 'next/navigation'

/**
 * `/admin` itself, which had nothing behind it.
 *
 * Two back-arrows pointed here — Settings and Webhook Status — and both landed
 * on Next's stock 404, with no sidebar: from inside the admin, one click put
 * you outside the app entirely with no way back except the browser's own
 * button. It is also the URL anyone would type first.
 *
 * A redirect rather than a page: the dashboard is the admin's front door, and
 * a second one would be a second thing to keep current.
 */
export default function AdminIndexPage() {
  redirect('/admin/dashboard')
}
