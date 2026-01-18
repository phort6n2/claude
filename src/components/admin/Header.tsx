'use client'

import { useSession } from 'next-auth/react'
import { Bell, Database } from 'lucide-react'
import { useState, useEffect } from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
}

type DbStatus = 'checking' | 'connected' | 'disconnected'

export default function Header({ title, subtitle }: HeaderProps) {
  const { data: session } = useSession()
  const [dbStatus, setDbStatus] = useState<DbStatus>('checking')
  const [dbLatency, setDbLatency] = useState<number | null>(null)

  useEffect(() => {
    const checkDbStatus = async () => {
      try {
        const response = await fetch('/api/health/db')
        const data = await response.json()

        if (response.ok && data.status === 'connected') {
          setDbStatus('connected')
          setDbLatency(data.latency)
        } else {
          setDbStatus('disconnected')
          setDbLatency(null)
        }
      } catch {
        setDbStatus('disconnected')
        setDbLatency(null)
      }
    }

    // Check immediately
    checkDbStatus()

    // Then check every 30 seconds
    const interval = setInterval(checkDbStatus, 30000)

    return () => clearInterval(interval)
  }, [])

  const statusConfig = {
    checking: { color: 'bg-yellow-400', text: 'Checking...', textColor: 'text-yellow-600' },
    connected: { color: 'bg-green-500', text: 'Connected', textColor: 'text-green-600' },
    disconnected: { color: 'bg-red-500', text: 'Disconnected', textColor: 'text-red-600' },
  }

  const status = statusConfig[dbStatus]

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Database Status Indicator */}
        <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5" title={dbLatency ? `Latency: ${dbLatency}ms` : status.text}>
          <Database className="h-4 w-4 text-gray-500" />
          <span className={`h-2 w-2 rounded-full ${status.color} ${dbStatus === 'checking' ? 'animate-pulse' : ''}`}></span>
          <span className={`text-xs font-medium ${status.textColor}`}>
            {dbStatus === 'connected' && dbLatency ? `${dbLatency}ms` : status.text}
          </span>
        </div>

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
