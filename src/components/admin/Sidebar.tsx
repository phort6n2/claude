'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Settings,
  LogOut,
  Activity,
  HelpCircle,
  Monitor,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Clients', href: '/admin/clients', icon: Users },
  { name: 'Content Calendar', href: '/admin/content', icon: Calendar },
  { name: 'Press Releases', href: '/admin/press-releases', icon: FileText },
  { name: 'Monitoring', href: '/admin/monitoring', icon: Monitor },
  { name: 'API Status', href: '/admin/api-status', icon: Activity },
  { name: 'Settings', href: '/admin/settings', icon: Settings },
  { name: 'Help', href: '/admin/help', icon: HelpCircle },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex flex-col items-center justify-center py-4 border-b border-gray-800">
        <Image
          src="/logo.png"
          alt="Auto Glass Marketing Pros"
          width={180}
          height={72}
          className="mb-2"
          priority
        />
        <span className="text-xs text-gray-400 font-medium">Command Center</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Sign Out */}
      <div className="border-t border-gray-800 p-4">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
