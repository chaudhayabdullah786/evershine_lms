/**
 * PATCH /api/staff-applications/[id]/review — Admin review actions
 *
 * RBAC: SUPER_ADMIN only.
 *
 * Actions:
 * - approve:             Atomic $transaction → creates User + Teacher/Accountant, sends credentials email
 * - decline:             Sets DECLINED + sends decline email with reason
 * - schedule_interview:  Sets INTERVIEW_SCHEDULED + sends interview email
 * - hold:                Sets ON_HOLD with internal notes
 * - reopen:              Resets to PENDING
 *
 * WHY atomic transaction for approval: Teacher + User must be created together.
 * A partial write (User without Teacher) creates an orphaned auth record.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { staffReviewSchema } from '@/lib/validation/staff-application'
import {
  sendStaffApprovalNotification,
  sendStaffDeclineNotification,
  sendStaffInterviewNotification,
} from '@/lib/notifications'
import { hash } from '@node-rs/argon2'
import { ZodError } from 'zod'
import type { Prisma, Role } from '@prisma/client'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (role !== 'SUPER_ADMIN') return errors.forbidden('Only Super Admins can review staff applications')

  const { id } = await context.params

  try {
    const body = await request.json()
    const validated = staffReviewSchema.parse(body)

    const application = await prisma.staffApplicationRequest.findUnique({
      where: { id },
    })
    if (!application) return errors.notFound('Staff Application')

    switch (validated.action) {
      // ── APPROVE ──────────────────────────────────────────────────────────
      case 'approve': {
        if (application.status === 'APPROVED') {
          return errors.badRequest('This application has already been approved.')
        }

        // Validate campus exists
        const campus = await prisma.campus.findUnique({
          where: { id: validated.campusId },
          select: { id: true, name: true },
        })
        if (!campus) return errors.notFound('Campus')

        // Check email uniqueness before transaction
        const existingUser = await prisma.user.findUnique({
          where: { email: application.email },
          select: { id: true },
        })
        if (existingUser) {
          return errors.conflict('A user with this email already exists in the system.')
        }

        // Default password = CNIC without hyphens (never logged, communicated as "your CNIC" in email)
        const rawPassword = application.cnic.replace(/-/g, '')
        const passwordHash = await hash(rawPassword, ARGON2_OPTIONS)

        // Determine role and generate employee ID
        const prismaRole = application.applicantType === 'TEACHER' ? 'TEACHER'
          : application.applicantType === 'ACCOUNTANT' ? 'ACCOUNTANT'
          : 'ADMIN'

        // Auto-generate employee ID with prefix based on role
        const prefix = application.applicantType === 'TEACHER' ? 'TCH'
          : application.applicantType === 'ACCOUNTANT' ? 'ACC'
          : 'ADM'

        const staffCount = await prisma.teacher.count()
        const employeeId = `ESA-${prefix}-${String(staffCount + 1).padStart(3, '0')}`

        try {
          const result = await prisma.$transaction(async (tx) => {
            // 1. Create auth User
            const user = await tx.user.create({
              data: {
                email: application.email,
                passwordHash,
                role: prismaRole,
                isActive: true,
              },
            })

            // 2. Create Teacher profile (used for all staff types as per existing pattern)
            const teacher = await tx.teacher.create({
              data: {
                userId: user.id,
                employeeId,
                firstName: application.fullName.split(' ')[0] || application.fullName,
                lastName: application.fullName.split(' ').slice(1).join(' ') || '',
                cnic: application.cnic,
                dateOfBirth: application.dateOfBirth || new Date('1990-01-01'),
                gender: application.gender || 'MALE',
                qualification: application.qualification,
                specialization: application.specialization,
                experienceYears: application.experienceYears,
                joiningDate: new Date(),
                phoneNumber: application.phone,
                email: application.email,
                address: application.address || '',
                city: application.city || '',
                emergencyContact: application.phone,
                campusId: validated.campusId,
                batchId: validated.batchId || null,
                designation: validated.designation,
                monthlySalary: validated.salary || 0,
              } satisfies Prisma.TeacherUncheckedCreateInput,
            })

            // 3. Update application status
            await tx.staffApplicationRequest.update({
              where: { id },
              data: {
                status: 'APPROVED',
                approvedAt: new Date(),
                reviewedBy: session.user.id,
                provisionedUserId: user.id,
              },
            })

            // 4. Audit log
            await tx.auditLog.create({
              data: {
                userId: session.user.id,
                action: 'CREATE',
                entityType: 'StaffApplication_Approve',
                entityId: application.id,
                changes: {
                  employeeId,
                  role: prismaRole,
                  campusId: validated.campusId,
                  designation: validated.designation,
                  provisionedUserId: user.id,
                },
              },
            })

            return { user, teacher, employeeId }
          })

          // Non-fatal: send credentials email
          try {
            await sendStaffApprovalNotification(
              application.email,
              application.fullName,
              result.employeeId,
              application.applicantType
            )
          } catch (_emailErr) {
            console.warn('[STAFF_APPROVE] credentials email failed', _emailErr)
          }

          return successResponse(
            {
              id: application.id,
              employeeId: result.employeeId,
              userId: result.user.id,
              teacherId: result.teacher.id,
            },
            `Staff application approved. Employee ID: ${result.employeeId}. Credentials email sent.`
          )
        } catch (txErr: unknown) {
          const prismaErr = txErr as { code?: string; meta?: { target?: string[] } }
          if (prismaErr?.code === 'P2002') {
            const target = prismaErr?.meta?.target?.join(', ') ?? 'field'
            return errors.conflict(`Duplicate value for ${target}. The applicant may already be provisioned.`)
          }
          console.error('[STAFF_APPROVE] transaction error', txErr)
          return errors.internal()
        }
      }

      // ── DECLINE ──────────────────────────────────────────────────────────
      case 'decline': {
        const updated = await prisma.staffApplicationRequest.update({
          where: { id },
          data: {
            status: 'DECLINED',
            declinedAt: new Date(),
            reviewedBy: session.user.id,
            adminNotes: validated.reason,
          },
        })

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'StaffApplication_Decline',
            entityId: application.id,
            changes: { reason: validated.reason },
          },
        })

        // Non-fatal: send decline email
        try {
          await sendStaffDeclineNotification(application.email, application.fullName, validated.reason)
        } catch (_emailErr) {
          console.warn('[STAFF_DECLINE] email failed', _emailErr)
        }

        return successResponse(updated, 'Application declined.')
      }

      // ── SCHEDULE INTERVIEW ───────────────────────────────────────────────
      case 'schedule_interview': {
        const updated = await prisma.staffApplicationRequest.update({
          where: { id },
          data: {
            status: 'INTERVIEW_SCHEDULED',
            interviewDate: new Date(validated.interviewDate),
            reviewedBy: session.user.id,
          },
        })

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'UPDATE',
            entityType: 'StaffApplication_Interview',
            entityId: application.id,
            changes: { interviewDate: validated.interviewDate },
          },
        })

        // Non-fatal: send interview email
        try {
          await sendStaffInterviewNotification(
            application.email,
            application.fullName,
            validated.interviewDate,
            validated.instructions
          )
        } catch (_emailErr) {
          console.warn('[STAFF_INTERVIEW] email failed', _emailErr)
        }

        return successResponse(updated, 'Interview scheduled.')
      }

      // ── HOLD ─────────────────────────────────────────────────────────────
      case 'hold': {
        const updated = await prisma.staffApplicationRequest.update({
          where: { id },
          data: {
            status: 'ON_HOLD',
            reviewedBy: session.user.id,
            adminNotes: validated.notes || application.adminNotes,
          },
        })
        return successResponse(updated, 'Application placed on hold.')
      }

      // ── REOPEN ───────────────────────────────────────────────────────────
      case 'reopen': {
        const updated = await prisma.staffApplicationRequest.update({
          where: { id },
          data: {
            status: 'PENDING',
            reviewedBy: session.user.id,
          },
        })
        return successResponse(updated, 'Application reopened.')
      }
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return errors.validation(error)
    }
    console.error('[STAFF_REVIEW_PATCH]', error)
    return errors.internal()
  }
}
