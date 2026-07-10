import { describe, expect, it } from 'vitest'
import { toPortalMonthlyMonitoringReport } from '@/lib/academic/monitoring-report'

describe('monthly monitoring portal mapping', () => {
  const snapshot = {
    id: 'report-1',
    month: 7,
    year: 2026,
    declaredAt: new Date('2026-07-31T00:00:00.000Z'),
    reportData: {
      columns: [
        { id: 'physics', label: 'Physics', type: 'COURSE' },
        { id: 'ethics', label: 'Ethics', type: 'CUSTOM' },
      ],
      students: [
        {
          studentId: 'student-1',
          name: 'Rizwan Ali',
          rollNumber: '2100',
          courseMarks: { physics: { totalMarks: 60, obtainedMarks: 41 } },
          customValues: { ethics: 'Good' },
          remarks: 'Keep going',
          totalMarks: 60,
          obtainedMarks: 41,
          percentage: 68.33,
          performanceBatch: 'Iqbal Group',
          rank: 1,
        },
        {
          studentId: 'student-2',
          name: 'Private Classmate',
          rollNumber: '2101',
          courseMarks: { physics: { totalMarks: 60, obtainedMarks: 59 } },
          customValues: { ethics: 'Excellent' },
          remarks: 'Private remarks',
          totalMarks: 60,
          obtainedMarks: 59,
          percentage: 98.33,
          performanceBatch: 'Ever Shine Group',
          rank: 1,
        },
      ],
    },
  }

  it('returns only the requested student row', () => {
    const report = toPortalMonthlyMonitoringReport(snapshot, 'student-1')

    expect(report).toMatchObject({
      id: 'report-1',
      student: {
        rollNumber: '2100',
        percentage: 68.33,
        courseMarks: { physics: { totalMarks: 60, obtainedMarks: 41 } },
      },
    })
    expect(JSON.stringify(report)).not.toContain('Private Classmate')
    expect(JSON.stringify(report)).not.toContain('Private remarks')
  })

  it('does not expose a report to a student without a snapshot row', () => {
    expect(toPortalMonthlyMonitoringReport(snapshot, 'student-3')).toBeNull()
  })
})
