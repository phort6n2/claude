import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Link from 'next/link'
import {
  Rocket,
  Users,
  Webhook,
  PhoneCall,
  Bell,
  Shield,
} from 'lucide-react'
import { requireAdminPage } from '@/lib/admin-guard'

export default async function HelpPage() {
  await requireAdminPage()

  return (
    <div className="flex flex-col h-full">
      <Header title="Help & Documentation" subtitle="How the leads and call coaching platform works" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Getting Started */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-blue-600" />
                Getting Started
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm text-gray-600 list-decimal list-inside">
                <li>
                  <strong>Add a client</strong> — create the shop in{' '}
                  <Link href="/admin/clients" className="text-blue-600 hover:underline">Clients</Link>.
                  Use the Google search box to auto-fill business details.
                </li>
                <li>
                  <strong>Wire up the webhook</strong> — copy the client&apos;s webhook URL from their
                  edit page and paste it into the HighLevel workflow (and any landing pages that
                  post directly). The <code className="bg-gray-100 px-1 rounded">client</code> slug
                  must match exactly; a wrong slug silently drops the lead.
                </li>
                <li>
                  <strong>Invite portal users</strong> — from the client&apos;s edit page, open
                  Users and add the people who should see leads at{' '}
                  <code className="bg-gray-100 px-1 rounded">/portal/leads</code>.
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Leads */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-cyan-600" />
                Lead Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <p>
                HighLevel and client landing pages POST to{' '}
                <code className="bg-gray-100 px-1 rounded">/api/webhooks/highlevel/lead?client=&lt;slug&gt;</code>.
                Each lead is stored with its attribution (gclid, UTM parameters, referrer) and
                classified as Paid, Organic, Social, Referral, or Untracked.
              </p>
              <p>
                Two contacts from the same person on the same calendar day (client timezone)
                collapse into one lead — the second becomes a duplicate of the first. A paid
                click on any same-day duplicate marks the whole group as paid.
              </p>
              <p>
                Phone calls through the HighLevel tracking number are always classified as paid,
                because that number only appears in ad paths.
              </p>
            </CardContent>
          </Card>

          {/* Call Coaching */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="h-5 w-5 text-violet-600" />
                Call Coaching
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <p>
                Every phone lead that arrives with a recording URL is transcribed (Deepgram) and
                analysed (Claude) into a 0–100 score, an outcome, missed opportunities, and a
                coaching note. Clients with at least three analysed calls also get a rolling
                &quot;three things to work on&quot; summary.
              </p>
              <p>
                Coaching can be toggled per client on their edit page. A cron job sweeps stuck
                analyses every 15 minutes.
              </p>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-600" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <p>
                Lead views stream new leads live over SSE, and both the admin master-leads page
                and client portals can subscribe to web push notifications. Push subscriptions
                are device-specific — reinstalling the browser or clearing site data silently
                ends delivery, so re-enable notifications after either.
              </p>
            </CardContent>
          </Card>

          {/* Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                Who Can See What
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <strong>Client portal</strong> (<code className="bg-gray-100 px-1 rounded">/portal/leads</code>)
                  — magic-link email or per-client password, scoped to one client.
                </li>
                <li>
                  <strong>Master leads</strong> (<code className="bg-gray-100 px-1 rounded">/master-leads</code>)
                  — all clients, gated on the configured master leads email.
                </li>
                <li>
                  <strong>Admin</strong> (<code className="bg-gray-100 px-1 rounded">/admin</code>)
                  — NextAuth session.
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-600" />
                Integrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-600">
              <p>
                Live integrations: Anthropic (call analysis), Deepgram (transcription), and
                Google Places (business lookup). Check them on the{' '}
                <Link href="/admin/api-status" className="text-blue-600 hover:underline">API Status</Link>{' '}
                page, and manage keys under{' '}
                <Link href="/admin/settings/api" className="text-blue-600 hover:underline">Settings → API</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
