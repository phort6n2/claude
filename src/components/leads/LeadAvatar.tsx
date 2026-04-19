const STATUS_COLOR: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-violet-100 text-violet-700',
  SOLD: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-red-100 text-red-700',
}

export function LeadAvatar({
  firstName,
  lastName,
  status,
  size = 'md',
}: {
  firstName?: string | null
  lastName?: string | null
  status?: string
  size?: 'sm' | 'md'
}) {
  const initials =
    [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() ||
    '?'

  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
  const color = (status && STATUS_COLOR[status]) || 'bg-gray-100 text-gray-600'

  return (
    <div
      className={`${sizeClass} ${color} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
    >
      {initials}
    </div>
  )
}
