import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import {
  DEFAULT_RESULT_CARD_CONFIG,
  parseResultCardConfig,
  resultCardConfigSchema,
} from '@/lib/academic/result-card-config'

const keySchema = z.object({
  classSectionId: z.string().min(1),
  examSessionId: z.string().min(1),
})

const patchSchema = keySchema.extend({
  config: resultCardConfigSchema.partial(),
})

async function getTeacherContext(classSectionId: string, examSessionId: string) {
  const session = await auth()
  if (!session?.user) return { error: errors.unauthorized() as Response }
  if (session.user.role !== 'TEACHER') return { error: errors.forbidden('Only assigned teachers can configure result cards.') as Response }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return { error: errors.notFound('Teacher profile') as Response }

  if (!(await teacherCanAccessClassSection(teacher.id, classSectionId, examSessionId))) {
    return { error: errors.forbidden('You are not assigned to this class section.') as Response }
  }

  return { session, teacher }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const parsed = keySchema.safeParse({
    classSectionId: searchParams.get('classSectionId'),
    examSessionId: searchParams.get('examSessionId'),
  })
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    const context = await getTeacherContext(parsed.data.classSectionId, parsed.data.examSessionId)
    if ('error' in context) return context.error
    const record = await prisma.resultCardConfig.findUnique({
      where: {
        classSectionId_examSessionId: {
          classSectionId: parsed.data.classSectionId,
          examSessionId: parsed.data.examSessionId,
        },
      },
    })
    return successResponse(record ? parseResultCardConfig(record) : DEFAULT_RESULT_CARD_CONFIG)
  } catch (error) {
    console.error('[RESULT_CARD_CONFIG_GET]', error)
    return errors.internal()
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const context = await getTeacherContext(parsed.data.classSectionId, parsed.data.examSessionId)
    if ('error' in context) return context.error

    const current = await prisma.resultCardConfig.findUnique({
      where: { classSectionId_examSessionId: {
        classSectionId: parsed.data.classSectionId,
        examSessionId: parsed.data.examSessionId,
      } },
    })
    const next = parseResultCardConfig({
      ...(current ?? DEFAULT_RESULT_CARD_CONFIG),
      ...parsed.data.config,
    })

    const record = await prisma.resultCardConfig.upsert({
      where: {
        classSectionId_examSessionId: {
          classSectionId: parsed.data.classSectionId,
          examSessionId: parsed.data.examSessionId,
        },
      },
      create: {
        ...next,
        id: crypto.randomUUID(),
        classSectionId: parsed.data.classSectionId,
        examSessionId: parsed.data.examSessionId,
        createdById: context.session.user.id,
        updatedById: context.session.user.id,
      },
      update: {
        ...next,
        updatedById: context.session.user.id,
      },
    })
    return successResponse(parseResultCardConfig(record), 'Result-card settings saved.')
  } catch (error) {
    console.error('[RESULT_CARD_CONFIG_PATCH]', error)
    return errors.internal()
  }
}
