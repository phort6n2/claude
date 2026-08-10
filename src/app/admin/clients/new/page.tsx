import ClientEditForm from '@/components/forms/ClientEditForm'
import { requireAdminPage } from '@/lib/admin-guard'

export default async function NewClientPage() {
  await requireAdminPage()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto p-6">
        <ClientEditForm />
      </div>
    </div>
  )
}
