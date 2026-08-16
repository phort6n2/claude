'use client'

import { useState, useEffect, useRef } from 'react'
import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { isSensitiveKey } from '@/lib/setting-keys'
import { ALL_KEYS } from '@/lib/setting-keys'

interface SetupStep {
  /** What to do. */
  text: string
  /** Where to do it. */
  href?: string
  linkLabel?: string
}

interface ApiKeyConfig {
  key: string
  label: string
  description: string
  isTextarea?: boolean
  testable?: boolean
  /**
   * A side-effecting action offered beside the key, distinct from the
   * read-only connection test — it does something and may cost money, so it
   * always confirms first.
   */
  action?: { label: string; endpoint: string; confirm: string }
  /** Extra actions. `confirm` only where one spends money or credits. */
  extraActions?: Array<{ label: string; endpoint: string; confirm?: string }>
  /** Overrides "Test Connection" when the test covers more than this one key. */
  testLabel?: string
  /** Numbered walkthrough, shown behind "Where do I get this?". */
  steps?: SetupStep[]
  /** Shown after the steps — the thing that bites if you skip it. */
  warning?: string
}

/**
 * Rich per-key copy for this page. `setting-keys.ts` remains the source of
 * truth for what exists; anything listed there but missing here still gets a
 * plain field via `RENDERED_KEYS` below, so a new credential can never be
 * saveable by the API and invisible in the UI — which is exactly how the
 * Local Dominator key shipped unreachable.
 */
