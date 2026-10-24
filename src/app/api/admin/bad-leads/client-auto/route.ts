import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireTargetCpaApi } from '@/lib/target-cpa-access'

export const dynamic = 'force-dynamic'

/** Per client: may a bad-lead mark add its checked negatives without the owner. */
export async function PATCH(req: NextRequest) {
  const gate = await requireTargetCpaApi()
  if ('denied' in gate) return gate.denied
  const b = await req.json().catch(() => ({}))
  if (typeof b.clientId !== 'string' || typeof b.on !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  await prisma.client.update({ where: { id: b.clientId }, data: { autoNegatives: b.on } })
  console.log(`[BadLead] ${gate.email} set autoNegatives=${b.on} on ${b.clientId}`)
  return NextResponse.json({ ok: true })
}
