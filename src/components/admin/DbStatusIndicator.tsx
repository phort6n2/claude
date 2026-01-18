'use client'

import { Database, RefreshCw } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

type DbStatus = 'checking' | 'connected' | 'disconnected'

export default function DbStatusIndicator() {
  const [dbStatus, setDbStatus] = useState<DbStatus>('checking')
  const [dbLatency, setDbLatency] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const checkDbStatus = useCallback(async () => {
    setIsRefreshing(true)
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
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Check immediately
    checkDbStatus()

    // Then check every 30 seconds
    const interval = setInterval(checkDbStatus, 30000)

    return () => clearInterval(interval)
  }, [checkDbStatus])

  const statusConfig = {
    checking: {
      color: 'bg-yellow-400',
      bgColor: 'bg-yellow-50 border-yellow-200',
      text: 'Connecting...',
      textColor: 'text-yellow-700'
    },
    connected: {
      color: 'bg-green-500',
      bgColor: 'bg-green-50 border-green-200',
      text: 'Database Ready',
      textColor: 'text-green-700'
    },
    disconnected: {
      color: 'bg-red-500',
      bgColor: 'bg-red-50 border-red-200',
      text: 'Database Offline',
      textColor: 'text-red-700'
    },
  }

  const status = statusConfig[dbStatus]

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg ${status.bgColor}`}
      title={dbLatency ? `Latency: ${dbLatency}ms` : status.text}
    >
      <Database className={`h-4 w-4 ${status.textColor}`} />
      <span className={`h-2.5 w-2.5 rounded-full ${status.color} ${dbStatus === 'checking' ? 'animate-pulse' : ''}`}></span>
      <span className={`text-sm font-medium ${status.textColor}`}>
        {dbStatus === 'connected' && dbLatency ? `${dbLatency}ms` : status.text}
      </span>
      <button
        onClick={checkDbStatus}
        disabled={isRefreshing}
        className={`ml-1 p-1 rounded hover:bg-white/50 ${status.textColor} disabled:opacity-50`}
        title="Refresh connection status"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