const API_KEYS: ApiKeyConfig[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    description: 'Call coaching, site import, and the location-page copy drafts',
    testable: true,
    steps: [
      { text: 'Sign in to the Anthropic Console.', href: 'https://console.anthropic.com/settings/keys', linkLabel: 'console.anthropic.com' },
      { text: 'Create Key, name it "glassleads", and copy it — it is shown once.' },
      { text: 'Make sure the workspace has credit, under Billing.' },
    ],
  },
  {
    key: 'DEEPGRAM_API_KEY',
    label: 'Deepgram API Key',
    description: 'Transcribes call recordings — the first step of call coaching',
    testable: true,
    steps: [
      {
        text: 'Sign in to the Deepgram console and open API Keys.',
        href: 'https://console.deepgram.com/',
        linkLabel: 'console.deepgram.com',
      },
      { text: 'Create a key with Member permissions, then copy it — it is shown once.' },
    ],
    warning:
      'Without it, a tracked call is still recorded and still attached to its lead, but never transcribed — so there is no transcript and no coaching score, and the analysis fails at the download step rather than reporting a missing key.',
  },
  {
    key: 'GOOGLE_PLACES_API_KEY',
    label: 'Google Places API Key',
    description: 'Business lookup, addresses, opening hours, and cached review counts',
    testable: true,
    steps: [
      { text: 'Open Google Cloud Console and pick (or create) a project.', href: 'https://console.cloud.google.com/projectselector2/home/dashboard', linkLabel: 'console.cloud.google.com' },
      { text: 'Enable Places API (New).', href: 'https://console.cloud.google.com/apis/library/places.googleapis.com', linkLabel: 'Enable Places API (New)' },
      { text: 'Also enable the legacy Places API — the address autocomplete still uses it.', href: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com', linkLabel: 'Enable Places API' },
      { text: 'Credentials → Create credentials → API key, then copy it.', href: 'https://console.cloud.google.com/apis/credentials', linkLabel: 'Credentials' },
      { text: 'Billing must be enabled on the project or every call returns REQUEST_DENIED.', href: 'https://console.cloud.google.com/billing', linkLabel: 'Billing' },
    ],
    warning:
      'Restrict the key to those two APIs. It is used server-side only, so an IP or API restriction costs nothing and stops a leaked key being spent by someone else.',
  },
  {
    key: 'RESEND_API_KEY',
    label: 'Resend API Key',
    description: 'Sends lead-alert emails for every client. Included free with their plan.',
    steps: [
      { text: 'Create a Resend account.', href: 'https://resend.com/signup', linkLabel: 'resend.com' },
      { text: 'Add and verify the sending domain — this is the DNS step, and nothing sends until it is green.', href: 'https://resend.com/domains', linkLabel: 'Domains' },
      { text: 'API Keys → Create API Key with Sending access, then copy it.', href: 'https://resend.com/api-keys', linkLabel: 'API Keys' },
    ],
    warning:
      'Send from a subdomain you do not use for personal mail — e.g. leads@mail.glassleads.app. If alert volume ever gets marked as spam, it damages that subdomain\u2019s reputation and not your main one.',
  },
  {
    key: 'RESEND_FROM',
    label: 'Lead alert "from" address',
    description: 'e.g. GlassLeads <leads@glassleads.app>. The domain must be verified in Resend.',
    steps: [
      { text: 'Use the exact form: Display Name <address@domain>.' },
      { text: 'The domain must be one showing Verified on the Resend Domains page.', href: 'https://resend.com/domains', linkLabel: 'Domains' },
    ],
  },
  {
    key: 'TWILIO_ACCOUNT_SID',
    label: 'Twilio Account SID',
    description: 'Sends lead-alert texts. Billed to clients as the $15/mo SMS add-on.',
    steps: [
      { text: 'Open the Twilio Console; the Account SID is on the dashboard.', href: 'https://console.twilio.com', linkLabel: 'console.twilio.com' },
      { text: 'It starts with AC and is safe to copy — the auth token below is the secret half.' },
    ],
  },
  {
    key: 'TWILIO_AUTH_TOKEN',
    label: 'Twilio Auth Token',
    description: 'Paired with the SID above.',
    steps: [
      { text: 'Same dashboard page as the SID; click to reveal it.', href: 'https://console.twilio.com', linkLabel: 'console.twilio.com' },
    ],
  },
  {
    key: 'TWILIO_FROM_NUMBER',
    label: 'Twilio sending number',
    description:
      'A number already in your Twilio account, as +15035550100. Every client texts from it — nothing to import.',
    steps: [
      { text: 'Copy a number you already own, in +1XXXXXXXXXX form.', href: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming', linkLabel: 'Active numbers' },
      { text: 'It must have SMS capability — the numbers list shows which do.' },
    ],
    warning:
      'US texting from a 10-digit number needs A2P 10DLC registration, or carriers filter the messages silently. If your number is already registered you are done; if not, register the brand and campaign first.',
  },
  {
    key: 'TWILIO_MESSAGING_SERVICE_SID',
    label: 'Twilio Messaging Service SID (optional)',
    description:
      'MG… — if your A2P 10DLC campaign is attached to a Messaging Service, set this and it is used instead of the bare number.',
    steps: [
      { text: 'Messaging → Services; copy the SID beginning MG.', href: 'https://console.twilio.com/us1/develop/sms/services', linkLabel: 'Messaging Services' },
      { text: 'Leave blank to send from the plain number above.' },
    ],
  },
  {
    key: 'GOOGLE_ADS_DEVELOPER_TOKEN',
    label: 'Google Ads developer token',
    description: 'Read-only checks that a client\u2019s conversions are recording. Clients add nothing.',
    steps: [
      { text: 'In your MANAGER (MCC) account: Tools → Setup → API Center.', href: 'https://ads.google.com/aw/apicenter', linkLabel: 'API Center' },
      { text: 'Copy the developer token and check the access level shown beside it.' },
      {
        text: 'Explorer access is enough for everything this app does and is granted automatically — no application, no wait. Basic access only raises the daily ceiling.',
        href: 'https://developers.google.com/google-ads/api/docs/api-policy/access-levels',
        linkLabel: 'Access levels',
      },
    ],
    warning:
      'Test access is the one that will not work: it reaches test accounts only, so it authenticates fine and returns nothing for real clients — which reads as "no conversions" rather than "wrong token". Explorer caps you at 2,880 operations a day against live accounts, which is far more than the conversion checks here use (two queries per client, per check).',
  },
  {
    key: 'GOOGLE_ADS_CLIENT_ID',
    label: 'Google Ads OAuth client ID',
    description: 'A Web application OAuth client, used once to mint the refresh token below.',
    steps: [
      { text: 'Enable the Google Ads API on your Cloud project.', href: 'https://console.cloud.google.com/apis/library/googleads.googleapis.com', linkLabel: 'Enable Google Ads API' },
      { text: 'Google Auth Platform → Clients → Create client → Web application.', href: 'https://console.cloud.google.com/auth/clients', linkLabel: 'Clients' },
      { text: 'Add https://developers.google.com/oauthplayground as an Authorised redirect URI.' },
      { text: 'Copy the client ID. (The client ID is not a secret; the client secret is.)' },
    ],
    warning:
      'It must be Web application, not Desktop — the Desktop type cannot use the playground redirect, which is how the refresh token is generated.',
  },
  {
    key: 'GOOGLE_ADS_CLIENT_SECRET',
    label: 'Google Ads OAuth client secret',
    description: 'Paired with the client ID above.',
    steps: [
      {
        text: 'Google Auth Platform → Clients → open your Web application client. The secret is on the right; use "Add secret" if the original was never copied.',
        href: 'https://console.cloud.google.com/auth/clients',
        linkLabel: 'Clients',
      },
    ],
  },
  {
    key: 'GOOGLE_ADS_REFRESH_TOKEN',
    label: 'Google Ads refresh token',
    description: 'Generated once. It does not expire.',
    steps: [
      {
        text: 'FIRST: Google Auth Platform → Audience. Set User type to External, then press Publish app so the status reads "In production".',
        href: 'https://console.cloud.google.com/auth/audience',
        linkLabel: 'Audience',
      },
      { text: 'Open the OAuth Playground.', href: 'https://developers.google.com/oauthplayground', linkLabel: 'OAuth Playground' },
      { text: 'Gear icon → tick "Use your own OAuth credentials" → paste the client ID and secret.' },
      { text: 'In Step 1, paste this scope into the box: https://www.googleapis.com/auth/adwords' },
      { text: 'Authorise APIs, and sign in as the Google account that owns the MANAGER account.' },
      {
        text: 'You will get "Google hasn’t verified this app". Expected — click Advanced, then "Go to (unsafe)". You are the only user; verification only removes that warning.',
      },
      { text: 'Step 2 → Exchange authorization code for tokens → copy the refresh token.' },
      { text: 'Go back and remove the playground redirect URI from the OAuth client.', href: 'https://console.cloud.google.com/auth/clients', linkLabel: 'Clients' },
    ],
    warning:
      'Do not skip the Publish step. While the app sits in "Testing", Google issues a refresh token that EXPIRES IN 7 DAYS for this scope — it authenticates perfectly today and the conversion checks start failing a week later. Adding yourself as a Test user clears the 403 but keeps the 7-day clock. Also sign in as the manager-account owner: a personal account that merely has access produces a token that breaks when that access changes.',
  },
  {
    key: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    label: 'Manager (MCC) customer ID',
    description:
      'The 10-digit ID of the manager account the client accounts sit under. Test here once all five Google Ads fields are saved — the test exercises the whole set.',
    testable: true,
    testLabel: 'Test Google Ads connection',
    steps: [
      { text: 'Shown top-right in Google Ads while the manager account is selected.', href: 'https://ads.google.com', linkLabel: 'Google Ads' },
      { text: 'Digits only — dashes are stripped automatically.' },
    ],
  },
  {
    key: 'LOCALDOMINATOR_API_KEY',
    label: 'Local Dominator API key',
    testable: true,
    testLabel: 'Test connection',
    action: {
      label: 'Create campaigns now',
      endpoint: '/api/admin/rank-campaigns/run',
      confirm:
        'Create rank-tracking campaigns for every client that does not have one yet?\n\nSEO clients are scanned weekly on four keywords, everyone else monthly on two. This spends Local Dominator credits, and the same thing happens automatically once a day — this only runs it sooner.',
    },
    // Costs nothing and touches no third party: it re-reads scan payloads we
    // already hold, so it needs no confirm.
    extraActions: [
      { label: 'Recalculate scans', endpoint: '/api/admin/rank-campaigns/repair' },
      // Probes their share URLs with the REAL tokens from a stored payload and
      // no cookies — the only way to know what a signed-out client actually
      // gets, as opposed to what an admin sees while signed in to their app.
      { label: 'Check map embeds', endpoint: '/api/admin/rank-campaigns/embed-check' },
    ],
    description:
      'Geogrid rank scans. Campaign controls live on the Local Rankings page. Local Dominator runs the schedule on their side and posts each completed run back here, so nothing needs to be polled.',
    steps: [
      {
        text: 'Local Dominator → account settings → API. Keys begin ld_.',
        href: 'https://app.localdominator.co/api-doc/',
        linkLabel: 'API docs',
      },
      { text: 'API access starts on the Powerhouse plan — the key will not be issued on lower tiers.' },
    ],
    warning:
      'Scans bill credits per run, and cost scales with clients × keywords × grid size × frequency. A 10×10 grid on four keywords weekly is 16× the spend of the same grid monthly on two, so switch a client to the SEO tier deliberately rather than by default.',
  },
  {
    key: 'LOCALDOMINATOR_SHARE_HOST',
    label: 'Rank report share domain',
    description:
      'Your white-label Local Dominator domain, e.g. ranking.autoglassmarketingpros.com. Host only — no https://, no path.',
    steps: [
      {
        text: 'Local Dominator → white-label settings → the domain you pointed at them. Share links are then served as https://that-domain/{link}.',
        href: 'https://app.localdominator.co/',
        linkLabel: 'app.localdominator.co',
      },
      {
        text: 'Set this and every rank map — portal, admin and share link — is framed from your domain instead of theirs.',
      },
    ],
    warning:
      'Without it the maps still work, but they are framed from app.localdominator.co, so a client reading their own rankings sees a vendor\u2019s domain rather than yours. That domain is also the only one that advertises frame-ancestors *, so it is the most reliable to embed as well as the best branded.',
  },
]

/**
 * Every key the app knows about: the configured ones above, then a bare
 * fallback for any that were added to `setting-keys.ts` without copy here.
 */
const RENDERED_KEYS: ApiKeyConfig[] = [
  ...API_KEYS,
  ...ALL_KEYS.filter((key) => !API_KEYS.some((c) => c.key === key)).map((key) => ({
    key,
    label: key,
    description: 'No setup notes written for this key yet.',
  })),
]

interface SettingState {
  value: string
  masked: string
  hasValue: boolean
  visible: boolean
  /** The real value, fetched on demand and cleared when hidden again. */
  revealed: string
  revealing: boolean
  editing: boolean
  newValue: string
  testing: boolean
  testResult?: { success: boolean; message: string }
}

export default function ApiSettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // Which keys have their walkthrough open. Collapsed by default: once a key
  // is set you never read the steps again, and thirteen expanded lists would
  // bury the fields themselves.
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)
  // Auto-hide timers, one per revealed key. In a ref so re-renders don't lose
  // them and leave a value on screen indefinitely.
  const hideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const timers = hideTimers.current
    return () => Object.values(timers).forEach(clearTimeout)
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings')
      const data = await response.json()

      const initialState: Record<string, SettingState> = {}
      for (const config of RENDERED_KEYS) {
        const setting = data[config.key] || { value: '', masked: '', hasValue: false }
        initialState[config.key] = {
          value: setting.value,
          masked: setting.masked,
          hasValue: setting.hasValue,
          visible: false,
          revealed: '',
          revealing: false,
          editing: false,
          newValue: '',
          testing: false,
        }
      }
      setSettings(initialState)
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Show the real stored value, not the mask.
   *
   * The list endpoint never sends sensitive values to the browser, so a
   * reveal is a separate fetch for that one key. It auto-hides after a minute
   * — a credential left on screen on an unlocked laptop is the actual risk
   * here, not the fetch.
   */
  async function toggleVisibility(key: string) {
    const current = settings[key]
    if (current.visible) {
      if (hideTimers.current[key]) clearTimeout(hideTimers.current[key])
      setSettings(prev => ({ ...prev, [key]: { ...prev[key], visible: false, revealed: '' } }))
      return
    }

    setSettings(prev => ({ ...prev, [key]: { ...prev[key], revealing: true } }))
    try {
      const res = await fetch('/api/settings/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not read that value')
      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], visible: true, revealed: data.value, revealing: false },
      }))
      hideTimers.current[key] = setTimeout(() => {
        setSettings(prev =>
          prev[key] ? { ...prev, [key]: { ...prev[key], visible: false, revealed: '' } } : prev
        )
      }, 60_000)
    } catch (err) {
      setSettings(prev => ({ ...prev, [key]: { ...prev[key], revealing: false } }))
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not reveal' })
      setTimeout(() => setMessage(null), 5000)
    }
  }

  async function copyValue(key: string) {
    const value = settings[key]?.revealed
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      setMessage({ type: 'error', text: 'Clipboard blocked — select the text and copy it manually.' })
      setTimeout(() => setMessage(null), 5000)
    }
  }

  function startEditing(key: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], editing: true, newValue: '' },
    }))
  }

  function cancelEditing(key: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], editing: false, newValue: '' },
    }))
  }

  function updateNewValue(key: string, value: string) {
    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], newValue: value },
    }))
  }

  async function saveKey(key: string) {
    const setting = settings[key]
    if (!setting.newValue.trim()) {
      cancelEditing(key)
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: [{ key, value: setting.newValue }] }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: `${key} saved successfully` })
        // Update local state with masked value
        setSettings(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            hasValue: true,
            masked: '••••••••' + setting.newValue.slice(-4),
            editing: false,
            newValue: '',
          },
        }))
      } else {
        setMessage({ type: 'error', text: 'Failed to save setting' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save setting' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  /**
   * Fire a key's side-effecting action. Confirms first, because unlike the
   * connection test this one does something and can cost money. Results
   * reuse the same banner as the test — one place to look for "what
   * happened when I pressed the button".
   */
  async function runAction(key: string) {
    const config = RENDERED_KEYS.find((c) => c.key === key)
    if (!config?.action) return
    if (!window.confirm(config.action.confirm)) return

    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], testing: true, testResult: undefined },
    }))

    try {
      const response = await fetch(config.action.endpoint, { method: 'POST' })
      const result = await response.json()
      setSettings((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          testing: false,
          testResult: {
            success: result.success !== false,
            message: result.message || 'Done.',
          },
        },
      }))
    } catch {
      setSettings((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          testing: false,
          testResult: { success: false, message: 'Could not run that just now.' },
        },
      }))
    }
  }

  /** Fire an endpoint with no confirm, reporting into the same banner. */
  async function runEndpoint(key: string, endpoint: string) {
    setSettings((prev) => ({ ...prev, [key]: { ...prev[key], testing: true, testResult: undefined } }))
    try {
      const response = await fetch(endpoint, { method: 'POST' })
      const result = await response.json()
      setSettings((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          testing: false,
          testResult: { success: result.success !== false, message: result.message || 'Done.' },
        },
      }))
    } catch {
      setSettings((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          testing: false,
          testResult: { success: false, message: 'Could not run that just now.' },
        },
      }))
    }
  }

  async function testConnection(key: string) {
    const setting = settings[key]
    const valueToTest = setting.editing ? setting.newValue : undefined

    setSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], testing: true, testResult: undefined },
    }))

    try {
      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: valueToTest }),
      })

      const result = await response.json()
      setSettings(prev => ({
        ...prev,
        [key]: { ...prev[key], testing: false, testResult: result },
      }))
    } catch (error) {
      setSettings(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          testing: false,
          testResult: { success: false, message: 'Test failed' },
        },
      }))
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="API keys" subtitle="Configure external API integrations" />
        <div className="flex-1 p-6 flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="API keys" subtitle="Configure external API integrations" />
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {message && (
          <div
            className={`mb-4 p-4 rounded-md ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-4">
          {RENDERED_KEYS.map((config) => {
            const setting = settings[config.key]
            if (!setting) return null

            return (
              <Card key={config.key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{config.label}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">{config.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {setting.hasValue && !setting.editing && (
                        <span className="text-sm text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          Configured
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {setting.editing ? (
                    <div className="space-y-3">
                      {config.isTextarea ? (
                        <textarea
                          value={setting.newValue}
                          onChange={(e) => updateNewValue(config.key, e.target.value)}
                          placeholder="Paste your credentials JSON here..."
                          rows={6}
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                      ) : (
                        <input
                          // Masked for anything sensitive. The reveal path is
                          // careful — one key at a time, auto-hidden after a
                          // minute — and then the ENTRY path left a pasted
                          // secret sitting in plain text on screen until the
                          // page was navigated away from. autoComplete off so
                          // the browser stops offering to save credentials it
                          // has no business holding.
                          type={isSensitiveKey(config.key) ? 'password' : 'text'}
                          autoComplete="off"
                          spellCheck={false}
                          value={setting.newValue}
                          onChange={(e) => updateNewValue(config.key, e.target.value)}
                          placeholder="Enter new value..."
                          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => saveKey(config.key)}
                          disabled={saving || !setting.newValue.trim()}
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save'
                          )}
                        </Button>
                        <Button variant="outline" onClick={() => cancelEditing(config.key)}>
                          Cancel
                        </Button>
                        {config.testable && setting.newValue.trim() && (
                          <Button
                            variant="secondary"
                            onClick={() => testConnection(config.key)}
                            disabled={setting.testing}
                          >
                            {setting.testing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              config.testLabel || 'Test Connection'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {setting.hasValue ? (
                          <>
                            <code className="bg-gray-100 px-3 py-1.5 rounded font-mono text-sm break-all max-w-xl">
                              {setting.visible ? setting.revealed || setting.masked : '••••••••••••'}
                            </code>
                            <button
                              onClick={() => toggleVisibility(config.key)}
                              disabled={setting.revealing}
                              title={setting.visible ? 'Hide' : 'Show the real value'}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            >
                              {setting.revealing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : setting.visible ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                            {setting.visible && setting.revealed && (
                              <>
                                <button
                                  onClick={() => copyValue(config.key)}
                                  title="Copy to clipboard"
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  {copied === config.key ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </button>
                                <span className="text-xs text-gray-400">hides in a minute</span>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400 italic">Not configured</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {config.testable && setting.hasValue && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnection(config.key)}
                            disabled={setting.testing}
                          >
                            {setting.testing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              config.testLabel || 'Test Connection'
                            )}
                          </Button>
                        )}
                        {config.extraActions?.map((extra) =>
                          setting.hasValue ? (
                            <Button
                              key={extra.endpoint}
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (extra.confirm && !window.confirm(extra.confirm)) return
                                runEndpoint(config.key, extra.endpoint)
                              }}
                              disabled={setting.testing}
                            >
                              {extra.label}
                            </Button>
                          ) : null
                        )}
                        {config.action && setting.hasValue && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => runAction(config.key)}
                            disabled={setting.testing}
                          >
                            {setting.testing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Working…
                              </>
                            ) : (
                              config.action.label
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(config.key)}
                        >
                          {setting.hasValue ? 'Update' : 'Add'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {setting.testResult && (
                    <div
                      className={`mt-3 p-3 rounded-md flex items-start gap-2 text-sm ${
                        setting.testResult.success
                          ? 'bg-green-50 text-green-800'
                          : 'bg-red-50 text-red-800'
                      }`}
                    >
                      {setting.testResult.success ? (
                        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      )}
                      <span className="min-w-0">{setting.testResult.message}</span>
                    </div>
                  )}

                  {config.steps && config.steps.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSteps((prev) => ({
                            ...prev,
                            [config.key]: !prev[config.key],
                          }))
                        }
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        {openSteps[config.key] ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        Where do I get this?
                      </button>

                      {openSteps[config.key] && (
                        <div className="mt-3 space-y-3">
                          <ol className="space-y-2 text-sm text-gray-700">
                            {config.steps.map((step, index) => (
                              <li key={index} className="flex gap-2.5">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
                                  {index + 1}
                                </span>
                                <span className="min-w-0">
                                  <span className="break-words">{step.text}</span>
                                  {step.href && (
                                    <a
                                      href={step.href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline break-all"
                                    >
                                      {step.linkLabel || step.href}
                                      <ExternalLink className="h-3 w-3 shrink-0" />
                                    </a>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ol>
                          {config.warning && (
                            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                              {config.warning}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
