import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/excel/brand-logo', () => ({
  addBrandLogo: vi.fn().mockResolvedValue(null),
  LOGO_PLACEMENT: { crest: { width: 75, height: 75 } },
}))

import { downloadMonitoringExcel } from '@/lib/excel/monitoring-report'

describe('monitoring Excel export', () => {
  const click = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName) as HTMLAnchorElement
      if (tagName === 'a') element.click = click
      return element
    }) as typeof document.createElement)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:monitoring-report') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  it.each(['daily', 'monthly'] as const)('downloads a styled %s report', async (type) => {
    await downloadMonitoringExcel({
      type,
      classSectionLabel: 'Class 10 - Jun',
      dateLabel: 'July 2026',
      academicYear: '2025-2026',
      teacherName: 'Ali Aslam Aslam',
      subjects: [{ id: 'physics', name: 'Physics', code: 'PHY' }],
      students: [{
        serial: 1,
        studentId: 'student-1',
        name: 'Rizwan Ali',
        fatherName: 'Nazeer Ahmad',
        rollNumber: '2100',
        subjectScores: { physics: 41 },
        courseName: 'Physics',
        remarks: 'Keep going',
        highlight: 'STAR_OF_THE_DAY',
        grade: 'A',
        totalMarks: 60,
        obtainedMarks: 41,
        percentage: 68.33,
        performanceBatch: 'Iqbal Group',
        rank: 1,
      }],
    })

    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:monitoring-report')
  })
})
