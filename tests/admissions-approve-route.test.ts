import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAuth, mockHash, mockSendApprovalNotification, mockGetActiveAcademicYear, mockCreateYearEnrollmentForStudent, mockPrisma, mockTx } = vi.hoisted(() => {
  const mockAuth = vi.fn()
  const mockHash = vi.fn()
  const mockSendApprovalNotification = vi.fn()
  const mockGetActiveAcademicYear = vi.fn()
  const mockCreateYearEnrollmentForStudent = vi.fn()
  const mockTx = {
    admissionRequest: { update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    guardian: { findUnique: vi.fn(), create: vi.fn() },
    student: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const mockPrisma = {
    admissionRequest: { findUnique: vi.fn() },
    batch: { findUnique: vi.fn() },
    campus: { findUnique: vi.fn() },
    student: { findFirst: vi.fn(), count: vi.fn() },
    studentEnrollment: { findFirst: vi.fn() },
    guardian: { findUnique: vi.fn() },
    shift: { findUnique: vi.fn() },
    class: { findUnique: vi.fn() },
    classSection: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
  }
  return {
    mockAuth,
    mockHash,
    mockSendApprovalNotification,
    mockGetActiveAcademicYear,
    mockCreateYearEnrollmentForStudent,
    mockPrisma,
    mockTx,
  }
})

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@node-rs/argon2', () => ({ hash: mockHash }))
vi.mock('@/lib/notifications', () => ({ sendApprovalNotification: mockSendApprovalNotification }))
vi.mock('@/lib/academic/engine', () => ({ getActiveAcademicYear: mockGetActiveAcademicYear }))
vi.mock('@/lib/academic/enrollment', () => ({ createYearEnrollmentForStudent: mockCreateYearEnrollmentForStudent }))
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { POST } from '../app/api/admissions/[id]/approve/route'

const pendingRequest = {
  id: 'clxrequest00000000001',
  status: 'PENDING',
  firstName: 'Ali',
  lastName: 'Hassan',
  fatherName: 'Hassan',
  motherName: null,
  cnicBForm: '3520112345678',
  dateOfBirth: new Date('2012-01-01'),
  placeOfBirth: null,
  gender: 'MALE',
  bloodGroup: null,
  religion: null,
  nationality: 'Pakistani',
  domicile: null,
  address: 'Madina Town',
  city: 'Gujranwala',
  province: 'Punjab',
  tehsil: null,
  district: null,
  permanentAddress: null,
  postalCode: null,
  phoneNumber: '+923001234567',
  emergencyContact: '+923001234567',
  email: 'student@example.com',
  fatherOccupation: null,
  fatherQualification: null,
  fatherCnic: null,
  lastClassPassed: null,
  lastPercentage: null,
  previousMarksObtained: null,
  previousGroup: null,
  boardName: null,
  yearOfPassing: null,
  interviewDate: null,
  interviewerName: null,
  interviewOutcome: null,
  interviewNotes: null,
  interviewInstitute: null,
  interviewMarksObtained: null,
  interviewPercentage: null,
  interviewYear: null,
  interviewGroup: null,
  guardianEmploymentStatus: null,
  guardianDesignation: null,
  guardianOrganization: null,
  guardianBusinessName: null,
  guardianBusinessDealsIn: null,
  medicalConditions: null,
  hasDisability: false,
  disabilityDetails: null,
  hasSiblingAtAcademy: false,
  siblingName: null,
  siblingClass: null,
  requestedGroup: null,
  requestedGroupOther: null,
  requestedCourses: [],
  requestedCoursesOther: null,
  repeaterSubjects: null,
  sourceOfInfo: null,
  passportPhotoUrl: null,
  bFormDocUrl: null,
  previousResultUrl: null,
  guardianCnic: null,
  guardianFirstName: null,
  guardianEmail: null,
  guardianLastName: null,
  guardianPhoneNumber: null,
  guardianRelationship: null,
}

describe('POST /api/admissions/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'super-1', role: 'SUPER_ADMIN', campusId: null } })
    mockHash.mockResolvedValue('hashed-password')
    mockGetActiveAcademicYear.mockResolvedValue(null)
    mockPrisma.admissionRequest.findUnique.mockResolvedValue(pendingRequest)
    mockPrisma.batch.findUnique.mockResolvedValue({ academicLevel: 'Secondary', forceGenderSeparation: false })
    mockPrisma.campus.findUnique.mockResolvedValue({ name: 'College Boys Campus', code: 'BC' })
    mockPrisma.student.count.mockResolvedValue(0)
    mockTx.user.findUnique.mockResolvedValue(null)
    mockTx.user.create.mockResolvedValue({ id: 'student-user-1' })
    mockTx.student.create.mockResolvedValue({
      id: 'student-1',
      email: 'student@example.com',
      firstName: 'Ali',
      lastName: 'Hassan',
      registrationNumber: 'CBC/2026/001',
    })
  })

  it('accepts optional house, legacy class, legacy section, and class section as blank values', async () => {
    const response = await POST(new NextRequest('http://localhost/api/admissions/clxrequest00000000001/approve', {
      method: 'POST',
      body: JSON.stringify({
        campusId: 'clxcampus00000000001',
        batchId: 'clxbatch000000000001',
        classId: '',
        classSectionId: '',
        section: '',
        houseId: '',
        rollNumber: ' 101 ',
        admissionFee: 0,
        courseFee: 0,
        totalAcademicFee: 0,
        shift: 'MORNING',
        deliveryMode: 'PHYSICAL',
      }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: 'clxrequest00000000001' }) })

    expect(response.status).toBe(200)
    expect(mockPrisma.student.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.studentEnrollment.findFirst).not.toHaveBeenCalled()
    expect(mockTx.student.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        rollNumber: '101',
        classId: undefined,
        section: undefined,
        houseId: undefined,
      }),
    }))
  })

  it('forbids campus admins from approving admissions into another campus', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', campusId: 'clxcampusown000001' } })

    const response = await POST(new NextRequest('http://localhost/api/admissions/clxrequest00000000001/approve', {
      method: 'POST',
      body: JSON.stringify({
        campusId: 'clxcampusother0001',
        batchId: 'clxbatch000000000001',
        rollNumber: '101',
        totalAcademicFee: 0,
      }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: 'clxrequest00000000001' }) })

    expect(response.status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
