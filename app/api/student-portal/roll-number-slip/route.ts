/**
 * GET /api/student-portal/roll-number-slip
 *
 * Returns the authenticated student's Roll Number Slip payload:
 *   - Student identity: name, father name, registration number, roll number,
 *     profile picture, gender
 *   - Section & shift details from the active Academic Engine enrollment
 *     (falls back to legacy Student.class when no AE enrollment exists)
 *   - Published ExamDateSheet via AcademicUpgradesService.getStudentDateSheet()
 *     which implements a two-strategy lookup:
 *       1. Exact classSectionId match
 *       2. Sibling section fallback (same className + campusId, any section)
 *
 * Authorization: STUDENT role only. All data is scoped to the authenticated
 * user's own records via userId → Student → StudentEnrollment — no
 * cross-student access is possible.
 *
 * Query params:
 *   examSessionId  — optional AcademicYear.id. If omitted, the active
 *                    academic year's ID is used as the default session.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getActiveEnrollmentsForStudent } from '@/lib/academic/student-enrollment'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  if (!checkPermission(session.user.role as Role, 'exams', 'read')) {
    return errors.forbidden()
  }
  // WHY: This endpoint is student-facing only. Admins access date sheets
  // via the dedicated /dashboard/exams/date-sheets admin page.
  if (session.user.role !== 'STUDENT') {
    return errors.forbidden()
  }

  const { searchParams } = new URL(request.url)
  const examSessionIdParam = searchParams.get('examSessionId') ?? undefined

  // ── Step 1: Resolve student profile ─────────────────────────────────────────
  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    select: {
      id:                 true,
      firstName:          true,
      lastName:           true,
      fatherName:         true,
      registrationNumber: true,
      rollNumber:         true,
      profilePicture:     true,
      gender:             true,
      shift:              true,
      section:            true,
      campus:             { select: { name: true } },
      batch:              { select: { name: true } },
      // Legacy class reference — used when no Academic Engine enrollment exists
      class:              { select: { name: true, grade: true, shift: true } },
    },
  })

  if (!student) {
    return errors.notFound('Student profile not found for the authenticated user.')
  }

  // ── Step 2: Resolve active Academic Engine enrollment ────────────────────────
  // WHY: We use getActiveAcademicYear + getActiveEnrollmentsForStudent (same
  // pattern as the student enrollment portal) to ensure enrollment scoping is
  // consistent across the student dashboard. This avoids returning a stale
  // enrollment from a previous academic year.
  const activeYear = await getActiveAcademicYear()

  const enrollments = activeYear
    ? await getActiveEnrollmentsForStudent(student.id, activeYear.id)
    : []

  const enrollment = enrollments[0] ?? null

  // ── Step 3: Build section display info ───────────────────────────────────────
  // Prefer Academic Engine enrollment; fall back to legacy Student.class fields.
  let sectionInfo: {
    className:   string
    sectionName: string
    shiftName:   string
    shiftCode:   string
    rollNumber:  string
    campus:      string
    batch:       string
  }

  if (enrollment) {
    sectionInfo = {
      className:   enrollment.classSection.className,
      sectionName: enrollment.classSection.sectionName,
      shiftName:   enrollment.classSection.shift?.name ?? student.shift ?? '—',
      shiftCode:   enrollment.classSection.shift?.code ?? student.shift ?? '—',
      rollNumber:  enrollment.rollNumber || student.rollNumber || '—',
      campus:      enrollment.classSection.campus.name,
      batch:       enrollment.classSection.batch.name,
    }
  } else if (student.class) {
    // Legacy fallback: student created before the Academic Engine migration
    sectionInfo = {
      className:   student.class.name,
      sectionName: student.section ?? 'A',
      shiftName:   student.class.shift ?? student.shift ?? '—',
      shiftCode:   student.shift ?? '—',
      rollNumber:  student.rollNumber || '—',
      campus:      student.campus.name,
      batch:       student.batch.name,
    }
  } else {
    return successResponse(
      null,
      'No active class enrollment found. Contact administration to be assigned to a class section.',
    )
  }

  // ── Step 4: Resolve exam session ID ─────────────────────────────────────────
  // If no examSessionId is specified by the client, default to the active
  // academic year so the "Latest Published Sheet" option works correctly.
  const resolvedSessionId = examSessionIdParam ?? activeYear?.id

  // ── Step 5: Fetch date sheet via service (Strategy 1 → Strategy 2 fallback) ──
  let dateSheetRaw: Awaited<ReturnType<typeof AcademicUpgradesService.getStudentDateSheet>> = null
  try {
    dateSheetRaw = await AcademicUpgradesService.getStudentDateSheet(
      student.id,
      resolvedSessionId,
    )
  } catch {
    // Service throws when student has no enrollment at all — treat as null.
    dateSheetRaw = null
  }

  // ── Step 6: Resolve academic year display name ───────────────────────────────
  let examSessionName: string | null = null
  if (resolvedSessionId) {
    const year = await prisma.academicYear.findUnique({
      where:  { id: resolvedSessionId },
      select: { name: true, isActive: true },
    })
    examSessionName = year
      ? (year.isActive ? `${year.name} (Active)` : year.name)
      : null
  }

  // ── Step 7: Compose and return ───────────────────────────────────────────────
  return successResponse({
    student: {
      name:               `${student.firstName} ${student.lastName}`,
      fatherName:         student.fatherName,
      registrationNumber: student.registrationNumber,
      rollNumber:         sectionInfo.rollNumber,
      profilePicture:     student.profilePicture ?? null,
      gender:             student.gender,
      campus:             sectionInfo.campus,
      batch:              sectionInfo.batch,
    },
    section: {
      className:   sectionInfo.className,
      sectionName: sectionInfo.sectionName,
      shiftName:   sectionInfo.shiftName,
      shiftCode:   sectionInfo.shiftCode,
    },
    examSession: {
      id:   resolvedSessionId ?? null,
      name: examSessionName,
    },
    dateSheet: dateSheetRaw
      ? {
          title:   dateSheetRaw.title,
          version: dateSheetRaw.version,
          slots:   dateSheetRaw.slots.map((slot) => ({
            id:          slot.id,
            subjectName: slot.subjectOffering.subject.name,
            subjectCode: slot.subjectOffering.subject.code,
            examDate:    slot.examDate,
            startTime:   slot.startTime,
            endTime:     slot.endTime,
            roomNumber:  slot.roomNumber ?? null,
          })),
        }
      : null,
  })
}
