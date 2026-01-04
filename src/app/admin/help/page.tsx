import Header from '@/components/admin/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Link from 'next/link'
import {
  Users,
  Calendar,
  FileText,
  Play,
  CheckCircle,
  Trash2,
  Plus,
  Settings,
  ArrowRight,
  Lightbulb,
  Key,
  Image,
  Mic,
  Pencil,
  ExternalLink
} from 'lucide-react'

export default function HelpPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Help & Documentation" subtitle="Learn how to use the content platform" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Quick Start */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Quick Start Guide
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-gray-600">
                  Follow these steps to start creating content for your auto glass clients:
                </p>
                <ol className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">1</span>
                    <div>
                      <strong>Add a Client</strong> - Set up business info, branding, and integrations
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">2</span>
                    <div>
                      <strong>Add PAA Questions</strong> - Configure &quot;People Also Ask&quot; questions for content
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">3</span>
                    <div>
                      <strong>Add Service Locations</strong> - Define areas where the client provides service
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">4</span>
                    <div>
                      <strong>Generate Schedule</strong> - Create content calendar from PAA + Location combinations
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">5</span>
                    <div>
                      <strong>Review & Approve</strong> - Review generated content and approve for publishing
                    </div>
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Setting Up Clients */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Setting Up Clients
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Each client represents an auto glass shop. The setup wizard guides you through 9 steps:
              </p>

              <div className="grid gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 1: Business Info</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Enter business name, contact details, and address. You can search Google Places to auto-fill.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 2: Service Options</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Indicate if they have a shop location, offer mobile service, or ADAS calibration.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 3: Service Locations</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Add cities/areas where the client provides service. Each location creates unique content.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 4: Branding</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Upload logo and set brand colors for consistent content styling.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 5: PAA Questions</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Add questions like &quot;How much does windshield replacement cost in &#123;location&#125;?&quot;
                    Use &#123;location&#125; placeholder for location-specific content.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 6: Integrations</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Connect WordPress for blog publishing and Podbean for podcasts.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 7: CTA & Publishing</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Set call-to-action text and preferred publishing time.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 8: Social Media</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Select which social platforms to create content for.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <strong className="text-sm">Step 9: Review</strong>
                  <p className="text-sm text-gray-600 mt-1">
                    Review all settings before saving the client.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/admin/clients/new"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Add New Client
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Generating Content Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-green-500" />
                Generating Content Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                The schedule generator creates content items by combining PAA questions with service locations.
                Content is scheduled for <strong>Tuesdays and Thursdays</strong> only.
              </p>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    Each PAA question is combined with each service location
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    Example: 5 questions x 3 locations = 15 unique content pieces
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    Schedule generates 2 years of content by default
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    Duplicate combinations are automatically skipped
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">To generate a schedule:</h4>
                <ol className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="font-medium">1.</span>
                    Go to the <Link href="/admin/clients" className="text-blue-600 hover:underline">Clients page</Link>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">2.</span>
                    Click the <Calendar className="h-4 w-4 inline text-gray-400" /> calendar icon next to a client
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">3.</span>
                    Click <strong>&quot;Generate Schedule&quot;</strong> in the modal
                  </li>
                </ol>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-2">Managing the schedule:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <Play className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <strong>Add More Content</strong> - Generate additional items without duplicates
                  </li>
                  <li className="flex items-start gap-2">
                    <Trash2 className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <strong>Clear All Scheduled</strong> - Remove all draft/scheduled items to start fresh
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Creating Individual Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-500" />
                Creating Individual Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                You can also manually add individual content items outside of the schedule generator.
              </p>

              <div className="space-y-3">
                <h4 className="font-medium">To add a single content item:</h4>
                <ol className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="font-medium">1.</span>
                    Go to the <Link href="/admin/content" className="text-blue-600 hover:underline">Content Calendar</Link>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">2.</span>
                    Click the <strong>&quot;Add Content&quot;</strong> button
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">3.</span>
                    Select a client and enter the PAA question
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">4.</span>
                    Set the scheduled date and time
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">5.</span>
                    Click <strong>&quot;Create Content&quot;</strong>
                  </li>
                </ol>
              </div>

              <div className="pt-2">
                <Link
                  href="/admin/content/new"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Content Item
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Reviewing & Deleting Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-orange-500" />
                Reviewing & Managing Content
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                The Content Calendar shows all scheduled content across all clients.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">View Options</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li><strong>Month</strong> - Calendar grid view</li>
                    <li><strong>List</strong> - Table with all details</li>
                    <li><strong>Timeline</strong> - Grouped by date</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Filter Options</h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>Filter by client</li>
                    <li>Filter by status (Draft, Scheduled, Review, etc.)</li>
                    <li>View items needing attention</li>
                  </ul>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2">Deleting Content</h4>
                <p className="text-sm text-yellow-800">
                  Click the <Trash2 className="h-4 w-4 inline text-red-500" /> trash icon on any
                  Draft or Scheduled item to delete it. Published or in-progress items cannot be deleted.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/admin/content"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <Calendar className="h-4 w-4" />
                  View Content Calendar
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* API Keys Setup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" />
                API Keys Setup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-gray-600">
                The content generation pipeline requires several API keys. Add these in Settings &gt; API Keys.
              </p>

              {/* Blog Generation */}
              <div className="p-4 border rounded-lg space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-blue-500" />
                  Blog Post Generation (Required)
                </h4>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Key:</strong> ANTHROPIC_API_KEY</p>
                  <p>
                    Uses Claude AI to generate SEO-optimized blog posts. Get your API key from the Anthropic Console.
                  </p>
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  >
                    Get API Key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Image Generation */}
              <div className="p-4 border rounded-lg space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Image className="h-4 w-4 text-green-500" aria-hidden="true" />
                  Image Generation (Optional)
                </h4>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Key:</strong> NANO_BANANA_API_KEY</p>
                  <p>
                    Uses Google AI Studio (Gemini) to generate blog featured images and social media graphics.
                    The model creates professional automotive imagery customized for each client&apos;s brand.
                  </p>
                  <div className="bg-green-50 p-3 rounded-lg mt-2">
                    <h5 className="font-medium text-green-900 mb-2">Setup Steps:</h5>
                    <ol className="space-y-1 text-green-800">
                      <li>1. Go to Google AI Studio</li>
                      <li>2. Sign in with your Google account</li>
                      <li>3. Click &quot;Get API key&quot; in the top navigation</li>
                      <li>4. Create a new API key or use an existing one</li>
                      <li>5. Add the key in Settings &gt; API Keys as &quot;NANO_BANANA_API_KEY&quot;</li>
                    </ol>
                  </div>
                  <div className="mt-2">
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                    >
                      Get Google AI Studio API Key <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Images generated: Blog featured, Facebook, Instagram (feed &amp; story), Twitter, LinkedIn
                  </p>
                </div>
              </div>

              {/* Podcast Generation */}
              <div className="p-4 border rounded-lg space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Mic className="h-4 w-4 text-purple-500" />
                  Podcast Generation (Optional)
                </h4>
                <div className="text-sm text-gray-600 space-y-2">
                  <p><strong>Key:</strong> AUTOCONTENT_API_KEY</p>
                  <p>
                    Uses AutoContent service to convert blog posts into audio podcasts with
                    AI-generated voice narration.
                  </p>
                  <div className="bg-purple-50 p-3 rounded-lg mt-2">
                    <p className="text-purple-800 text-xs">
                      Contact your administrator for AutoContent API access.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-medium text-yellow-900 mb-2">Generation Order</h4>
                <p className="text-sm text-yellow-800">
                  When content is generated, the pipeline runs in order:
                  <strong> Blog → Podcast → Images → Social Posts → WRHQ Content</strong>.
                  If any step fails (e.g., missing API key), the status will show &quot;Failed&quot;
                  but earlier completed steps are saved.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/admin/settings"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <Settings className="h-4 w-4" />
                  Configure API Keys
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-gray-500" />
                Platform Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Configure API keys and integrations in the Settings area.
              </p>

              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <strong>API Keys</strong> - Anthropic, Google AI Studio, AutoContent, etc.
                </li>
                <li className="flex items-start gap-2">
                  <ArrowRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <strong>WRHQ Settings</strong> - Configure the main WRHQ blog integration
                </li>
              </ul>

              <div className="pt-2">
                <Link
                  href="/admin/settings"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
                >
                  <Settings className="h-4 w-4" />
                  Go to Settings
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
