import Header from '@/components/admin/Header'
import ClientForm from '@/components/forms/ClientForm'

export default function NewClientPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Add New Client" subtitle="Onboard a new auto glass shop" />
      <div className="flex-1 p-6 overflow-auto">
        <ClientForm />
      </div>
    </div>
  )
}
