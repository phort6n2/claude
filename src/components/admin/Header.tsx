'use client'

import { useSession } from 'next-auth/react'

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

      {/* The bell is gone. It had no click handler and a hardcoded red dot,
          so every page in the admin claimed an unread alert that opened
          nothing — which is how you train someone to ignore a red dot, and
          the pages that DO need to shout (a client whose leads stopped
          arriving) use one. */}
      <div className="flex items-center gap-4">
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
