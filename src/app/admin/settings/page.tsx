import Link from 'next/link'
import Header from '@/components/admin/Header'
import { Card, CardContent } from '@/components/ui/Card'
import { Key, ChevronRight, Building2 } from 'lucide-react'

const settingsSections = [
  {
    title: 'WRHQ Settings',
    description: 'Windshield Repair HQ directory site configuration for dual publishing',
    href: '/admin/settings/wrhq',
    icon: Building2,
  },
  {
    title: 'API Settings',
    description: 'Configure external API keys and integrations',
    href: '/admin/settings/api',
    icon: Key,
  },
]

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" subtitle="Configure platform settings" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="space-y-4 max-w-2xl">
          {settingsSections.map((section) => (
            <Link key={section.href} href={section.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <section.icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{section.title}</h3>
                      <p className="text-sm text-gray-500">{section.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
