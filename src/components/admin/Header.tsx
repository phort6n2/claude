'use client'

import { useSession } from 'next-auth/react'
import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { data: session } = useSession()

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500"></span>
        </button>

        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
            {session?.user?.name?.[0] || session?.user?.email?.[0] || 'A'}
          </div>
          <span className="text-sm font-medium text-gray-700">
            {session?.user?.name || session?.user?.email}
          </span>
        </div>
      </div>
    </header>
  )
}
