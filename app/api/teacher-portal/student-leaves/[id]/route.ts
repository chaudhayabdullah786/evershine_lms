import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const updateSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  remarks: z.string().optional()
})

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { status, remarks } = parsed.data
  const leaveId = params.id

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const existingLeave = await prisma.studentLeaveRequest.findUnique({
    where: { id: leaveId, teacherId: teacher.id }
  })

  if (!existingLeave) return errors.notFound('Leave request not found or access denied')

  const updatedLeave = await prisma.studentLeaveRequest.update({
    where: { id: leaveId },
    data: { status, remarks }
  })

  // Optionally send notification to student here

  return successResponse(updatedLeave, `Leave request ${status.toLowerCase()} successfully`)
}
