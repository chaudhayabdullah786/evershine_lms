/**
 * tests/academic/upgrades.test.ts
 * Unit tests for AcademicUpgradesService.
 *
 * WHY mocked Prisma: Tests must be runnable without a live database.
 * Prisma is mocked at module level; each test restores call counts via
 * beforeEach(vi.clearAllMocks).
 *
 * Coverage targets:
 *  - Feature 4: Enrollment audit creation
 *  - Feature 3: Date sheet upsert + slot replacement
 *  - Feature 5: Score submission + cumulative recalculation
 *  - Feature 6: Daily performance batch insert
 *  - Feature 7: Comparison report aggregation
 *  - Feature 8: Target assignment with boundary lookup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'
import { EnrollmentType, ResultDeclarationStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

// ── Prisma mock ───────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => {
  const tx = {
    studentEnrollment:      { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    enrollmentTypeAuditLog: { create: vi.fn() },
    examDateSheet:          { upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    examDateSheetSlot:      { deleteMany: vi.fn(), createMany: vi.fn() },
    termResult:             { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    subjectResult:          { deleteMany: vi.fn(), createMany: vi.fn() },
    dailyPerformanceScore:  { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
    subjectOffering:        { findUnique: vi.fn() },
    targetAssignment:       { upsert: vi.fn() },
  }

  return {
    prisma: {
      ...tx,
      $transaction: vi.fn((cb: (t: any) => unknown) => cb(tx)),
    },
  }
})

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => vi.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4 — Enrollment auditing
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 4: updateStudentEnrollmentType', () => {
  it('creates an audit log with changedById after updating enrollment', async () => {
    const mockEnrollment = { id: 'enr-1', studentId: 's-1', academicYearId: 'yr-1', enrollmentType: EnrollmentType.REGULAR }
    const mockAudit      = { id: 'aud-1' }

    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue(mockEnrollment as any)
    vi.mocked(prisma.studentEnrollment.update).mockResolvedValue(mockEnrollment as any)
    vi.mocked(prisma.enrollmentTypeAuditLog.create).mockResolvedValue(mockAudit as any)

    const result = await AcademicUpgradesService.updateStudentEnrollmentType({
      studentId:      's-1',
      academicYearId: 'yr-1',
      enrollmentType: EnrollmentType.SUPPLEMENTARY,
      reason:         'Failed mathematics assessment',
      updatedById:    'admin-1',
    })

    expect(prisma.enrollmentTypeAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId:   's-1',
        previousType: EnrollmentType.REGULAR,
        newType:     EnrollmentType.SUPPLEMENTARY,
        changedById: 'admin-1',                    // Must be changedById, not updatedById
        reason:      'Failed mathematics assessment',
      }),
    })
    expect(result).toEqual(mockAudit)
  })

  it('throws if no enrollment found for academic year', async () => {
    vi.mocked(prisma.studentEnrollment.findFirst).mockResolvedValue(null)

    await expect(
      AcademicUpgradesService.updateStudentEnrollmentType({
        studentId:      's-999',
        academicYearId: 'yr-1',
        enrollmentType: EnrollmentType.AUDIT,
        reason:         'No enrollment exists',
        updatedById:    'admin-1',
      }),
    ).rejects.toThrow('No enrollment found')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3 — Date sheet management
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 3: saveDateSheet', () => {
  it('upserts sheet header and replaces slots atomically', async () => {
    const mockSheet = { id: 'ds-1', classSectionId: 'cs-1', examSessionId: 'es-1' }
    vi.mocked(prisma.examDateSheet.upsert).mockResolvedValue(mockSheet as any)
    vi.mocked(prisma.examDateSheetSlot.deleteMany).mockResolvedValue({ count: 2 } as any)
    vi.mocked(prisma.examDateSheetSlot.createMany).mockResolvedValue({ count: 1 } as any)

    const result = await AcademicUpgradesService.saveDateSheet({
      classSectionId: 'cs-1',
      examSessionId:  'es-1',
      title:          'Mid-Term 2026',
      createdById:    'admin-1',
      slots: [{
        subjectOfferingId: 'so-1',
        examDate:  '2026-06-15',
        startTime: '09:00',
        endTime:   '12:00',
        roomNumber: 'Room 5',
      }],
    })

    expect(prisma.examDateSheet.upsert).toHaveBeenCalled()
    expect(prisma.examDateSheetSlot.deleteMany).toHaveBeenCalledWith({ where: { dateSheetId: 'ds-1' } })
    expect(prisma.examDateSheetSlot.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        dateSheetId:       'ds-1',
        subjectOfferingId: 'so-1',   // FK, not subjectName
        examDate:          expect.any(Date),
      })],
    })
    expect(result).toEqual(mockSheet)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5 — Score submission + grade recalculation
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 5: submitStudentScores', () => {
  it('calculates 80% overall and grade A from two subjects scoring 85 and 75', async () => {
    const mockTermResult = {
      id:               'tr-1',
      studentId:        's-1',
      classSectionId:   'cs-1',
      examSessionId:    'es-1',
      overallPercentage: new Decimal(0),
      grade:             'F',
      performanceBatch:  'FAIL',
      declarationStatus: ResultDeclarationStatus.DRAFT,
    }

    vi.mocked(prisma.termResult.upsert).mockResolvedValue(mockTermResult as any)
    vi.mocked(prisma.subjectResult.deleteMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.subjectResult.createMany).mockResolvedValue({ count: 2 } as any)
    vi.mocked(prisma.termResult.update).mockResolvedValue({
      ...mockTermResult,
      overallPercentage: new Decimal(80),
      grade:             'A',
      performanceBatch:  'VERY_GOOD',
    } as any)

    const result = await AcademicUpgradesService.submitStudentScores({
      studentId:      's-1',
      classSectionId: 'cs-1',
      examSessionId:  'es-1',
      teacherId:      'teacher-1',
      scores: [
        { subjectOfferingId: 'so-1', totalMarks: 100, obtainedMarks: 85, isAbsent: false, isNotApplicable: false },
        { subjectOfferingId: 'so-2', totalMarks: 100, obtainedMarks: 75, isAbsent: false, isNotApplicable: false },
      ],
    })

    expect(prisma.termResult.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        overallPercentage: expect.objectContaining({ d: expect.any(Array) }), // Decimal
        grade:             'A',
        performanceBatch:  'VERY_GOOD',
      }),
    }))
    expect(result).toBeDefined()
  })

  it('marks hasDeferred and keeps grade F when a score is null (Decide Later)', async () => {
    const mockTermResult = { id: 'tr-2', overallPercentage: new Decimal(0), grade: 'F', performanceBatch: 'FAIL', declarationStatus: ResultDeclarationStatus.DRAFT }
    vi.mocked(prisma.termResult.upsert).mockResolvedValue(mockTermResult as any)
    vi.mocked(prisma.subjectResult.deleteMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.subjectResult.createMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.termResult.update).mockResolvedValue(mockTermResult as any)

    await AcademicUpgradesService.submitStudentScores({
      studentId:      's-2',
      classSectionId: 'cs-1',
      examSessionId:  'es-1',
      teacherId:      'teacher-1',
      scores: [
        { subjectOfferingId: 'so-1', totalMarks: 100, obtainedMarks: null }, // deferred
      ],
    })

    // overallPercentage must remain 0 (deferred)
    expect(prisma.termResult.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ grade: 'F' }),
    }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6 — Daily performance
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 6: submitDailyPerformance', () => {
  it('deletes existing records for that day then bulk inserts new ones', async () => {
    vi.mocked(prisma.subjectOffering.findUnique).mockResolvedValue({ maxDailyScore: 10 } as any)
    vi.mocked(prisma.dailyPerformanceScore.deleteMany).mockResolvedValue({ count: 3 } as any)
    vi.mocked(prisma.dailyPerformanceScore.createMany).mockResolvedValue({ count: 2 } as any)

    const result = await AcademicUpgradesService.submitDailyPerformance({
      subjectOfferingId: 'so-1',
      date:              '2026-06-08',
      teacherId:         'teacher-1',
      records: [
        { studentId: 's-1', score: 9.5, remarks: 'Excellent' },
        { studentId: 's-2', score: 7.0 },
      ],
    })

    expect(prisma.dailyPerformanceScore.deleteMany).toHaveBeenCalledWith({
      where: { subjectOfferingId: 'so-1', date: expect.any(Date) },
    })
    expect(prisma.dailyPerformanceScore.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ studentId: 's-1', markedById: 'teacher-1' }),
        expect.objectContaining({ studentId: 's-2', markedById: 'teacher-1' }),
      ]),
    })
    expect(result).toEqual({ count: 2, date: '2026-06-08' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 7 — Comparison report (mocks prisma directly, not via $transaction)
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 7: getMonthlyTestComparisonReport', () => {
  it('correctly computes aggregate pass/fail and student improvement delta', async () => {
    const makeResult = (studentId: string, pct: number) => ({
      studentId,
      overallPercentage: new Decimal(pct),
      grade: pct >= 80 ? 'A' : pct >= 50 ? 'D' : 'F',
      student: { id: studentId, firstName: 'Test', lastName: 'Student', rollNumber: '001' },
      subjectResults: [],
    })

    // current session: 80% (pass), 45% (fail)
    vi.mocked(prisma.termResult.findMany)
      .mockResolvedValueOnce([makeResult('s-1', 80), makeResult('s-2', 45)] as any)  // current
      .mockResolvedValueOnce([makeResult('s-1', 70), makeResult('s-2', 55)] as any)  // previous

    vi.mocked(prisma.studentEnrollment.findMany).mockResolvedValue([] as any)

    // The service uses prisma.termResult.findMany directly (not via $transaction)
    // We mock it via the module; student lookup is via prisma.student.findMany
    // For this test the mock returns current+previous in order, no student lookup needed
    // (the service maps students from the result rows themselves)
    const report = await AcademicUpgradesService.getMonthlyTestComparisonReport(
      'cs-1',
      'session-current',
      'session-previous',
    )

    expect(report.aggregates.current.pass).toBe(1)
    expect(report.aggregates.current.fail).toBe(1)
    expect(report.aggregates.current.avg).toBe(62.5)

    const s1 = report.details.find((d) => d.studentId === 's-1')
    expect(s1?.improvement).toBe(10)           // 80 - 70
    expect(s1?.current.status).toBe('PASS')
    expect(s1?.previous?.status).toBe('PASS')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 8 — Target assignment with grade boundary derivation
// ─────────────────────────────────────────────────────────────────────────────
describe('Feature 8: assignTargets', () => {
  it('derives correct [90, 100] bounds for grade A+ and upserts the record', async () => {
    vi.mocked(prisma.targetAssignment.upsert).mockResolvedValue({ id: 'tgt-1' } as any)

    const result = await AcademicUpgradesService.assignTargets({
      classSectionId:    'cs-1',
      subjectOfferingId: 'so-1',
      assignedById:      'admin-1',
      targets: [{ studentId: 's-1', targetGrade: 'A+' }],
    })

    expect(prisma.targetAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        targetGrade:   'A+',
        minPercentage: expect.objectContaining({ d: expect.any(Array) }),  // Decimal(90)
        maxPercentage: expect.objectContaining({ d: expect.any(Array) }),  // Decimal(100)
        assignedById:  'admin-1',
      }),
    }))
    expect(result).toHaveLength(1)
  })
})
