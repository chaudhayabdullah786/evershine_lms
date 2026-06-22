/**
 * Guardian link utilities.
 *
 * WHY two variants:
 * - `linkGuardianToStudent` (tx): kept for legacy callers that already hold a
 *   TransactionClient. AVOID calling inside long transactions — argon2 hashing
 *   is CPU-bound and can exceed the Prisma default 5-second tx timeout (P2028).
 * - `linkGuardianToStudentDirect` (prisma): preferred for new admissions.
 *   Runs outside the student-creation transaction so hashing does not race
 *   against the tx deadline. A guardian-link failure is non-fatal: the student
 *   record already exists and can be linked manually from the profile page.
 */

import { hash } from '@node-rs/argon2'
import { prisma as globalPrisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export interface GuardianLinkInput {
  firstName: string
  lastName?: string
  cnic: string
  phoneNumber: string
  email?: string
  relationship?: string
}

// ─── Internal: resolve or create guardian using any DB client ────────────────

async function _resolveGuardianId(
  db: Prisma.TransactionClient | typeof globalPrisma,
  input: GuardianLinkInput,
  precomputedHash: string
): Promise<string> {
  const cnic = input.cnic.replace(/\D/g, '')

  // Reuse existing guardian for this CNIC
  const existing = await db.guardian.findUnique({ where: { cnic } })
  if (existing) return existing.id

  const targetEmail = input.email?.trim() || `guardian_${cnic}@evershaheen.edu`

  let guardianUser = await db.user.findUnique({ where: { email: targetEmail } })
  if (!guardianUser) {
    guardianUser = await db.user.create({
      data: {
        email: targetEmail,
        passwordHash: precomputedHash,
        role: 'GUARDIAN',
        isActive: true,
      },
    })
  }

  const guardian = await db.guardian.create({
    data: {
      userId: guardianUser.id,
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      cnic,
      phoneNumber: input.phoneNumber,
      email: input.email || null,
      relationship: input.relationship ?? 'Guardian',
    },
  })

  return guardian.id
}

// ─── Legacy transactional variant (kept for compatibility) ───────────────────
// WARNING: Do NOT call inside a long-running transaction.
// Argon2 with memoryCost=65536 takes 2-4s which will exceed Prisma's 5s timeout.

/** @deprecated Use linkGuardianToStudentDirect for new code. */
export async function resolveGuardianId(
  tx: Prisma.TransactionClient,
  input: GuardianLinkInput,
  passwordSeed?: string
): Promise<string> {
  const cnic = input.cnic.replace(/\D/g, '')
  const rawPassword = passwordSeed ?? cnic
  const passwordHash = await hash(rawPassword, ARGON2_OPTIONS)
  return _resolveGuardianId(tx, input, passwordHash)
}

/** @deprecated Use linkGuardianToStudentDirect for new code. */
export async function linkGuardianToStudent(
  tx: Prisma.TransactionClient,
  studentId: string,
  input: GuardianLinkInput
): Promise<string> {
  const guardianId = await resolveGuardianId(tx, input)
  await tx.student.update({
    where: { id: studentId },
    data: { guardians: { connect: { id: guardianId } } },
  })
  return guardianId
}

// ─── Non-transactional variant (preferred) ───────────────────────────────────

/**
 * Find-or-create a guardian and link them to a student.
 * Runs outside any transaction — safe to call after the student tx commits.
 *
 * WHY outside transaction:
 * - Argon2 hashing (memoryCost=65536) is CPU-bound and takes 2-4 seconds.
 * - Prisma's interactive transaction timeout is 5 seconds by default.
 * - Running hash() inside the tx reliably causes P2028 (transaction expired).
 * - Guardian linking is not atomically required with student creation:
 *   if it fails, the student still exists and the admin can re-link via profile.
 */
export async function linkGuardianToStudentDirect(
  studentId: string,
  input: GuardianLinkInput
): Promise<{ guardianId: string }> {
  const cnic = input.cnic.replace(/\D/g, '')

  // WHY hash before DB: compute the expensive hash before opening any DB
  // connection so the argon2 CPU time does not block a connection slot.
  const passwordHash = await hash(cnic, ARGON2_OPTIONS)

  const guardianId = await _resolveGuardianId(globalPrisma, input, passwordHash)

  await globalPrisma.student.update({
    where: { id: studentId },
    data: { guardians: { connect: { id: guardianId } } },
  })

  return { guardianId }
}
