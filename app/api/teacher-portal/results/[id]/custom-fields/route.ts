/**
 * POST   /api/teacher-portal/results/[id]/custom-fields  — Add field
 * PATCH  /api/teacher-portal/results/[id]/custom-fields  — Edit field by index
 * DELETE /api/teacher-portal/results/[id]/custom-fields  — Remove field by index
 *
 * Custom fields are stored as Json array on TermResult:
 *   [{ label: string, value: string }]
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import type { Prisma } from '@prisma/client'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { parseCustomResultFields, type CustomResultField } from '@/lib/academic/result-fields'

const fieldSchema = z.object({
  label: z.string().trim().min(1, 'Field label required').max(100),
  value: z.string().trim().max(500),
})

const patchSchema = z.object({
  index: z.number().int().min(0),
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().max(500),
})

const deleteSchema = z.object({
  index: z.number().int().min(0),
})

const MAX_CUSTOM_FIELDS = 25

async function getResult(id: string) {
  return prisma.termResult.findUnique({
    where: { id },
    select: {
      id: true,
      classSectionId: true,
      declarationStatus: true,
      customFields: true,
    },
  })
}

function toJsonFields(fields: CustomResultField[]): Prisma.InputJsonArray {
  return fields.map((field) => ({ label: field.label, value: field.value }))
}

async function persistDraftFields(id: string, fields: CustomResultField[]) {
  const customFields = toJsonFields(fields)
  const updated = await prisma.termResult.updateMany({
    where: { id, declarationStatus: 'DRAFT' },
    data: { customFields },
  })

  return updated.count === 1 ? customFields : null
}

async function authorizeDraftResult(teacherId: string, id: string) {
  const result = await getResult(id)
  if (!result) return { response: errors.notFound('Result') } as const

  const canAccess = await teacherCanAccessClassSection(teacherId, result.classSectionId)
  if (!canAccess) return { response: errors.forbidden() } as const

  if (result.declarationStatus !== 'DRAFT') {
    return {
      response: errors.conflict('Declared result fields are locked and cannot be changed.'),
    } as const
  }

  return { result } as const
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = fieldSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const authorized = await authorizeDraftResult(teacher.id, id)
    if ('response' in authorized) return authorized.response
    const { result } = authorized

    const fields = parseCustomResultFields(result.customFields)
    if (fields.length >= MAX_CUSTOM_FIELDS) {
      return errors.badRequest(`A result can contain at most ${MAX_CUSTOM_FIELDS} custom fields.`)
    }
    fields.push({ label: parsed.data.label, value: parsed.data.value })

    const customFields = await persistDraftFields(id, fields)
    if (!customFields) {
      return errors.conflict('This result was declared while the field was being added. Refresh to view its final state.')
    }

    return successResponse({ customFields }, 'Custom field added successfully')
  } catch (err) {
    console.error('[CUSTOM_FIELDS_POST]', err)
    return errors.internal()
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const authorized = await authorizeDraftResult(teacher.id, id)
    if ('response' in authorized) return authorized.response
    const { result } = authorized

    const fields = parseCustomResultFields(result.customFields)
    if (parsed.data.index >= fields.length) {
      return errors.badRequest('Field index out of range')
    }

    fields[parsed.data.index] = { label: parsed.data.label, value: parsed.data.value }

    const customFields = await persistDraftFields(id, fields)
    if (!customFields) {
      return errors.conflict('This result was declared while the field was being updated. Refresh to view its final state.')
    }

    return successResponse({ customFields }, 'Custom field updated successfully')
  } catch (err) {
    console.error('[CUSTOM_FIELDS_PATCH]', err)
    return errors.internal()
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const authorized = await authorizeDraftResult(teacher.id, id)
    if ('response' in authorized) return authorized.response
    const { result } = authorized

    const fields = parseCustomResultFields(result.customFields)
    if (parsed.data.index >= fields.length) {
      return errors.badRequest('Field index out of range')
    }

    fields.splice(parsed.data.index, 1)

    const customFields = await persistDraftFields(id, fields)
    if (!customFields) {
      return errors.conflict('This result was declared while the field was being removed. Refresh to view its final state.')
    }

    return successResponse({ customFields }, 'Custom field deleted successfully')
  } catch (err) {
    console.error('[CUSTOM_FIELDS_DELETE]', err)
    return errors.internal()
  }
}
