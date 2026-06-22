import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const markSubmissionSchema = z.object({
  records: z.array(z.object({
    studentId: z.string(),
    obtainedMarks: z.coerce.number().min(0),
    remarks: z.string().optional()
  }))
})

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const taskId = params.id
  
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const task = await prisma.classTask.findUnique({
    where: { id: taskId, teacherId: teacher.id },
    include: {
      results: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true } }
        }
      }
    }
  })

  if (!task) return errors.notFound('Task not found or access denied')

  // If results exist, return them. Otherwise, return students of the class so the teacher can grade them.
  if (task.results.length > 0) {
    return successResponse(task.results)
  }

  // Fetch students enrolled in the class
  const students = await prisma.student.findMany({
    where: { classId: task.classId, isActive: true },
    select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true },
    orderBy: { rollNumber: 'asc' }
  })

  // Format them to match the expected TaskResult shape in the frontend
  const emptyResults = students.map(student => ({
    studentId: student.id,
    student,
    obtainedMarks: 0,
    remarks: null
  }))

  return successResponse(emptyResults)
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const taskId = params.id
  
  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = markSubmissionSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const { records } = parsed.data

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const task = await prisma.classTask.findUnique({
    where: { id: taskId, teacherId: teacher.id },
  })

  if (!task) return errors.notFound('Task not found or access denied')

  // Validate marks are not greater than maxMarks
  const invalidMarks = records.find(r => r.obtainedMarks > task.maxMarks)
  if (invalidMarks) {
    return errors.validation({ errors: [{ path: ['obtainedMarks'], message: `Marks cannot exceed max marks (${task.maxMarks})` }] } as never)
  }

  // Upsert results in a transaction
  await prisma.$transaction(
    records.map(r => prisma.taskResult.upsert({
      where: { taskId_studentId: { taskId, studentId: r.studentId } },
      update: { obtainedMarks: r.obtainedMarks, remarks: r.remarks },
      create: { taskId, studentId: r.studentId, obtainedMarks: r.obtainedMarks, remarks: r.remarks }
    }))
  )

  return successResponse(null, 'Marks saved successfully')
}
