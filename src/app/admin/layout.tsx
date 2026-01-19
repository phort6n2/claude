import { SessionProvider } from 'next-auth/react'
import Sidebar from '@/components/admin/Sidebar'
import DbStatusIndicator from '@/components/admin/DbStatusIndicator'
export const dynamic = 'force-dynamic'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <DbStatusIndicator />
      </div>
    </SessionProvider>
  )
}
