/**
 * PATCH /api/users/[id]/role — Elevate, update, or toggle roles/statuses of users
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const updateRoleSchema = z.object({
  firstName: z.string().min(1, 'First name cannot be empty').max(50).optional(),
  lastName: z.string().min(1, 'Last name cannot be empty').max(50).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'ACCOUNTANT', 'GUARDIAN']).optional(),
  campusId: z.string().optional(),
  department: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<unknown> }
) {
  const session = await auth()
  if (!session?.user) {
    return errors.unauthorized()
  }

  // Only SUPER_ADMIN and ADMIN are allowed to perform user elevations/updates
  if (session.user.role !== 'SUPER_ADMIN' && session.user.role !== 'ADMIN') {
    return errors.forbidden()
  }

  const { id: userId } = await props.params as { id: string }

  let body: any
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON payload' }] } as never)
  }

  const parsed = updateRoleSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation({
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    } as never)
  }

  const { firstName, lastName, role, campusId, department, isActive } = parsed.data

  // Safety Gate: Prevent self-lockout or self-demotion
  if (session.user.id === userId) {
    if (isActive === false) {
      return errors.validation({
        errors: [{ path: ['isActive'], message: 'You cannot deactivate your own account' }],
      } as never)
    }
    if (role && role !== session.user.role) {
      return errors.validation({
        errors: [{ path: ['role'], message: 'You cannot modify your own administrative role' }],
      } as never)
    }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        admin: true,
        teacher: true,
        student: true,
        accountant: true,
      },
    })

    if (!user) {
      return errors.notFound('User')
    }

    // Security Gate: ADMINs cannot modify SUPER_ADMIN users, nor suspend other administrators (ADMIN/SUPER_ADMIN)
    if (session.user.role === 'ADMIN') {
      const userRole = user.role as unknown as string
      if (userRole === 'SUPER_ADMIN') {
        return errors.forbidden('Administrators cannot modify Super Administrator profiles.')
      }
      if (role === 'SUPER_ADMIN') {
        return errors.forbidden('Administrators cannot elevate accounts to Super Administrator.')
      }
      if (isActive !== undefined && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN')) {
        return errors.forbidden('Administrators cannot suspend or reactivate other administrative accounts.')
      }
    }

    const auditChanges: Record<string, any> = {}

    await prisma.$transaction(async (tx) => {
      // 1. Prepare User update data
      const userUpdate: Record<string, any> = {}
      if (role !== undefined && role !== user.role) {
        userUpdate.role = role as Role
        auditChanges.role = role
      }
      if (isActive !== undefined) {
        userUpdate.isActive = isActive
        auditChanges.isActive = isActive
      }

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdate,
        })
      }

      // 2. Prepare Profile-specific updates (focus on ADMIN/SUPER_ADMIN profiles)
      const targetRole = role ?? user.role

      if (targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN') {
        const existingAdmin = user.admin

        // Obtain default name if not provided
        const fName = firstName ?? existingAdmin?.firstName ?? user.teacher?.firstName ?? user.student?.firstName ?? 'Admin'
        const lName = lastName ?? existingAdmin?.lastName ?? user.teacher?.lastName ?? user.student?.lastName ?? 'User'
        
        // Find default campus if not provided
        let targetCampusId = campusId ?? existingAdmin?.campusId
        if (!targetCampusId) {
          // Fall back to first available campus or requester's campus
          const firstCampus = await tx.campus.findFirst({ where: { isActive: true } })
          targetCampusId = firstCampus?.id ?? 'default-campus'
        }

        if (existingAdmin) {
          // Update existing admin profile
          await tx.admin.update({
            where: { id: existingAdmin.id },
            data: {
              firstName: fName,
              lastName: lName,
              campusId: targetCampusId,
              department: department !== undefined ? department : existingAdmin.department,
              isActive: isActive !== undefined ? isActive : existingAdmin.isActive,
            },
          })
          auditChanges.adminProfile = 'UPDATED'
        } else {
          // Create new admin profile since it does not exist
          await tx.admin.create({
            data: {
              userId: user.id,
              firstName: fName,
              lastName: lName,
              campusId: targetCampusId,
              department: department || null,
              isActive: true,
            },
          })
          auditChanges.adminProfile = 'CREATED'
        }
      }

      // If user's status is updated, propagate to roles if appropriate
      if (isActive !== undefined) {
        if (user.admin) {
          await tx.admin.update({ where: { id: user.admin.id }, data: { isActive } })
        }
        if (user.teacher) {
          await tx.teacher.update({ where: { id: user.teacher.id }, data: { isActive } })
        }
        if (user.student) {
          await tx.student.update({
            where: { id: user.student.id },
            data: { 
              isActive,
              enrollmentStatus: isActive ? 'ACTIVE' : 'SUSPENDED'
            }
          })
        }
        if (user.accountant) {
          await tx.accountant.update({ where: { id: user.accountant.id }, data: { isActive } })
        }
      }

      // 3. Log Audit Trail
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'UPDATE',
          entityType: 'UserRole',
          entityId: userId,
          changes: auditChanges,
        },
      })
    })

    return successResponse(null, { message: 'User role and assignments updated successfully' })
  } catch (err: any) {
    console.error('[USER_ROLE_UPDATE_ERROR]', err)
    try {
      const logPath = '/home/ibadat/Downloads/LMS/Evershaheen-Academy-Management-System-main/log_deactivation.txt'
      fs.writeFileSync(logPath, `TIMESTAMP: ${new Date().toISOString()}\nERROR MESSAGE: ${err.message}\nSTACK: ${err.stack}\n`, { flag: 'a' })
    } catch (logErr) {
      console.error('Failed to write log file', logErr)
    }
    return errors.internal()
  }
}
