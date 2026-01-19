import Link from 'next/link'
import {
  Key,
  ChevronRight,
  Building2,
  FileQuestion,
  TrendingUp,
  Settings,
  Shield,
  Zap,
  Podcast,
} from 'lucide-react'
import {
  PageContainer,
  PageHeader,
  ContentCard,
} from '@/components/ui/theme'

const settingsSections = [
  {
    title: 'Standard PAA Questions',
    description: 'Manage default PAA questions used by all clients (100+ templates)',
    href: '/admin/settings/standard-paas',
    icon: FileQuestion,
    color: 'blue',
  },
  {
    title: 'WRHQ Settings',
    description: 'Windshield Repair HQ directory site configuration for dual publishing',
    href: '/admin/settings/wrhq',
    icon: Building2,
    color: 'violet',
  },
  {
    title: 'API Settings',
    description: 'Configure external API keys and integrations',
    href: '/admin/settings/api',
    icon: Key,
    color: 'amber',
  },
  {
    title: 'Google Ads',
    description: 'Connect your MCC for Enhanced Conversions and Offline Conversion Import',
    href: '/admin/settings/google-ads',
    icon: TrendingUp,
    color: 'green',
  },
  {
    title: 'Podbean Podcasts',
    description: 'Assign clients to their correct Podbean podcasts for publishing',
    href: '/admin/podbean',
    icon: Podcast,
    color: 'orange',
  },
]

const colorStyles: Record<string, { bg: string; iconBg: string; iconColor: string; hover: string }> = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-50 to-white',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    hover: 'hover:border-blue-200 hover:shadow-blue-100',
  },
  violet: {
    bg: 'bg-gradient-to-br from-violet-50 to-white',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    hover: 'hover:border-violet-200 hover:shadow-violet-100',
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-50 to-white',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    hover: 'hover:border-amber-200 hover:shadow-amber-100',
  },
  green: {
    bg: 'bg-gradient-to-br from-green-50 to-white',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    hover: 'hover:border-green-200 hover:shadow-green-100',
  },
  orange: {
    bg: 'bg-gradient-to-br from-orange-50 to-white',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    hover: 'hover:border-orange-200 hover:shadow-orange-100',
  },
}

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle="Configure platform settings and integrations"
        backHref="/admin"
      />

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {settingsSections.map((section) => {
          const styles = colorStyles[section.color]
          return (
            <Link key={section.href} href={section.href} className="group">
              <div
                className={`${styles.bg} rounded-2xl border border-gray-100 p-5 transition-all duration-300 hover:shadow-lg ${styles.hover} cursor-pointer`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`${styles.iconBg} rounded-xl p-3`}>
                      <section.icon className={`h-6 w-6 ${styles.iconColor}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                        {section.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                        {section.description}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Additional Info */}
      <div className="mt-8 max-w-4xl">
        <ContentCard>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gray-100 rounded-xl">
              <Shield className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Security Note</h3>
              <p className="text-sm text-gray-500 mt-1">
                API keys and credentials are stored securely and are never exposed in client-side code.
                Changes to settings take effect immediately across all clients.
              </p>
            </div>
          </div>
        </ContentCard>
      </div>

      {/* Quick Stats */}
      <div className="mt-6 max-w-4xl">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Zap className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Integrations</p>
                <p className="text-lg font-semibold text-gray-900">8+</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Settings className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">System Status</p>
                <p className="text-lg font-semibold text-green-600">Healthy</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <FileQuestion className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">PAA Questions</p>
                <p className="text-lg font-semibold text-gray-900">100+</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
