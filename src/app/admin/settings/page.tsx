import Link from 'next/link'
import {
  Key,
  ChevronRight,
  Shield,
} from 'lucide-react'
import {
  PageContainer,
  PageHeader,
  ContentCard,
} from '@/components/ui/theme'
import { requireAdminPage } from '@/lib/admin-guard'

const settingsSections = [
  {
    title: 'API keys',
    description: 'Configure external API keys and integrations',
    href: '/admin/settings/api',
    icon: Key,
    color: 'amber',
  },
]

const colorStyles: Record<string, { bg: string; iconBg: string; iconColor: string; hover: string }> = {
  amber: {
    bg: 'bg-gradient-to-br from-amber-50 to-white',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    hover: 'hover:border-amber-200 hover:shadow-amber-100',
  },
}

export default async function SettingsPage() {
  await requireAdminPage()

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle="Configure platform settings and integrations"
        backHref="/admin/dashboard"
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
    </PageContainer>
  )
}
