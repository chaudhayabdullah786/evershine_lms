/**
 * Guardian Ward Ownership Assertion
 *
 * WHY: Every guardian API handler must verify the session guardian is actually
 * linked to the requested student before returning any data. Centralising this
 * check prevents accidental omission in individual route handlers.
 *
 * USAGE: Call at the top of every guardian route handler before any DB read.
 *   await assertGuardianOwnsStudent(session.user.id, params.studentId)
 */

import { prisma } from '@/lib/prisma'
import { ForbiddenError } from '@/lib/errors'

/**
 * Throws ForbiddenError if the guardian identified by `guardianUserId`
 * does not have the student identified by `studentId` in their ward list.
 *
 * @param guardianUserId - User.id of the authenticated guardian (from session)
 * @param studentId      - Student.id being requested
 * @throws {ForbiddenError} GUARDIAN_WARD_ACCESS_DENIED if not linked
 */
export async function assertGuardianOwnsStudent(
  guardianUserId: string,
  studentId: string
): Promise<void> {
  // Single query: join through Guardian → students M:N relation.
  // We select only the minimal fields needed for the membership check.
  const guardian = await prisma.guardian.findUnique({
    where: { userId: guardianUserId },
    select: {
      id: true,
      students: {
        where: { id: studentId },
        select: { id: true },
      },
    },
  })

  // Guard covers two cases:
  // 1. No Guardian profile exists for this user (misconfigured account)
  // 2. The student is not in this guardian's ward list
  if (!guardian || guardian.students.length === 0) {
    throw new ForbiddenError(
      'GUARDIAN_WARD_ACCESS_DENIED',
      'You are not authorised to access this student\'s data.'
    )
  }
}
