import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getOrSyncSectionEnrollments } from '@/lib/academic/roster-helper'
import { resolveClassContext } from '@/lib/teacher-access'
import { isSchemaOutOfDateError } from '@/lib/db-errors'

const markSubmissionSchema = z.object({
  records: z.array(z.object({
    studentId: z.string().min(1),
    obtainedMarks: z.coerce.number().min(0),
    remarks: z.string().max(500).optional(),
  })).min(1),
})

async function getTeacherId(userId: string) {
  return prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  })
}

async function getScopedTask(taskId: string, teacherId: string) {
  return prisma.classTask.findFirst({
    where: { id: taskId, teacherId },
    include: {
      class: { select: { id: true, name: true, section: true } },
      classSection: { select: { id: true, className: true, sectionName: true } },
      results: {
        include: {
          student: { select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true } },
        },
      },
    },
  })
}

type TaskWithResults = Awaited<ReturnType<typeof getScopedTask>>

async function getTaskRoster(task: NonNullable<TaskWithResults>) {
  let classSectionId = task.classSectionId

  if (!classSectionId && task.classId) {
    const context = await resolveClassContext(task.classId)
    classSectionId = context.classSectionId
  }

  if (classSectionId) {
    const activeYear = await getActiveAcademicYear()
    let enrollments = await prisma.studentEnrollment.findMany({
      where: {
        classSectionId,
        status: 'ACTIVE',
        ...(activeYear?.id ? { academicYearId: activeYear.id } : {}),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true } },
      },
      orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
    })

    if (enrollments.length === 0) {
      const resolved = await getOrSyncSectionEnrollments(classSectionId, activeYear?.id)
      enrollments = resolved.enrollments as typeof enrollments
    }

    if (enrollments.length > 0) {
      return enrollments.map((enrollment) => ({
        studentId: enrollment.studentId,
        student: {
          ...enrollment.student,
          rollNumber: enrollment.rollNumber ?? enrollment.student.rollNumber,
        },
      }))
    }
  }

  const students = await prisma.student.findMany({
    where: { classId: task.classId, isActive: true },
    select: { id: true, firstName: true, lastName: true, registrationNumber: true, rollNumber: true },
    orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
  })

  return students.map((student) => ({
    studentId: student.id,
    student,
  }))
}

function buildRows(task: NonNullable<TaskWithResults>, roster: Awaited<ReturnType<typeof getTaskRoster>>) {
  const resultByStudentId = new Map(task.results.map((result) => [result.studentId, result]))

  return roster.map((row) => {
    const result = resultByStudentId.get(row.studentId)
    return {
      id: result?.id ?? null,
      taskId: task.id,
      studentId: row.studentId,
      student: row.student,
      obtainedMarks: result ? Number(result.obtainedMarks) : 0,
      remarks: result?.remarks ?? null,
    }
  })
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  try {
    const teacher = await getTeacherId(session.user.id)
    if (!teacher) return errors.notFound('Teacher profile not found')

    const task = await getScopedTask(params.id, teacher.id)
    if (!task) return errors.notFound('Task not found or access denied')

    const roster = await getTaskRoster(task)
    return successResponse(buildRows(task, roster))
  } catch (err) {
    console.error('[TEACHER_TASK_MARKS_GET]', err)
    if (isSchemaOutOfDateError(err)) {
      return errors.schemaOutOfDate('The task marks database schema is out of date. Please run the production schema sync and try again.')
    }
    return errors.internal()
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = markSubmissionSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    const teacher = await getTeacherId(session.user.id)
    if (!teacher) return errors.notFound('Teacher profile not found')

    const task = await getScopedTask(params.id, teacher.id)
    if (!task) return errors.notFound('Task not found or access denied')

    const invalidMarks = parsed.data.records.find((record) => record.obtainedMarks > task.maxMarks)
    if (invalidMarks) {
      return errors.validation({ errors: [{ path: ['obtainedMarks'], message: `Marks cannot exceed max marks (${task.maxMarks})` }] } as never)
    }

    const roster = await getTaskRoster(task)
    const allowedStudentIds = new Set(roster.map((row) => row.studentId))
    const unauthorizedStudent = parsed.data.records.find((record) => !allowedStudentIds.has(record.studentId))
    if (unauthorizedStudent) {
      return errors.forbidden('One or more students are not enrolled in this task section.')
    }

    await prisma.$transaction(
      parsed.data.records.map((record) => prisma.taskResult.upsert({
        where: { taskId_studentId: { taskId: task.id, studentId: record.studentId } },
        update: { obtainedMarks: record.obtainedMarks, remarks: record.remarks ?? null },
        create: { taskId: task.id, studentId: record.studentId, obtainedMarks: record.obtainedMarks, remarks: record.remarks ?? null },
      })),
    )

    return successResponse(null, 'Marks saved successfully')
  } catch (err) {
    console.error('[TEACHER_TASK_MARKS_POST]', err)
    if (isSchemaOutOfDateError(err)) {
      return errors.schemaOutOfDate('The task marks database schema is out of date. Please run the production schema sync and try again.')
    }
    return errors.internal()
  }
}
