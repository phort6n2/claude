import Header from '@/components/admin/Header'
import ContentForm from '@/components/forms/ContentForm'

export default function NewContentPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Add Content" subtitle="Schedule new PAA content" />
      <div className="flex-1 p-6 overflow-auto">
        <ContentForm />
      </div>
    </div>
  )
}
