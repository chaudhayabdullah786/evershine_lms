/**
 * POST /api/users/create-accountant
 *
 * Provisions a new Account Manager: creates User (role=ACCOUNTANT) +
 * Accountant profile in a single atomic transaction.
 *
 * WHY separate from create-admin: The Accountant model shape differs from Admin
 * (requires employeeId, phoneNumber; no department). Using a dedicated endpoint
 * keeps schema validation tight and avoids coupling two unrelated domains.
 *
 * Access: SUPER_ADMIN only.
 * Financial staff have sensitive cross-module access; only Super Admin should
 * be able to provision them, unlike general ADMIN accounts which an ADMIN can also create.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'

// WHY these exact Argon2id parameters: Matches the established project-wide
// hashing config in create-admin and reset-credentials routes.
// memoryCost 64 MiB, timeCost 3 passes, parallelism 4, 32-byte output.
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

const createAccountantSchema = z.object({
  firstName:    z.string().min(1, 'First name is required').max(50).trim(),
  lastName:     z.string().min(1, 'Last name is required').max(50).trim(),
  email:        z.string().email('Invalid email address').toLowerCase().trim(),
  password:     z.string().min(8, 'Password must be at least 8 characters'),
  phoneNumber:  z.string().min(7, 'Phone number is required').max(20).trim(),
  campusId:     z.string().cuid('Campus ID is invalid').or(z.literal('ALL')),
  // employeeId is auto-generated if not supplied.
  // We use a union to allow empty strings from the frontend to pass as undefined.
  employeeId:   z.union([z.literal(''), z.string().min(2).max(30).trim()]).optional(),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // SUPER_ADMIN gate: only the highest-privilege role can provision finance staff
  if (session.user.role !== 'SUPER_ADMIN') {
    return errors.forbidden('Only Super Administrators can create Account Manager accounts.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON payload' }] } as never)
  }

  const parsed = createAccountantSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation({
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    } as never)
  }

  const { firstName, lastName, email, password, phoneNumber, campusId, employeeId } = parsed.data

  // Validate campus exists before doing any writes (if not ALL)
  let resolvedCampusName = 'All Campuses'
  let resolvedCampusId: string | null = null
  
  if (campusId !== 'ALL') {
    const campus = await prisma.campus.findUnique({ where: { id: campusId } })
    if (!campus) {
      return errors.validation({
        errors: [{ path: ['campusId'], message: 'The selected campus does not exist' }],
      } as never)
    }
    resolvedCampusName = campus.name
    resolvedCampusId = campus.id
  }

  // Reject duplicate logins upfront to avoid a DB unique constraint error
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    return errors.validation({
      errors: [{ path: ['email'], message: 'This email address is already registered in the system' }],
    } as never)
  }

  // Generate employee ID if caller did not supply one.
  // Format: ACC-{YYYY}-{4-digit zero-padded count}
  // WHY: Predictable, human-readable IDs aid the finance office in cross-referencing records.
  let resolvedEmployeeId = employeeId
  if (!resolvedEmployeeId) {
    const existingCount = await prisma.accountant.count()
    resolvedEmployeeId = `ACC-${new Date().getFullYear()}-${String(existingCount + 1).padStart(4, '0')}`
  }

  // Reject duplicate employee IDs (caller-supplied)
  const existingEmpId = await prisma.accountant.findUnique({
    where: { employeeId: resolvedEmployeeId },
  })
  if (existingEmpId) {
    return errors.validation({
      errors: [{ path: ['employeeId'], message: 'This Employee ID is already assigned to another accountant' }],
    } as never)
  }

  const passwordHash = await hash(password, ARGON2_OPTIONS)

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the authentication User record
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'ACCOUNTANT',
          isActive: true,
        },
      })

      // 2. Create the Accountant profile (campus-scoped)
      const newAccountant = await tx.accountant.create({
        data: {
          user:       { connect: { id: newUser.id } },
          firstName,
          lastName,
          employeeId: resolvedEmployeeId!,
          phoneNumber,
          ...(resolvedCampusId ? { campus: { connect: { id: resolvedCampusId } } } : {}),
          isActive:   true,
        },
      })

      // 3. Mandatory audit trail for all credential-creation events
      await tx.auditLog.create({
        data: {
          userId:     session.user.id,
          action:     'CREATE',
          entityType: 'AccountantProfile',
          entityId:   newUser.id,
          changes:    { email, firstName, lastName, employeeId: resolvedEmployeeId, campusId: resolvedCampusId, campus: resolvedCampusName },
        },
      })

      return { userId: newUser.id, accountantId: newAccountant.id, employeeId: resolvedEmployeeId }
    })

    return createdResponse(result, 'Account Manager created successfully')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[CREATE_ACCOUNTANT_ERROR]', msg)
    return errors.internal()
  }
}
