import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  void request
  await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') {
    return errors.forbidden('Only teachers can access this teacher portal endpoint')
  }

  return errors.forbidden(
    'Student leave approval is restricted to Admin and Super Admin. Teachers can review requests and mark attendance according to approved leave status.'
  )
}
