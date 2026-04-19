import { Phone, FileText } from 'lucide-react'

export function SourceIcon({ source }: { source: string }) {
  const isPhone = source === 'PHONE'
  return (
    <div
      className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isPhone ? 'bg-orange-100' : 'bg-blue-100'
      }`}
      aria-label={isPhone ? 'Phone lead' : 'Form lead'}
      title={isPhone ? 'Phone lead' : 'Form lead'}
    >
      {isPhone ? (
        <Phone className="h-3.5 w-3.5 text-orange-600" />
      ) : (
        <FileText className="h-3.5 w-3.5 text-blue-600" />
      )}
    </div>
  )
}
