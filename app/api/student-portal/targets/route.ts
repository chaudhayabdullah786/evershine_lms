/**
 * GET /api/student-portal/targets
 *
 * Returns all TargetAssignment records for the logged-in student,
 * enriched with subject names and current daily performance averages.
 *
 * Authorization: STUDENT only
 *
 * WHY separate from results: Targets are aspirational — set by teachers as
 * motivational markers. They inform the student's "gap analysis" view but
 * do not affect official grades or transcripts.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'STUDENT') return errors.forbidden()

    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!student) return errors.notFound('Student')

    // Fetch all target assignments for this student
    const targets = await prisma.targetAssignment.findMany({
      where: { studentId: student.id },
      select: {
        id: true,
        targetGrade: true,
        minPercentage: true,
        maxPercentage: true,
        updatedAt: true,
        subjectOffering: {
          select: {
            id: true,
            maxDailyScore: true,
            subject: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            classSection: {
              select: {
                className: true,
                sectionName: true,
              },
            },
          },
        },
        assignedBy: {
          select: {
            email: true,
          },
        },
      },
      orderBy: {
        subjectOffering: {
          subject: {
            name: 'asc',
          },
        },
      },
    })

    // For each target, calculate the student's current daily performance average
    // WHY aggregate query: DailyPerformanceScore has potentially hundreds of rows
    // per student per subject. An in-DB aggregate is O(1) in application memory.
    const enrichedTargets = await Promise.all(
      targets.map(async (target) => {
        const performanceAgg = await prisma.dailyPerformanceScore.aggregate({
          where: {
            studentId: student.id,
            subjectOfferingId: target.subjectOffering.id,
            isAbsent: false,
          },
          _avg: { score: true },
          _count: { id: true },
        })

        const avgScore = performanceAgg._avg.score
          ? Number(performanceAgg._avg.score)
          : null
        const maxScore = target.subjectOffering.maxDailyScore
        const currentPercentage =
          avgScore !== null && maxScore > 0
            ? Math.round((avgScore / maxScore) * 10000) / 100
            : null

        const targetMin = Number(target.minPercentage)
        const targetMax = Number(target.maxPercentage)

        // Determine status relative to target
        let status: 'ON_TRACK' | 'CLOSE' | 'BELOW' | 'NO_DATA' = 'NO_DATA'
        if (currentPercentage !== null) {
          if (currentPercentage >= targetMin) {
            status = 'ON_TRACK'
          } else if (currentPercentage >= targetMin - 10) {
            status = 'CLOSE'
          } else {
            status = 'BELOW'
          }
        }

        return {
          id: target.id,
          subjectName: target.subjectOffering.subject.name,
          subjectCode: target.subjectOffering.subject.code,
          className: target.subjectOffering.classSection.className,
          sectionName: target.subjectOffering.classSection.sectionName,
          targetGrade: target.targetGrade,
          targetRange: {
            min: targetMin,
            max: targetMax,
          },
          currentPercentage,
          scoresCount: performanceAgg._count.id,
          status,
          assignedBy: target.assignedBy?.email || 'Teacher',
          updatedAt: target.updatedAt,
        }
      })
    )

    return successResponse({
      targets: enrichedTargets,
      summary: {
        totalTargets: enrichedTargets.length,
        onTrack: enrichedTargets.filter((t) => t.status === 'ON_TRACK').length,
        close: enrichedTargets.filter((t) => t.status === 'CLOSE').length,
        below: enrichedTargets.filter((t) => t.status === 'BELOW').length,
        noData: enrichedTargets.filter((t) => t.status === 'NO_DATA').length,
      },
    })
  } catch (err) {
    console.error('[STUDENT_TARGETS_GET]', err)
    return errors.internal()
  }
}
