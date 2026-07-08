/**
 * GET /api/student-portal/roll-number-slip
 *
 * Returns a combined payload for the authenticated student's Roll Number Slip
 * (exam admit card):
 *   - Student identity: name, father name, registration number, roll number,
 *     profile picture, gender
 *   - Section & shift details from the active StudentEnrollment
 *   - Published ExamDateSheet for the resolved section + requested academic year
 *     (examSessionId = AcademicYear.id per the exam-sessions catalog convention)
 *
 * Authorization: STUDENT role only. Data is scoped exclusively to the
 * authenticated user's own enrollment — no cross-student access is possible.
 *
 * Query params:
 *   examSessionId  — optional AcademicYear.id to filter the date sheet.
 *                    If omitted, the most recent published sheet for the
 *                    student's section is returned.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // WHY: Roll number slips are strictly student-facing. Admins/teachers do not
  // need this endpoint — they can access date sheets via the admin date-sheets page.
  if (!checkPermission(session.user.role as Role, 'exams', 'read')) {
    return errors.forbidden()
  }

  if (session.user.role !== 'STUDENT') {
    return errors.forbidden()
  }

  const { searchParams } = new URL(request.url)
  const examSessionId = searchParams.get('examSessionId') ?? undefined

  // ── Step 1: Resolve student from authenticated user ──────────────────────────
  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fatherName: true,
      registrationNumber: true,
      rollNumber: true,
      profilePicture: true,
      gender: true,
      shift: true,
      campus: { select: { name: true } },
      batch: { select: { name: true, code: true } },
    },
  })

  if (!student) {
    return errors.notFound('Student profile not found for the authenticated user.')
  }

  // ── Step 2: Resolve active Academic Engine enrollment ────────────────────────
  // WHY: The enrollment carries the section-specific roll number and the
  // classSectionId needed to look up the date sheet. We prefer the Academic
  // Engine enrollment over the legacy classId on the Student record.
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      studentId: student.id,
      status: 'ACTIVE',
    },
    select: {
      rollNumber: true,
      classSectionId: true,
      classSection: {
        select: {
          className: true,
          sectionName: true,
          shift: { select: { name: true, code: true } },
          batch: { select: { name: true, code: true } },
          campus: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!enrollment) {
    return successResponse(
      null,
      'No active enrollment found. Contact administration to be assigned to a class section.',
    )
  }

  // ── Step 3: Fetch published date sheet for the student's section ─────────────
  const dateSheet = await prisma.examDateSheet.findFirst({
    where: {
      classSectionId: enrollment.classSectionId,
      isPublished: true,
      ...(examSessionId ? { examSessionId } : {}),
    },
    select: {
      id: true,
      title: true,
      version: true,
      examSessionId: true,
      slots: {
        select: {
          id: true,
          examDate: true,
          startTime: true,
          endTime: true,
          roomNumber: true,
          subjectOffering: {
            select: {
              subject: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: { examDate: 'asc' },
      },
    },
    // WHY: If no examSessionId filter, return the most recently published
    // sheet (updated last) to avoid showing stale data.
    orderBy: { updatedAt: 'desc' },
  })

  // ── Step 4: Resolve academic year name for display ───────────────────────────
  let academicYearName: string | null = null
  if (dateSheet?.examSessionId) {
    const year = await prisma.academicYear.findUnique({
      where: { id: dateSheet.examSessionId },
      select: { name: true, isActive: true },
    })
    academicYearName = year ? (year.isActive ? `${year.name} (Active)` : year.name) : null
  }

  // ── Step 5: Compose final response ──────────────────────────────────────────
  // Prefer enrollment.rollNumber (Academic Engine, section-scoped) over
  // the legacy student.rollNumber field.
  const resolvedRollNumber = enrollment.rollNumber || student.rollNumber || '—'

  return successResponse({
    student: {
      name: `${student.firstName} ${student.lastName}`,
      fatherName: student.fatherName,
      registrationNumber: student.registrationNumber,
      rollNumber: resolvedRollNumber,
      profilePicture: student.profilePicture ?? null,
      gender: student.gender,
      campus: enrollment.classSection.campus.name,
      batch: enrollment.classSection.batch.name,
    },
    section: {
      className: enrollment.classSection.className,
      sectionName: enrollment.classSection.sectionName,
      shiftName: enrollment.classSection.shift?.name ?? student.shift,
      shiftCode: enrollment.classSection.shift?.code ?? student.shift,
    },
    examSession: {
      id: dateSheet?.examSessionId ?? null,
      name: academicYearName,
    },
    dateSheet: dateSheet
      ? {
          title: dateSheet.title,
          version: dateSheet.version,
          slots: dateSheet.slots.map((slot) => ({
            id: slot.id,
            subjectName: slot.subjectOffering.subject.name,
            subjectCode: slot.subjectOffering.subject.code,
            examDate: slot.examDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            roomNumber: slot.roomNumber ?? null,
          })),
        }
      : null,
  })
}
