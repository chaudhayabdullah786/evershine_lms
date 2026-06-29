/**
 * GET  /api/academic-upgrades/date-sheets  — fetch date sheet for student or class section
 * POST /api/academic-upgrades/date-sheets  — create or replace a date sheet with its slots
 *
 * Authorization:
 *   GET  — any authenticated role with exams.read
 *   POST — SUPER_ADMIN / ADMIN with exams.create
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService, type SaveDateSheetInput } from '@/lib/services/academic-upgrades-service'
import { saveDateSheetSchema } from '@/lib/validation/academic-upgrades'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'exams', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const studentId      = searchParams.get('studentId')
  const classSectionId = searchParams.get('classSectionId')
  const examSessionId  = searchParams.get('examSessionId')

  try {
    if (studentId) {
      const sheet = await AcademicUpgradesService.getStudentDateSheet(
        studentId,
        examSessionId ?? undefined,
      )
      return successResponse(sheet)
    }

    if (classSectionId && examSessionId) {
      const slots = await AcademicUpgradesService.getDateSheetSlots(classSectionId, examSessionId)
      return successResponse(slots)
    }

    return errors.badRequest(
      'Provide either studentId, or both classSectionId and examSessionId.',
    )
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to fetch date sheet.')
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'exams', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() }
  catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never) }

  const parsed = saveDateSheetSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    const payload: SaveDateSheetInput = {
      classSectionId: parsed.data.classSectionId!,
      examSessionId: parsed.data.examSessionId!,
      title: parsed.data.title!,
      slots: parsed.data.slots!.map((slot) => ({
        subjectOfferingId: slot.subjectOfferingId!,
        examDate: slot.examDate!,
        startTime: slot.startTime!,
        endTime: slot.endTime!,
        roomNumber: slot.roomNumber,
      })),
      createdById: session.user.id,
    }
    const sheet = await AcademicUpgradesService.saveDateSheet(payload)
    return successResponse(sheet, 'Date sheet saved successfully.')
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to save date sheet.')
  }
}
