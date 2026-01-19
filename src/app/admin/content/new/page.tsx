import Header from '@/components/admin/Header'
import ContentForm from '@/components/forms/ContentForm'

export default function NewContentPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Add Content" subtitle="Schedule new PAA content" />
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <ContentForm />
      </div>
    </div>
  )
}
