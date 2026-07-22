import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { OWNER_COOKIE, verifyOwnerKey } from '@/lib/directory/owner-auth'
import { ADMIN_COOKIE, verifyAdminToken } from '@/lib/directory/admin-auth'
import { LoginPanel } from '@/components/directory/LoginPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const { key: linkKey } = await searchParams
  const cookieStore = await cookies()

  // Already signed in? Send them where they belong.
  if (verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value)) {
    redirect('/directory/manage')
  }
  if (verifyOwnerKey(cookieStore.get(OWNER_COOKIE)?.value)) {
    redirect('/directory/owner')
  }

  return <LoginPanel initialKey={linkKey ?? ''} />
}
