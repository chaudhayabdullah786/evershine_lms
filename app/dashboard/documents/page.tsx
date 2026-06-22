/* eslint-disable @next/next/no-img-element */
'use client'

import { CSSProperties, useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AccessDenied } from '@/components/AccessDenied'
import { useQuery } from '@tanstack/react-query'
import { AcademicScopeFilters } from '@/components/academic/AcademicScopeFilters'
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy'
import type { AcademicScopeState } from '@/lib/academic/types'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Download, Search, CheckCircle, Cake, Award, Grid, User, Sparkles, Loader2, FileSpreadsheet, Database, Users, Briefcase, GraduationCap, CircleDollarSign } from 'lucide-react'
import { downloadPdf, generateTeacherIDCard, generateExperienceLetter } from '@/lib/pdf'
import { downloadReportAsExcel, downloadStudentsMasterExcel, downloadTeachersMasterExcel, downloadStaffMasterExcel, downloadFeesMasterExcel } from '@/lib/excel'
import { notify } from '@/lib/notify'
import { Skeleton } from '@/components/ui/skeleton'
import { AcademyLogo } from '@/components/AcademyLogo'
import { sessionShiftFormalLabel } from '@/lib/validation/shift'

interface Student {
  id: string
  firstName: string
  lastName: string
  fatherName: string
  registrationNumber: string
  rollNumber: string | null
  dateOfBirth: string
  bloodGroup: string | null
  profilePicture: string | null
  idCardQRCode: string | null
  cnicBForm: string
  address?: string | null
  permanentAddress?: string | null
  fatherOccupation?: string | null
  religion?: string | null
  guardians?: Array<{
    firstName: string
    lastName: string
    phoneNumber: string
    email: string | null
    relationship: string
    cnic: string | null
  }>
  shift?: 'MORNING' | 'EVENING'
  campus?: { name: string }
  class?: { name: string; shift?: 'MORNING' | 'EVENING' }
  house?: { name: string; color?: string }
}

interface Teacher {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  specialization: string | null
  qualification: string
  experienceYears: number
  phoneNumber: string
  email: string
  address?: string
  city?: string
  emergencyContact?: string
  cnic?: string
  dateOfBirth?: string | Date
  gender?: string
  profilePicture: string | null
  joiningDate: string
  campus: { id: string; name: string } | null
  batch: { id: string; name: string } | null
  isActive: boolean
}


export type DocumentType = 'id_card' | 'birthday' | 'bonafide' | 'result_card' | 'performance_card' | 'reports' | 'exports' | 'teacher_id_card' | 'teacher_experience' | 'student_profile' | 'teacher_profile'

type ReportRow = {
  label: string
  value: string
}

type AdminReportData = Record<string, unknown>

export function buildDocumentFileName(docType: DocumentType, reportSubtype: 'fees' | 'attendance' | 'performance', safeStudentIdentifier: string) {
  const filePrefix = docType === 'reports'
    ? `${reportSubtype}-report`
    : `${docType.replace(/_/g, '-')}`
  return `${safeStudentIdentifier}-${filePrefix}`
}

export async function exportPreviewDocument(element: HTMLElement, fileName: string, colorMode: 'color' | 'bw' = 'color') {
  // WHY: We pass the [data-document-page] element DIRECTLY instead of the outer
  // capture container. The outer container uses width:'100%' which adapts to the
  // preview panel width (~560px). Passing the page element directly guarantees
  // getBoundingClientRect() reports the fixed 595px A4 width, not the panel width.
  const pageEl = element.querySelector('[data-document-page]') as HTMLElement | null
  const captureTarget = pageEl ?? element

  // Force explicit width on the capture target. If the element specifies a width
  // (like 680px for ID cards), use it. Otherwise, default to A4 width (595px).
  const targetWidth = captureTarget.style.width || '595px'
  const targetHeight = captureTarget.style.height || '842px'
  
  const widthNum = parseInt(targetWidth, 10) || 595
  const heightNum = parseInt(targetHeight, 10) || 842
  const orientation = widthNum > heightNum ? 'landscape' : 'portrait'

  const savedWidth = captureTarget.style.width
  const savedMinWidth = captureTarget.style.minWidth
  const savedMaxWidth = captureTarget.style.maxWidth
  const savedPosition = captureTarget.style.position
  captureTarget.style.width = targetWidth
  captureTarget.style.minWidth = targetWidth
  captureTarget.style.maxWidth = targetWidth

  // One rAF to allow the browser to reflow at the forced width before capture
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => setTimeout(resolve, 80))

  try {
    await downloadPdf({
      element: captureTarget,
      filename: fileName,
      orientation,
      scale: 3,
      colorMode,
    })
  } finally {
    // Always restore — even if download throws, the live preview must not be broken
    captureTarget.style.width = savedWidth
    captureTarget.style.minWidth = savedMinWidth
    captureTarget.style.maxWidth = savedMaxWidth
    captureTarget.style.position = savedPosition
  }
}

type OverdueItem = {
  name: string
  classSection: string
  rollNumber?: string
  registrationNumber: string
  dueAmount: number | string
}

function formatPersonNameLocal(first?: string, last?: string) {
  const parts = []
  if (first) parts.push(first.trim())
  if (last) parts.push(last.trim())
  if (!parts.length) return '—'
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
}

type AttendanceSection = {
  classSection: string
  totalStudents: number
  presentToday: number
  absentToday: number
  attendanceRate: number
}

type PerformanceSection = {
  classSection: string
  runExams: string
  highestScore: string
  classAverage: number
  classStatus: 'EXCELLENT' | 'GOOD' | 'SATISFACTORY'
}

function getAvatarDataUrl(firstName: string, lastName: string, bgColor: string) {
  const cleanColor = bgColor.startsWith('#') ? bgColor : `#${bgColor}`;
  const initials = ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <rect width="256" height="256" fill="${cleanColor}"/>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="100" font-weight="bold">${initials}</text>
  </svg>`;
  const base64 = typeof window !== 'undefined' 
    ? btoa(encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
    : Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

export default function DocumentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN'
  const isStudent = session?.user?.role === 'STUDENT'
  const isAuthorizedDocumentUser = isAdmin || isStudent

  const searchParams = useSearchParams()
  const preselectStudentId = searchParams.get('studentId')
  const preselectDoc = searchParams.get('doc') as DocumentType | null



  const [search, setSearch] = useState('')
  const [docScope, setDocScope] = useState<AcademicScopeState>({
    campusId: '',
    batchId: '',
    shift: 'MORNING',
    classId: '',
    houseId: '',
  })
  const docHierarchy = useAcademicHierarchy(docScope, setDocScope, { mode: 'admin' })
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [docType, setDocType] = useState<DocumentType>('id_card')
  const isTeacherDoc = docType === 'teacher_id_card' || docType === 'teacher_experience' || docType === 'teacher_profile'
  const [reportSubtype, setReportSubtype] = useState<'fees' | 'attendance' | 'performance'>('fees')
  const [isGenerating, setIsGenerating] = useState(false)
  const [colorMode, setColorMode] = useState<'color' | 'bw'>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('document_color_mode') : null
      return (v === 'bw' ? 'bw' : 'color')
    } catch (e) {
      return 'color'
    }
  })
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingMaster, setIsExportingMaster] = useState<Record<string, boolean>>({})
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('')
  const [profilePictureDataUrl, setProfilePictureDataUrl] = useState<string>('')
  const [selectedExamSessionId, setSelectedExamSessionId] = useState<string>('')

  // ── Teacher Document State ──────────────────────────────────────────────────
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null)
  const [teacherSearch, setTeacherSearch] = useState('')
  const [teacherProfileDataUrl, setTeacherProfileDataUrl] = useState('')
  // Experience Letter editable fields
  const [expResponsibilities, setExpResponsibilities] = useState(
    'Delivered lectures in assigned subjects and prepared lesson plans\nConducted assessments and maintained student grade records\nCoordinated with parents and administration on student progress\nContributed to school events and extracurricular activities'
  )
  const [expEndDate, setExpEndDate] = useState('')
  const [expPrincipalName, setExpPrincipalName] = useState('Principal')
  const [expPrincipalTitle, setExpPrincipalTitle] = useState('Principal, Evershaheen Academy')

  useEffect(() => {
    if (selectedStudent) {
      if (selectedStudent.profilePicture) {
        fetch(selectedStudent.profilePicture)
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader()
            reader.onloadend = () => setProfilePictureDataUrl(reader.result as string)
            reader.readAsDataURL(blob)
          })
          .catch(() => setProfilePictureDataUrl(''))
      } else {
        setProfilePictureDataUrl('')
      }
    }
  }, [selectedStudent])

  useEffect(() => {
    const knownQrData = docType === 'birthday' && selectedStudent
        ? `https://evershaheen.edu/verify/birthday/${selectedStudent.registrationNumber}`
        : docType === 'bonafide' && selectedStudent
          ? `https://evershaheen.edu/verify/bonafide/${selectedStudent.registrationNumber}`
          : docType === 'result_card' && selectedStudent
            ? `https://evershaheen.edu/verify/result/${selectedStudent.registrationNumber}`
            : docType === 'performance_card' && selectedStudent
              ? `https://evershaheen.edu/verify/performance/${selectedStudent.registrationNumber}`
              : docType === 'id_card' && selectedStudent
                ? `https://evershaheen.edu/verify/id/${selectedStudent.registrationNumber}`
                : `https://evershaheen.edu/verify/report/${reportSubtype}`

    const colorMap: Record<string, string> = {
      id_card: '#1e3a8a',
      birthday: '#d4af37',
      bonafide: '#1e3a8a',
      result_card: '#1e3a8a',
      performance_card: '#1e3a8a',
      reports: '#374151',
      teacher_id_card: '#065F46',
      teacher_experience: '#065F46',
    }

    if (knownQrData && (selectedStudent || docType === 'reports')) {
      QRCode.toDataURL(knownQrData, {
        width: 300,
        margin: 1,
        color: { dark: colorMap[docType] || '#000000', light: '#ffffff' }
      }).then(url => setQrCodeDataUrl(url)).catch(console.error)
    }
  }, [selectedStudent, docType, reportSubtype])
  
  // Document capture ref
  const documentCaptureRef = useRef<HTMLDivElement>(null)

  const previewWidth = (docType === 'id_card' || docType === 'teacher_id_card') ? 680 : 595
  const previewStyles: CSSProperties = {
    width: `${previewWidth}px`,
    minWidth: `${previewWidth}px`,
    height: 'auto',
    overflow: 'visible',
  }

  // Fetch Student Search — by name/roll or by academic scope (class roster)
  const browseByClass =
    !!docScope.classId && docHierarchy.scopeReady && search.length < 2
  const { data: searchData, isLoading } = useQuery({
    queryKey: ['student-search', search, docScope.classId, docScope.houseId, docScope.campusId],
    queryFn: () => {
      let url = '/api/students?limit=20'
      if (search.length >= 2) {
        url += `&search=${encodeURIComponent(search)}`
      }
      if (docScope.classId) url += `&classId=${docScope.classId}`
      if (docScope.houseId) url += `&houseId=${docScope.houseId}`
      if (docScope.campusId) url += `&campusId=${docScope.campusId}`
      if (docScope.shift) url += `&shift=${docScope.shift}`
      return fetchPaginatedApi<Student>(url)
    },
    enabled: search.length >= 2 || browseByClass,
  })
  const searchResults = searchData?.data ?? []

  // Fetch Teacher Search (for teacher_id_card and teacher_experience doc types)
  const { data: teacherSearchData, isLoading: isTeacherSearchLoading } = useQuery({
    queryKey: ['teacher-search-docs', teacherSearch],
    queryFn: () => fetchPaginatedApi<Teacher>(`/api/teachers?limit=10&search=${encodeURIComponent(teacherSearch)}`),
    enabled: teacherSearch.length >= 2 && isTeacherDoc,
  })
  const teacherSearchResults = teacherSearchData?.data ?? []

  // Load teacher profile picture when teacher changes
  useEffect(() => {
    if (!selectedTeacher?.profilePicture) { setTeacherProfileDataUrl(''); return }
    fetch(selectedTeacher.profilePicture)
      .then(r => r.blob())
      .then(blob => { const reader = new FileReader(); reader.onloadend = () => setTeacherProfileDataUrl(reader.result as string); reader.readAsDataURL(blob) })
      .catch(() => setTeacherProfileDataUrl(''))
  }, [selectedTeacher])

  // For students: resolve their own student record via /api/students/profile
  // WHY: session.user.id is the Auth user ID, NOT the student record ID.
  //      /api/students/[id] expects the student record ID — using the user ID
  //      would always return 403 (own id check fails). /profile resolves by userId internally.
  useEffect(() => {
    if (!isStudent) return
    let cancelled = false
    fetchApi<any>('/api/students/profile')
      .then((raw) => {
        if (cancelled) return
        const s = raw?.data ?? raw
        if (s?.id) {
          setSelectedStudent(s as Student)
          if (preselectDoc && ['id_card', 'bonafide', 'birthday', 'result_card', 'performance_card'].includes(preselectDoc)) {
            setDocType(preselectDoc)
          }
          setSearch(s.registrationNumber)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isStudent, preselectDoc])

  // For admins/staff: resolve via preselectStudentId (student record ID from URL param)
  useEffect(() => {
    if (isStudent || !preselectStudentId) return
    let cancelled = false
    fetchApi<Student>(`/api/students/${preselectStudentId}`)
      .then((raw) => {
        if (cancelled) return
        const s = (raw as { data?: Student })?.data ?? (raw as Student)
        if (s?.id) {
          setSelectedStudent(s)
          if (preselectDoc && ['id_card', 'bonafide', 'birthday', 'result_card', 'performance_card', 'reports'].includes(preselectDoc)) {
            setDocType(preselectDoc)
          }
          setSearch(s.registrationNumber)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isStudent, preselectStudentId, preselectDoc])

  // Fetch Student Exam Results (For Result Card & Performance Card)
  const { data: termResultsData } = useQuery<any[]>({
    queryKey: ['student-term-results', selectedStudent?.id],
    queryFn: () => fetchApi<any[]>(`/api/academic-upgrades/results?studentId=${selectedStudent?.id}`),
    enabled: !!selectedStudent && (docType === 'result_card' || docType === 'performance_card'),
  })

  const termSessions = useMemo(() => {
    if (!termResultsData || !Array.isArray(termResultsData)) return []
    return Array.from(new Set(termResultsData.map(r => r.examSessionId)))
  }, [termResultsData])

  useEffect(() => {
    if (termSessions.length > 0 && (!selectedExamSessionId || !termSessions.includes(selectedExamSessionId))) {
      setSelectedExamSessionId(termSessions[0])
    }
  }, [termSessions, selectedExamSessionId])

  const activeTermResult = useMemo(() => {
    if (!termResultsData || !Array.isArray(termResultsData)) return null
    return termResultsData.find(r => r.examSessionId === selectedExamSessionId) || termResultsData[0] || null
  }, [termResultsData, selectedExamSessionId])

  const getOverallGrade = (pct: number) => {
    if (pct >= 90) return 'A+'
    if (pct >= 80) return 'A'
    if (pct >= 70) return 'B'
    if (pct >= 60) return 'C'
    return 'F'
  }

  const subjectsToRender = useMemo(() => {
    if (!activeTermResult?.subjectResults) return []
    return activeTermResult.subjectResults.map((sr: any) => ({
      subject: sr.subjectOffering?.subject?.name || 'Unknown',
      total: sr.totalMarks,
      obtained: sr.obtainedMarks,
      grade: sr.grade,
      status: sr.resultStatus,
    }))
  }, [activeTermResult])

  const totalPossible = useMemo(() => {
    return subjectsToRender.reduce((sum: number, s: any) => sum + s.total, 0)
  }, [subjectsToRender])

  const totalObtained = useMemo(() => {
    return subjectsToRender.reduce((sum: number, s: any) => sum + s.obtained, 0)
  }, [subjectsToRender])

  const cumulativePercentage = useMemo(() => {
    if (activeTermResult) {
      return Number(activeTermResult.overallPercentage)
    }
    return totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100) : 0
  }, [activeTermResult, totalPossible, totalObtained])

  // Fetch Admin Report Data (For Admin Reports Terminal)
  const { data: reportData } = useQuery<any>({
    queryKey: ['admin-report', reportSubtype],
    queryFn: () => fetchApi<any>(`/api/admin/reports/${reportSubtype}`),
    enabled: docType === 'reports',
  })

  const liveReport = reportData ?? null

  // Handle PDF Generation & Download
  const handleDownloadDocument = async () => {
    if (!documentCaptureRef.current) {
      notify.error('Preview container is not initialized.')
      return
    }
    if (!selectedStudent && !isTeacherDoc && docType !== 'reports' && docType !== 'exports') {
      notify.error('Please select a student to generate their document.')
      return
    }
    if (isTeacherDoc && !selectedTeacher) {
      notify.error('Please select a staff member to generate their document.')
      return
    }

    const student = selectedStudent
    setIsGenerating(true)
    try {
      // Short yield to let all preview images and fonts finish rendering
      await new Promise((resolve) => setTimeout(resolve, 600))

      // WHY: selectedStudent may be null in 'reports' or teacher modes — guard before access
      const subjectName = selectedStudent
        ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
        : selectedTeacher
          ? `${selectedTeacher.firstName} ${selectedTeacher.lastName}`
          : 'Administrative_Report'
      const safeIdentifier = selectedStudent?.registrationNumber ?? selectedStudent?.id ?? selectedTeacher?.employeeId ?? 'unknown'

      if (docType === 'reports' && !liveReport) {
        notify.error('Report data is still loading. Please wait and try again.')
        setIsGenerating(false)
        return
      }

      const getReportRows = (): ReportRow[] => {
        const isoDate = new Date().toISOString().split('T')[0];
        if (!liveReport) {
          return [
            { label: 'Report Type', value: reportSubtype === 'fees' ? 'Fees Report' : reportSubtype === 'attendance' ? 'Attendance Report' : 'Performance Report' },
            { label: 'Generated On', value: isoDate },
            { label: 'Summary', value: 'Official administrative report generated from academy dashboard data.' },
          ]
        }

        return Object.entries(liveReport).map(([key, value]) => ({
          label: key
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, (match) => match.toUpperCase()),
          value:
            typeof value === 'number'
              ? value.toLocaleString('en-PK')
              : typeof value === 'string'
                ? value
                : Array.isArray(value)
                  ? value.slice(0, 4).map((item) => `${item}`).join(', ')
                  : JSON.stringify(value),
        }))
      }

      const knownQrData = encodeURIComponent(
        docType === 'birthday'
          ? `https://evershaheen.edu/verify/birthday/${safeIdentifier}`
          : docType === 'bonafide'
            ? `https://evershaheen.edu/verify/bonafide/${safeIdentifier}`
            : docType === 'result_card'
              ? `https://evershaheen.edu/verify/result/${safeIdentifier}`
              : docType === 'performance_card'
                ? `https://evershaheen.edu/verify/performance/${safeIdentifier}`
                : docType === 'id_card'
                  ? `https://evershaheen.edu/verify/id/${safeIdentifier}`
                  : docType === 'teacher_id_card'
                    ? `https://evershaheen.edu/verify/staff/${safeIdentifier}`
                    : docType === 'teacher_experience'
                      ? `https://evershaheen.edu/verify/exp/${safeIdentifier}`
                      : docType === 'student_profile'
                        ? `https://evershaheen.edu/verify/profile/${safeIdentifier}`
                        : docType === 'teacher_profile'
                          ? `https://evershaheen.edu/verify/staff-profile/${safeIdentifier}`
                          : `https://evershaheen.edu/verify/report/${reportSubtype}`,
      )

      if (!selectedStudent && !isTeacherDoc && docType !== 'reports' && docType !== 'exports') {
        throw new Error('Student or teacher required for document generation')
      }

      const fileName = buildDocumentFileName(docType, reportSubtype, safeIdentifier)

      // Use the DOM-based html2canvas capture engine to render the high-res Tailwind layout
      await exportPreviewDocument(documentCaptureRef.current, fileName, colorMode)

      notify.success('Document Generated Successfully', {
        description: 'High-resolution PDF downloaded to your device.',
      })

      // Backend audit log (non-blocking — must not fail the PDF download)
      if (selectedStudent && !isTeacherDoc && docType !== 'reports' && docType !== 'exports') {
        const certificateTypeMap: Record<string, string> = {
          id_card: 'ID_CARD',
          birthday: 'BIRTHDAY',
          bonafide: 'BONAFIDE',
          result_card: 'RESULT_CARD',
          performance_card: 'PERFORMANCE',
          student_profile: 'STUDENT_PROFILE',
        }
        const certificateType = certificateTypeMap[docType]
        if (certificateType) {
          try {
            await fetchApi('/api/documents', {
              method: 'POST',
              body: JSON.stringify({
                studentId: selectedStudent.id,
                type: certificateType,
                title: `Generated ${docType.toUpperCase().replace(/_/g, ' ')} Document`,
                pdfUrl: 'https://cloudinary.com/simulated-upload.pdf',
                remarks: 'Generated via administrative document center',
              }),
            })
          } catch (auditError) {
            console.warn('Document audit log failed:', auditError)
            toast.warning('PDF saved', {
              description: 'Download succeeded, but the server record could not be saved.',
            })
          }
        }
      } else if (selectedTeacher && isTeacherDoc) {
        const teacherDocTypeMap: Record<string, string> = {
          teacher_id_card: 'TEACHER_ID_CARD',
          teacher_experience: 'TEACHER_EXPERIENCE_LETTER',
          teacher_profile: 'TEACHER_PROFILE',
        }
        const tType = teacherDocTypeMap[docType]
        if (tType) {
          try {
            await fetchApi('/api/documents/teacher', {
              method: 'POST',
              body: JSON.stringify({
                teacherId: selectedTeacher.id,
                type: tType,
                title: `Generated ${docType.toUpperCase().replace(/_/g, ' ')}`,
                pdfUrl: 'https://cloudinary.com/simulated-upload.pdf',
                remarks: 'Generated via administrative document center',
              }),
            })
          } catch (auditError) {
            console.warn('Teacher document audit log failed:', auditError)
            toast.warning('PDF saved', {
              description: 'Download succeeded, but the server record could not be saved.',
            })
          }
        }
      }
    } catch (error) {
      console.error('PDF Engine error:', error)
      notify.error('PDF Generation failed. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Excel Export Handler ────────────────────────────────────────────────────
  // WHY: Report data can contain thousands of student rows in production.
  //      Excel (.xlsx) is better suited than PDF for large tabular data —
  //      sortable, filterable, and importable into finance/HR tools.
  const handleDownloadExcel = async () => {
    if (!liveReport) {
      notify.error('Report data is not loaded yet. Please wait a moment.')
      return
    }

    setIsExporting(true)
    try {
      // Dynamic import — tree-shakes xlsx out of the main bundle.
      // Only loaded when the user actually clicks "Download as Excel".
      await import('@/lib/excel').then(({ downloadReportAsExcel }) => {
        downloadReportAsExcel(reportSubtype, liveReport as Record<string, unknown>)
      })

      const reportLabels: Record<string, string> = {
        fees: 'Fees Outstanding Deficit Report',
        attendance: 'Campus Attendance & Presence Report',
        performance: 'Academic Grade Distribution Report',
      }
      notify.success(`✅ ${reportLabels[reportSubtype]} exported as Excel`)
    } catch (err) {
      console.error('[Excel Export] Error:', err)
      notify.error('Excel export failed. Ensure xlsx is installed: npm install xlsx@0.18.5')
    } finally {
      setIsExporting(false)
    }
  }

  // ── Master Database Export Handler ──────────────────────────────────────────
  // WHY: Non-paginated database exports for institutional records, backups, and audits.
  //      Directly queries custom unbounded API endpoints and passes data to xlsx generator.
  const handleExportMasterData = async (type: 'students' | 'teachers' | 'staff' | 'fees') => {
    setIsExportingMaster(prev => ({ ...prev, [type]: true }))
    try {
      const data = await fetchApi<any[]>(`/api/exports/${type}`)
      
      const typeLabels: Record<string, string> = {
        students: 'Students Master Register',
        teachers: 'Faculty Registry',
        staff: 'Support & Admin Staff List',
        fees: 'Master Fees Ledger',
      }

      if (!data || data.length === 0) {
        notify.error(`No records found in database to export for: ${typeLabels[type]}`)
        return
      }

      if (type === 'students') {
        downloadStudentsMasterExcel(data)
      } else if (type === 'teachers') {
        downloadTeachersMasterExcel(data)
      } else if (type === 'staff') {
        downloadStaffMasterExcel(data)
      } else if (type === 'fees') {
        downloadFeesMasterExcel(data)
      }

      notify.success(`✅ ${typeLabels[type]} exported successfully as Excel`)
    } catch (err) {
      console.error(`[Master Export ${type}] Error:`, err)
      notify.error(`Failed to export master data for ${type}. Please check permissions or connection.`)
    } finally {
      setIsExportingMaster(prev => ({ ...prev, [type]: false }))
    }
  }

  if (status === 'loading') return null
  if (!isAuthorizedDocumentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
        <AccessDenied
          title="Documents access denied"
          message="Only academy administrators and students may access document generation."
        />
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen bg-gray-50/30 pb-12">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        [data-document-page], [data-card] {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @media (max-width: 768px) {
          .doc-controls { max-height: calc(100vh - 180px); overflow-y-auto; }
        }
      `}} />
      
      {/* Header section */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2 leading-tight">
              <span>Document & Report Hub</span>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 animate-pulse flex-shrink-0" />
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">Issue professional student ID cards, letters, cards, result grids, and audits.</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-start">
        {/* Controls Panel */}
        <div className="md:col-span-5 lg:col-span-5 space-y-3 sm:space-y-4 doc-controls">
          {/* Document Type Picker */}
          <Card className="rounded-xl border shadow-sm bg-white overflow-hidden">
            <CardHeader className="border-b bg-gray-50/50 py-2.5 sm:py-3.5 px-3 sm:px-4">
              <CardTitle className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-gray-400">
                {isStudent ? 'My Documents' : 'Select Document Type'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 sm:pt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-2">
              {!isStudent && (
                <>
                  <button
                    onClick={() => setDocType('id_card')}
                    className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                      docType === 'id_card'
                        ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                        : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <User className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>ID Card</span>
                  </button>
              <button
                onClick={() => setDocType('birthday')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'birthday'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Cake className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Birthday</span>
              </button>
              <button
                onClick={() => setDocType('bonafide')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'bonafide'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Letter</span>
              </button>
              </>
              )}
              {!isStudent && (
              <button
                onClick={() => setDocType('result_card')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'result_card'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Award className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Result</span>
              </button>
              )}
              {!isStudent && (
              <button
                onClick={() => setDocType('performance_card')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all col-span-1 ${
                  docType === 'performance_card'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Perf</span>
              </button>
              )}
              <button
                onClick={() => setDocType('student_profile')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all col-span-1 ${
                  docType === 'student_profile'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <User className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Profile</span>
              </button>
              {!isStudent && (
              <>
              <button
                onClick={() => setDocType('reports')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'reports'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Grid className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Reports</span>
              </button>
              <button
                onClick={() => setDocType('exports')}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all col-span-2 sm:col-span-1 ${
                  docType === 'exports'
                    ? 'bg-indigo-600/5 text-indigo-700 border-indigo-500 shadow-sm shadow-indigo-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Database className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Export</span>
              </button>
              {/* ── Teacher Document Tabs (admin only) ── */}
              <button
                onClick={() => { setDocType('teacher_id_card'); setSelectedTeacher(null); setTeacherSearch('') }}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'teacher_id_card'
                    ? 'bg-emerald-600/5 text-emerald-700 border-emerald-500 shadow-sm shadow-emerald-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Staff ID</span>
              </button>
              <button
                onClick={() => { setDocType('teacher_experience'); setSelectedTeacher(null); setTeacherSearch('') }}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'teacher_experience'
                    ? 'bg-emerald-600/5 text-emerald-700 border-emerald-500 shadow-sm shadow-emerald-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Exp. Letter</span>
              </button>
              <button
                onClick={() => { setDocType('teacher_profile'); setSelectedTeacher(null); setTeacherSearch('') }}
                className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border text-[10px] sm:text-xs font-bold transition-all ${
                  docType === 'teacher_profile'
                    ? 'bg-emerald-600/5 text-emerald-700 border-emerald-500 shadow-sm shadow-emerald-50'
                    : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <User className="w-4 h-4 sm:w-5 sm:h-5 mb-1" /> <span>Staff Profile</span>
              </button>
              </>
              )}
            </CardContent>
          </Card>

          {/* Student Search Gated */}
          {docType !== 'reports' && docType !== 'exports' && !isStudent && !isTeacherDoc && (
            <Card className="rounded-xl border shadow-sm bg-white overflow-hidden">
              <CardHeader className="border-b bg-gray-50/50 py-2.5 sm:py-3.5 px-3 sm:px-4">
                <CardTitle className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-gray-400">Target Student</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 sm:pt-4 space-y-2.5 sm:space-y-4">
                {!selectedStudent ? (
                  <>
                    <AcademicScopeFilters
                      hierarchy={docHierarchy}
                      showShift
                      compact
                      onScopeChange={() => setSearch('')}
                    />
                    <p className="text-[9px] sm:text-[10px] text-gray-400 leading-tight">
                      Select campus → batch → session → class to list, or search by name/roll.
                    </p>
                    <div className="relative">
                      <Search className="absolute left-3 top-2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search student..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 text-xs h-9 sm:h-10 bg-white"
                      />
                    </div>

                    {isLoading && <Skeleton className="h-16 w-full rounded-lg" />}

                    {searchResults.length > 0 && (
                      <div className="border border-gray-200 rounded-lg divide-y overflow-hidden shadow-sm bg-white max-h-48 overflow-y-auto">
                        {searchResults.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              setSelectedStudent(s)
                              setSearch('')
                            }}
                            className="w-full text-left px-3 sm:px-4 py-2 hover:bg-indigo-50/20 flex justify-between items-center transition-colors gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-gray-900 truncate">{s.firstName} {s.lastName}</p>
                              <p className="text-[9px] text-gray-400 font-medium">Roll: {s.rollNumber || '—'} · {s.class?.name || 'Unassigned'}</p>
                            </div>
                            <span className="text-[8px] font-mono font-bold bg-gray-50 border px-1 py-0.5 rounded text-gray-500 flex-shrink-0">
                              {s.registrationNumber}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2.5 sm:p-3 bg-indigo-600/5 border border-indigo-150 rounded-xl gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-black text-indigo-900 leading-tight truncate">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                          <p className="text-[9px] text-indigo-600 font-bold mt-0.5">{selectedStudent.registrationNumber}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedStudent(null)
                          setSearch('')
                        }}
                        className="text-[9px] sm:text-[10px] font-bold text-gray-500 hover:text-indigo-600 hover:bg-indigo-50/50 flex-shrink-0 h-8 sm:h-9"
                      >
                        Change
                      </Button>
                    </div>
                    {docType === 'result_card' && (
                      <div className="space-y-1.5 border-t border-indigo-100 pt-3">
                        <p className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Exam Session Selection</p>
                        <div>
                          <label className="text-[9px] text-gray-500 font-bold uppercase block mb-0.5">Select Term/Session</label>
                          <select 
                            value={selectedExamSessionId}
                            onChange={(e) => setSelectedExamSessionId(e.target.value)}
                            className="w-full text-xs h-9 bg-white border border-gray-200 rounded-lg px-2"
                          >
                            {termSessions.map((t: any) => (
                              <option key={t} value={t}>{t.toUpperCase()}</option>
                            ))}
                            {termSessions.length === 0 && (
                              <option value="">No declared terms found</option>
                            )}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Teacher Search — shown only for teacher document types */}
          {!isStudent && isTeacherDoc && (
            <Card className="rounded-xl border shadow-sm bg-white overflow-hidden border-emerald-100">
              <CardHeader className="border-b bg-emerald-50/50 py-2.5 sm:py-3.5 px-3 sm:px-4">
                <CardTitle className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-600">Target Staff Member</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 sm:pt-4 space-y-2.5">
                {!selectedTeacher ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search teacher by name or ID..."
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        className="pl-9 text-xs h-9 sm:h-10 bg-white border-emerald-200 focus:border-emerald-500"
                      />
                    </div>
                    {isTeacherSearchLoading && <Skeleton className="h-16 w-full rounded-lg" />}
                    {teacherSearchResults.length > 0 && (
                      <div className="border border-emerald-100 rounded-lg divide-y overflow-hidden shadow-sm bg-white max-h-48 overflow-y-auto">
                        {teacherSearchResults.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => { setSelectedTeacher(t); setTeacherSearch('') }}
                            className="w-full text-left px-3 sm:px-4 py-2 hover:bg-emerald-50/30 flex justify-between items-center transition-colors gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-gray-900 truncate">{t.firstName} {t.lastName}</p>
                              <p className="text-[9px] text-gray-400 font-medium">{t.designation} · {t.campus?.name ?? 'No campus'}</p>
                            </div>
                            <span className="text-[8px] font-mono font-bold bg-emerald-50 border border-emerald-100 px-1 py-0.5 rounded text-emerald-700 flex-shrink-0">{t.employeeId}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {teacherSearch.length >= 2 && !isTeacherSearchLoading && teacherSearchResults.length === 0 && (
                      <p className="text-[10px] text-gray-400 text-center py-2">No staff found matching "{teacherSearch}"</p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-emerald-600/5 border border-emerald-200 rounded-xl gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-black text-emerald-900 leading-tight truncate">{selectedTeacher.firstName} {selectedTeacher.lastName}</p>
                        <p className="text-[9px] text-emerald-600 font-bold mt-0.5">{selectedTeacher.designation} · {selectedTeacher.employeeId}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedTeacher(null); setTeacherSearch('') }}
                      className="text-[9px] sm:text-[10px] font-bold text-gray-500 hover:text-emerald-600 hover:bg-emerald-50/50 flex-shrink-0 h-8 sm:h-9"
                    >
                      Change
                    </Button>
                  </div>
                )}
                {/* Experience Letter fields — only shown for that doc type */}
                {docType === 'teacher_experience' && selectedTeacher && (
                  <div className="space-y-2 border-t border-emerald-100 pt-3 mt-1">
                    <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">Letter Fields</p>
                    <div>
                      <label className="text-[9px] text-gray-500 font-bold uppercase block mb-0.5">End Date (blank = still employed)</label>
                      <Input type="date" value={expEndDate} onChange={e => setExpEndDate(e.target.value)} className="text-xs h-8 bg-white" />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-500 font-bold uppercase block mb-0.5">Principal Name</label>
                      <Input value={expPrincipalName} onChange={e => setExpPrincipalName(e.target.value)} className="text-xs h-8 bg-white" placeholder="Principal name" />
                    </div>
                    <div>
                      <label className="text-[9px] text-gray-500 font-bold uppercase block mb-0.5">Responsibilities (one per line, max 6)</label>
                      <textarea
                        value={expResponsibilities}
                        onChange={e => setExpResponsibilities(e.target.value)}
                        rows={4}
                        className="w-full text-[10px] border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:border-emerald-400 bg-white"
                        placeholder="One responsibility per line..."
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Subtype for system reports */}
          {docType === 'reports' && (
            <Card className="rounded-xl border shadow-sm bg-white overflow-hidden">
              <CardHeader className="border-b bg-gray-50/50 py-2.5 sm:py-3.5 px-3 sm:px-4">
                <CardTitle className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-gray-400">Report Category</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 sm:pt-4 space-y-2 sm:space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase">Select Category</label>
                  <Select
                    value={reportSubtype}
                    onValueChange={(val: string) => setReportSubtype(val as 'fees' | 'attendance' | 'performance')}
                  >
                    <SelectTrigger className="text-xs h-9 sm:h-10 bg-white">
                      <SelectValue placeholder="Select Report Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fees" className="text-xs">Fees Outstanding Deficit Report</SelectItem>
                      <SelectItem value="attendance" className="text-xs">Campus Attendance & Presence Report</SelectItem>
                      <SelectItem value="performance" className="text-xs">Academic Grade Distribution Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Trigger Card */}
          {docType !== 'exports' && (
            <Card className="rounded-xl border shadow-sm bg-white overflow-hidden sticky bottom-4 md:bottom-auto">
              <CardContent className="pt-3 sm:pt-6 space-y-2 sm:space-y-3">

                        <div className="flex items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-bold text-gray-600">
                          <div>Output Color Mode</div>
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <button
                              onClick={() => { setColorMode('color'); try { localStorage.setItem('document_color_mode', 'color') } catch(e){} }}
                              className={`text-[10px] sm:text-[11px] px-2 sm:px-3 py-1 rounded-lg border transition-all ${colorMode === 'color' ? 'bg-white text-gray-900 border-gray-300 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              Color
                            </button>
                            <button
                              onClick={() => { setColorMode('bw'); try { localStorage.setItem('document_color_mode', 'bw') } catch(e){} }}
                              className={`text-[10px] sm:text-[11px] px-2 sm:px-3 py-1 rounded-lg border transition-all ${colorMode === 'bw' ? 'bg-white text-gray-900 border-gray-300 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              B&amp;W
                            </button>
                          </div>
                        </div>

                {/* PDF Download — hidden for reports and exports */}
                {docType !== 'reports' && docType !== 'exports' && (
                  <Button
                    onClick={handleDownloadDocument}
                    disabled={isGenerating || isExporting || (isTeacherDoc ? !selectedTeacher : !selectedStudent)}
                    className="w-full bg-[#1e3a8a] hover:bg-[#1e40af] active:scale-95 text-white text-xs sm:text-sm font-bold h-9 sm:h-10 rounded-lg shadow-sm border border-indigo-500 flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="hidden sm:inline">Compiling PDF...</span>
                        <span className="inline sm:hidden">Building...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Download Document PDF</span>
                        <span className="inline sm:hidden">Download PDF</span>
                      </>
                    )}
                  </Button>
                )}

                {/* Excel Download — only visible in Admin Reports Terminal */}
                {docType === 'reports' && (
                  <Button
                    onClick={handleDownloadExcel}
                    disabled={isExporting || isGenerating || !liveReport}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs sm:text-sm font-bold h-9 sm:h-10 rounded-lg shadow-sm border border-emerald-500 flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="hidden sm:inline">Building Excel...</span>
                        <span className="inline sm:hidden">Building...</span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4" />
                        <span className="hidden sm:inline">Download as Excel (.xlsx)</span>
                        <span className="inline sm:hidden">Download Excel</span>
                      </>
                    )}
                  </Button>
                )}

              </CardContent>
            </Card>
          )}
        </div>

        {/* Live Document Preview Panel */}
        <div className="md:col-span-5 lg:col-span-7 space-y-3 sm:space-y-4">
          <h3 className="text-xs sm:text-sm font-black uppercase text-gray-400 tracking-wider px-1">Live Document Canvas (A4 Aspect)</h3>
          
          <div className="bg-gray-100 p-3 sm:p-6 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-start overflow-auto max-h-[50vh] sm:max-h-[70vh] md:max-h-[80vh] w-full shadow-inner">
            {selectedStudent || docType === 'reports' || docType === 'exports' || (isTeacherDoc && selectedTeacher) ? (
              <>
                {docType === 'exports' ? (
                  <div className="w-full max-w-xl bg-white rounded-xl border shadow-sm p-6 flex flex-col space-y-6 text-left">
                  <div className="flex items-center gap-3 border-b pb-4">
                    <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                      <Database className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">Database Master Export Center</h2>
                      <p className="text-[10px] text-gray-500 font-medium">Download complete registry lists as sortable, styled Excel files.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Students Registry Card */}
                    <Card className="border shadow-none bg-white">
                      <CardContent className="p-4 flex justify-between items-center gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-md mt-0.5">
                            <GraduationCap className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">Students Master Register</h4>
                            <p className="text-[10px] text-gray-500 leading-normal mt-0.5">Profiles, CNIC/B-Forms, classes/sections, and dues summary.</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleExportMasterData('students')}
                          disabled={isExportingMaster['students']}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8.5 rounded px-4 shadow-sm border border-emerald-500 flex items-center gap-1.5 shrink-0"
                        >
                          {isExportingMaster['students'] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          Export
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Faculty Registry Card */}
                    <Card className="border shadow-none bg-white">
                      <CardContent className="p-4 flex justify-between items-center gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-md mt-0.5">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">Faculty Registry</h4>
                            <p className="text-[10px] text-gray-500 leading-normal mt-0.5">Qualifications, experience, monthly salary, and course loads.</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleExportMasterData('teachers')}
                          disabled={isExportingMaster['teachers']}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8.5 rounded px-4 shadow-sm border border-emerald-500 flex items-center gap-1.5 shrink-0"
                        >
                          {isExportingMaster['teachers'] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          Export
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Support & Admin Staff Card */}
                    <Card className="border shadow-none bg-white">
                      <CardContent className="p-4 flex justify-between items-center gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-md mt-0.5">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">Staff & Support Directory</h4>
                            <p className="text-[10px] text-gray-500 leading-normal mt-0.5">Accountants, administrators directory and status log.</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleExportMasterData('staff')}
                          disabled={isExportingMaster['staff']}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8.5 rounded px-4 shadow-sm border border-emerald-500 flex items-center gap-1.5 shrink-0"
                        >
                          {isExportingMaster['staff'] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          Export
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Financial Master Ledger Card */}
                    <Card className="border shadow-none bg-white">
                      <CardContent className="p-4 flex justify-between items-center gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-md mt-0.5">
                            <CircleDollarSign className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">Master Financial Ledger</h4>
                            <p className="text-[10px] text-gray-500 leading-normal mt-0.5">All-time fee invoices ledger, dues, paid & overdue status.</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleExportMasterData('fees')}
                          disabled={isExportingMaster['fees']}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8.5 rounded px-4 shadow-sm border border-emerald-500 flex items-center gap-1.5 shrink-0"
                        >
                          {isExportingMaster['fees'] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          )}
                          Export
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[9px] leading-relaxed flex items-start gap-2">
                    <span className="font-bold">⚠️ ADVISORY:</span>
                    <span>Contains sensitive details. Distribute responsibly and secure all backups under local IT compliance protocol.</span>
                  </div>
                </div>
              ) : (
                <div 
                  className="w-full flex justify-center pb-12"
                >
                  <div 
                    ref={documentCaptureRef}
                    className="shadow-xl overflow-visible shrink-0"
                    style={{
                      ...previewStyles,
                      backgroundColor: 'transparent',
                      color: '#111827',
                    }}
                  >
                {/* ─── 1. ID CARD PREVIEW (CR80 ATM FORMAT 680×428) ───────────────────── */}
                {docType === 'id_card' && selectedStudent && (
                  <div data-document-page className="flex flex-col gap-8 p-0 bg-transparent items-center" style={{ width: '680px' }}>
                    {/* Front Face */}
                    <div
                      id="id-card-template-front"
                      className="w-[680px] h-[428px] bg-white shrink-0 rounded-[20px] shadow-lg relative flex flex-row border-[3px] border-[#cbd5e1] overflow-hidden"
                      style={{ width: '680px', height: '428px', fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                      data-card="front"
                      data-pdf-width="680"
                      data-pdf-height="428"
                      data-pdf-physical-width="85.6"
                      data-pdf-physical-height="54"
                      data-pdf-physical-unit="mm"
                    >
                      {/* Left Sidebar Accent */}
                      <div className="w-[18px] h-[428px] bg-[#1e3a8a] shrink-0 z-20 relative" />
                      
                      {/* Main Front Content */}
                      <div className="w-[452px] flex flex-col pt-7 pb-6 pl-8 pr-6 relative z-10 h-[428px] bg-[#f8fafc]">
                        
                        {/* Header: Logo and Institute Name */}
                        <div className="flex items-center border-b-2 border-[#bfdbfe] pb-4 mb-5 relative z-10 shrink-0">
                          <div className="w-[54px] h-[54px] flex items-center justify-center shrink-0 bg-white rounded-xl shadow-sm border border-[#dbeafe] p-1.5 mr-4">
                            <AcademyLogo className="w-full h-full text-[#1e3a8a]" />
                          </div>
                          <div className="flex flex-col w-[330px]">
                            <h2 className="text-[24px] font-black tracking-tight text-[#1e3a8a] leading-[1.2] m-0 uppercase whitespace-nowrap">Evershaheen Academy</h2>
                            <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#2563eb] leading-[1.2] mt-1 block whitespace-nowrap">Student Identity Card</span>
                          </div>
                        </div>

                        {/* Details Table (Html2canvas Safe) */}
                        <div className="flex flex-col gap-[12px] text-[14px] font-bold text-[#1f2937] relative z-10 flex-1 w-full">
                          <div className="flex items-start">
                             <div className="w-[90px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Name</div>
                             <div className="text-[#93c5fd] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[280px] break-words">{selectedStudent.firstName} {selectedStudent.lastName}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[90px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">ID No.</div>
                             <div className="text-[#93c5fd] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[280px] break-words">ESA-{new Date().getFullYear().toString().slice(-2)}-{selectedStudent.registrationNumber.slice(-4)}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[90px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Class</div>
                             <div className="text-[#93c5fd] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[280px] break-words">{selectedStudent.class?.name || 'N/A'}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[90px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Section</div>
                             <div className="text-[#93c5fd] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[280px] break-words">{selectedStudent.shift ? sessionShiftFormalLabel(selectedStudent.shift) : 'N/A'}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[90px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Session</div>
                             <div className="text-[#93c5fd] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[280px] break-words">{new Date().getFullYear()}–{new Date().getFullYear() + 1}</div>
                          </div>
                        </div>

                        {/* Footer Functional */}
                        <div className="mt-auto flex justify-between items-end relative z-10 w-full shrink-0">
                            <div className="block">
                               <div className="text-[10px] text-[#6b7280] font-bold leading-[1.2] mb-1 block">Issued:</div>
                               <div className="text-[13px] font-black text-[#1e3a8a] leading-[1.2] whitespace-nowrap block">{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                            </div>
                            <div className="block text-center">
                                <div className="w-[130px] border-b-[2px] border-[#1e3a8a] pb-2 mx-auto mb-2">
                                   <span className="font-serif italic text-[#1e3a8a] text-[13px] leading-[1.2] block">System Authorized</span>
                                </div>
                                <span className="text-[9px] uppercase font-bold text-[#6b7280] tracking-widest leading-[1.2] block">Principal</span>
                            </div>
                        </div>
                      </div>

                      {/* Right Panel Avatar */}
                      <div className="w-[210px] bg-[#1e3a8a] shrink-0 relative flex flex-col items-center justify-center z-20">
                         {/* Avatar Box */}
                         <div className="relative z-10 flex flex-col items-center w-full px-6">
                           <div className="w-[150px] h-[190px] rounded-[14px] p-[6px] bg-[#2563eb] border border-[#3b82f6] shadow-xl relative flex items-center justify-center">
                            <div className="w-full h-full rounded-[8px] overflow-hidden bg-[#f8fafc] border-[3px] border-white relative shadow-inner">
                              <img
                                src={profilePictureDataUrl || getAvatarDataUrl(selectedStudent.firstName, selectedStudent.lastName, '#1e3a8a')}
                                alt={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                                className="w-full h-full object-cover relative z-10"
                                crossOrigin="anonymous"
                              />
                            </div>
                           </div>
                           <div className="mt-6 bg-white text-[#1e3a8a] px-6 py-2 rounded-full text-[13px] font-black uppercase tracking-widest shadow-lg leading-[1.2] border border-[#dbeafe]">
                             Student
                           </div>
                         </div>
                      </div>
                    </div>

                    {/* Back Face */}
                    <div
                      id="id-card-template-back"
                      className="w-[680px] h-[428px] bg-white shrink-0 rounded-[20px] shadow-lg relative flex flex-row border-[3px] border-[#cbd5e1] overflow-hidden"
                      style={{ width: '680px', height: '428px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}
                      data-card="back"
                      data-pdf-width="680"
                      data-pdf-height="428"
                      data-pdf-physical-width="85.6"
                      data-pdf-physical-height="54"
                      data-pdf-physical-unit="mm"
                    >
                      {/* Left Panel Verification Area */}
                      <div className="w-[210px] bg-[#f8fafc] flex flex-col items-center justify-center p-6 relative border-r-2 border-[#dbeafe] z-20 shrink-0 h-[428px]">
                          {/* Top decorative line */}
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-[#1e3a8a]" />
                          
                          <div className="w-[130px] h-[130px] bg-white p-2.5 border-[3px] border-[#dbeafe] rounded-2xl shadow-sm flex items-center justify-center relative mb-5">
                            {qrCodeDataUrl ? (
                              <img 
                                src={qrCodeDataUrl}
                                alt="Verification QR Code"
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-50 flex items-center justify-center rounded-xl border border-dashed border-[#d1d5db]">
                                <span className="text-[10px] text-[#9ca3af] font-medium">Generating...</span>
                              </div>
                            )}
                          </div>
                          <div className="w-[160px] bg-[#1e3a8a] text-white px-4 py-2.5 rounded-lg text-center shadow-md border border-[#1e40af]">
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase block leading-[1.2]">Scan to Verify</span>
                            <span className="text-[8px] font-medium text-[#bfdbfe] mt-1 block opacity-90 leading-[1.2]">Official System Record</span>
                          </div>
                      </div>

                      {/* Content Container */}
                      <div className="w-[470px] flex flex-col py-8 px-8 relative bg-white z-10 h-[428px]">
                         <div className="relative z-10 flex flex-col h-full w-full">
                            
                            {/* Information Table */}
                            <div className="block w-full pt-2">
                                <div className="block w-full mb-6">
                                    <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Father's Name</div>
                                    <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-full break-words block">{selectedStudent.fatherName || 'Not Provided'}</div>
                                </div>
                                
                                <div className="flex flex-row w-full gap-[30px] mb-6">
                                    <div className="block w-[160px]">
                                        <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Parent Contact</div>
                                        <div className="text-[#0f172a] font-black text-[14px] leading-[1.2] w-full block">—</div>
                                    </div>
                                    <div className="block w-[160px]">
                                        <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Academy Contact</div>
                                        <div className="text-[#0f172a] font-black text-[14px] leading-[1.2] w-full block">0328-4010522</div>
                                    </div>
                                </div>

                                <div className="block w-full">
                                    <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Residential Address</div>
                                    <div className="text-[#0f172a] font-bold text-[13px] leading-[1.4] w-full break-words block">Moor G.T. Road, Gujranwala</div>
                                </div>
                            </div>
                            
                            {/* Important Note Box */}
                            <div className="mt-auto pt-5 w-full">
                                <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-xl p-4 w-full">
                                    <div className="flex items-center mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-2" />
                                        <div className="text-[11px] uppercase font-black tracking-widest text-[#1e3a8a] leading-[1.2]">Important Notice</div>
                                    </div>
                                    <p className="text-[10px] text-[#4b5563] leading-[1.5] font-medium m-0 p-0 w-full">
                                        This identity card is the property of <strong className="text-[#1f2937]">Evershaheen Academy</strong>. It must be carried during academy hours and presented upon request. If found, please return it to the administration office immediately or contact the academy helpline.
                                    </p>
                                </div>
                            </div>

                         </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 2. BIRTHDAY CERTIFICATE PREVIEW ────────────────────── */}
                {docType === 'birthday' && selectedStudent && (
                  <div
                    data-document-page
                    className="w-[595px] min-h-[842px] bg-[#fffdf8] border-[12px] border-solid border-[#d4af37] flex flex-col items-center relative overflow-hidden shrink-0"
                    style={{ fontFamily: 'Georgia, serif', minHeight: '842px', boxSizing: 'border-box', boxShadow: 'inset 0 0 40px rgba(212,175,55,0.15)' }}
                  >
                    <div className="absolute inset-x-0 top-24 flex justify-center pointer-events-none opacity-5">
                      <div className="w-[300px] h-[300px]">
                        <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full" />
                      </div>
                    </div>
                    
                    {/* Golden Ornamental Inner Borders */}
                    <div className="absolute inset-[6px] border border-[#d4af37]/40 pointer-events-none" />
                    <div className="absolute inset-[10px] border border-[#d4af37]/20 pointer-events-none" />

                    {/* Corner Ornaments */}
                    <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-[#d4af37]" />
                    <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-[#d4af37]" />
                    <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-[#d4af37]" />
                    <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-[#d4af37]" />

                    {/* Logo & Header */}
                    <div className="mt-8 w-full max-w-xs rounded-2xl border border-[#d4af37]/30 bg-white/90 p-3 shadow-md flex flex-col items-center gap-1 relative z-10">
                      <div className="rounded-full border border-[#d4af37]/40 bg-[#fffdf8] p-1.5 flex items-center justify-center shadow-inner">
                        <AcademyLogo className="w-8 h-8 text-[#d4af37]" />
                      </div>
                      <div className="text-center">
                        <h2 className="text-[#d4af37] text-[16px] font-black uppercase tracking-[0.2em]">Evershaheen Academy</h2>
                        <p className="text-[7.5px] text-gray-500 uppercase tracking-widest font-black mt-0.5">We Make your Children More Valuable</p>
                        <p className="text-[6.5px] text-gray-600 font-bold leading-normal mt-0.5 max-w-[240px] mx-auto">Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony</p>
                        <p className="text-[7.5px] text-[#d4af37] font-black mt-0.5">📱 Boys: 0328-4010522 · Girls: 0324-8985526</p>
                      </div>
                    </div>

                    <div className="w-3/4 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent my-4 relative z-10" />

                    {/* Student Photo */}
                    <div className="w-20 h-20 rounded-full border-4 border-[#d4af37] overflow-hidden bg-[#fffdf8] flex items-center justify-center shadow-md relative z-10">
                      <img
                        src={profilePictureDataUrl || getAvatarDataUrl(selectedStudent.firstName, selectedStudent.lastName, '#d4af37')}
                        alt={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                        className="w-full h-full"
                        style={{ objectFit: 'cover' }}
                      />
                    </div>

                    {/* Title */}
                    <div className="relative z-10 mt-3 text-center">
                      <h1 className="text-[24px] font-black text-gray-900 uppercase tracking-widest leading-tight">
                        Birthday Certificate
                      </h1>
                      <p className="text-[11px] italic text-gray-500 mt-2 font-medium leading-snug">This certificate of blessing is joyfully awarded to</p>
                    </div>

                    {/* Student Name */}
                    <div className="relative z-10 mt-4 w-full flex flex-col items-center">
                      <div className="text-center">
                        <h2 className="text-[22px] sm:text-[24px] font-black text-[#1e3a8a] tracking-[0.08em] leading-tight">
                          {formatPersonNameLocal(selectedStudent.firstName, selectedStudent.lastName)}
                        </h2>
                        <div className="mt-3 h-[2px] w-32 sm:w-40 md:w-48 lg:w-56 bg-[#d4af37] rounded-full mx-auto" />
                      </div>
                      <p className="text-[9px] text-gray-500 font-bold uppercase mt-3 tracking-[0.2em] bg-gray-50/80 px-3 py-1 rounded-full border border-gray-200 whitespace-nowrap">
                        Class: {selectedStudent.class?.name || 'Scholar'} <span className="mx-1 text-[#d4af37]">•</span> Roll No: {selectedStudent.rollNumber || '—'}
                      </p>
                    </div>

                    {/* Message Body */}
                    <p className="text-[11px] text-gray-700 max-w-sm text-center leading-relaxed mt-4 px-4 font-medium relative z-10">
                      On this beautiful day, the administration and faculty of Evershaheen Academy come together to celebrate your life and academic progress. We wish you an abundance of joy, wisdom, sound health, and spectacular future endeavors. Keep shining and climbing high!
                    </p>

                    {/* Date Details */}
                    <div className="mt-4 flex flex-col items-center bg-[#fdfaf1] px-6 py-3 rounded-lg border border-[#d4af37]/20 shadow-sm relative z-10">
                      <span className="text-[9px] uppercase font-bold text-gray-500 tracking-[0.2em]">Date of Birth</span>
                      <span className="text-[14px] font-black text-gray-900 mt-1 uppercase tracking-[0.12em] leading-tight text-center whitespace-nowrap">
                        {selectedStudent.dateOfBirth && !isNaN(new Date(selectedStudent.dateOfBirth).getTime()) ? new Date(selectedStudent.dateOfBirth).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Unknown Date'}
                      </span>
                    </div>

                    <div className="flex-1 min-h-[16px]" />
                    {/* QR + Signatures row */}
                    <div className="w-full px-8 flex items-end justify-between mb-6 relative z-10">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-16 h-16 bg-white rounded-lg p-1 border border-[#d4af37]/40 shadow-sm">
                          <img
                            src={qrCodeDataUrl}
                            alt="Scan to Verify"
                            className="w-full h-full"
                          />
                        </div>
                        <span className="text-[8px] font-bold text-[#d4af37] uppercase tracking-widest bg-yellow-50/50 px-2 py-0.5 rounded border border-yellow-200">Verify</span>
                      </div>
                      <div className="flex gap-6 flex-nowrap shrink-0">
                        <div className="flex flex-col items-center">
                          <div className="w-28 border-b border-gray-400 pb-1 flex items-end justify-center h-10">
                            <span className="font-serif italic text-[11px] text-gray-300 whitespace-nowrap">Principal Stamp</span>
                          </div>
                          <span className="text-[9px] uppercase font-bold text-gray-500 mt-1 tracking-widest whitespace-nowrap">Academy Principal</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <div className="w-28 border-b border-gray-400 pb-1 flex items-end justify-center h-10">
                              <span className="font-serif italic text-[11px] text-gray-300 whitespace-nowrap">Teacher Seal</span>
                            </div>
                            <span className="text-[9px] uppercase font-bold text-gray-500 mt-1 tracking-widest whitespace-nowrap">Class Teacher</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 3. BONAFIDE CERTIFICATE PREVIEW ────────────────────── */}
                {docType === 'bonafide' && selectedStudent && (
                  <div
                    data-document-page
                    className="w-[595px] min-h-[842px] bg-white flex flex-col items-start relative overflow-hidden shrink-0"
                    style={{ fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                  >
                    <div className="absolute inset-0 border-[12px] border-[#1e3a8a] pointer-events-none z-20" />
                    <div className="absolute inset-0 border-[16px] border-white pointer-events-none z-20" />

                    {/* Watermark */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none z-10">
                      <div className="w-[300px] h-[300px]">
                        <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full" />
                      </div>
                    </div>

                    <div className="w-full px-10 pt-8 flex flex-col h-full relative z-10">
                      {/* Header Letterhead */}
                      <div className="w-full flex items-center justify-between border-b-[3px] border-[#1e3a8a] pb-4">
                        <div className="flex items-center gap-3">
                          <AcademyLogo className="w-14 h-14 text-[#1e3a8a] shrink-0" />
                          <div>
                            <h2 className="text-[20px] font-black uppercase text-[#1e3a8a] leading-none tracking-tight">EVERSHAHEEN ACADEMY</h2>
                            <p className="text-[8.5px] text-gray-500 uppercase tracking-[0.2em] font-black mt-1">We Make your Children More Valuable</p>
                            <p className="text-[7.5px] text-gray-600 mt-0.5">Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony</p>
                          </div>
                        </div>
                        <div className="text-right text-[8px] text-gray-500 font-bold space-y-0.5">
                          <p>📱 Boys: 0328-4010522</p>
                          <p>📱 Girls: 0324-8985526</p>
                          <p className="mt-1.5 text-indigo-600 font-mono">Date: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>

                      {/* Metadata Serial No */}
                      <div className="w-full flex justify-between items-center mt-3 text-[9px] font-bold text-gray-500">
                        <span>Ref No: ESA/BON/{selectedStudent.registrationNumber.split('/').pop()}/{new Date().getFullYear()}</span>
                      </div>

                      {/* Document Title */}
                      <div className="w-full flex items-center mt-4 mb-5 px-10">
                        <div className="flex-1 h-px bg-gray-300" />
                        <h1 className="text-[28px] font-black uppercase tracking-[0.15em] text-[#0f172a] px-6 text-center leading-[1.1]">
                          BONAFIDE<br/>CERTIFICATE
                        </h1>
                        <div className="flex-1 h-px bg-gray-300" />
                      </div>

                      {/* Student quick-reference bar */}
                      <div className="w-full bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3 flex items-center gap-4 shadow-sm relative z-10">
                        {/* Student Photo */}
                        <div className="w-16 h-16 rounded-lg border-2 border-[#1e3a8a] overflow-hidden shadow flex-shrink-0 bg-white">
                          <img
                            src={profilePictureDataUrl || getAvatarDataUrl(selectedStudent.firstName, selectedStudent.lastName, '#1e3a8a')}
                            alt={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                            className="w-full h-full"
                            style={{ objectFit: 'cover' }}
                          />
                        </div>
                        {/* Meta */}
                        <div className="flex flex-wrap text-[11px] leading-tight text-gray-800 flex-1 justify-between">
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Student Name</span>
                            <span className="font-black text-gray-900 text-[13px] block">{selectedStudent.firstName} {selectedStudent.lastName}</span>
                          </div>
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Father Name</span>
                            <span className="font-black text-gray-900 text-[13px] block">{selectedStudent.fatherName}</span>
                          </div>
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Class Section</span>
                            <span className="font-black text-gray-900 text-[12px] block">{selectedStudent.class?.name || 'Scholar Group'}</span>
                          </div>
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Roll / Reg ID</span>
                            <span className="font-bold text-gray-900 text-[12px] block">{selectedStudent.rollNumber || '—'} / <span className="font-mono text-[#1e3a8a]">{selectedStudent.registrationNumber}</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Formal Text Paragraph */}
                      <div className="w-full text-[12px] text-gray-800 space-y-3 leading-relaxed text-left mt-4 relative z-10 font-medium">
                        <p>
                          This is to certify that <strong className="font-black text-[#1e3a8a] text-[13px] border-b border-[#1e3a8a]/30">{selectedStudent.firstName} {selectedStudent.lastName}</strong>,{' '}
                          son / daughter of Mr. <strong className="font-black text-[#1e3a8a] text-[13px] border-b border-[#1e3a8a]/30">{selectedStudent.fatherName || '__________________'}</strong>, bearing B-Form / CNIC number{' '}
                          <strong className="font-black text-gray-900">{selectedStudent.cnicBForm || 'on file'}</strong>, is a bonafide student of Evershaheen Academy, Madina Town Campus.
                        </p>
                        <p>
                          The student is currently active in <strong className="font-black text-gray-900">{selectedStudent.class?.name || 'Scholar Section'}</strong>
                          {(selectedStudent.shift ?? selectedStudent.class?.shift) && (
                            <> (<strong className="font-black text-gray-900">{sessionShiftFormalLabel((selectedStudent.shift ?? selectedStudent.class?.shift)!)}</strong>)</>
                          )}{' '}
                          under Registration Number <strong className="font-black font-mono text-[#1e3a8a]">{selectedStudent.registrationNumber}</strong> and Roll Number{' '}
                          <strong className="font-black text-gray-900">{selectedStudent.rollNumber || 'Not assigned'}</strong> for the academic session{' '}
                          <strong className="font-black text-gray-900">{new Date().getFullYear()}&ndash;{new Date().getFullYear() + 1}</strong>.
                        </p>
                        <p>
                          During his/her study period in this institution, we have found him/her to be hardworking, disciplined,{' '}
                          and well-mannered. His/her character and conduct have been exemplary.
                        </p>
                        <p>
                          This certificate is issued at the request of the student for official verification and record purposes.{' '}
                          We wish him/her the absolute best in all future academic pursuits.
                        </p>
                      </div>

                      <div className="flex-1 min-h-[16px]" />
                      {/* Verification Block */}
                      <div className="w-full flex justify-between items-end mb-4 relative z-10">
                        {/* Secure QR */}
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="w-16 h-16 border-2 border-[#1e3a8a]/30 p-1.5 rounded-lg bg-white shadow-sm flex-shrink-0">
                            <img
                              src={qrCodeDataUrl || undefined}
                              alt="QR Verify"
                              className="w-full h-full"
                            />
                          </div>
                          <span className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Scan to Verify</span>
                        </div>

                        {/* Signature block */}
                        <div className="block text-center">
                          <div className="w-44 border-b border-gray-400 pb-2 mx-auto mb-2">
                            <span className="font-black text-[12px] text-gray-900 block">Principal Signature</span>
                          </div>
                          <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest block">Authorized Seal &amp; Signature</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 4. RESULT CARD PREVIEW ─────────────────────────────── */}
                {docType === 'result_card' && selectedStudent && (
                  <div
                    data-document-page
                    className="w-[595px] bg-white flex flex-col items-start relative shrink-0"
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      color: '#111827',
                      boxSizing: 'border-box',
                      height: '842px',
                      overflow: 'hidden',
                      border: '4px solid black',
                      outline: '1px solid black',
                      outlineOffset: '-10px',
                    }}
                  >
                    {/* Watermark */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none z-10">
                      <div className="w-[280px] h-[280px]"><AcademyLogo variant="icon" theme="mono-black" className="w-full h-full" /></div>
                    </div>

                    <div className="w-full px-8 py-6 flex flex-col relative z-10">
                      {/* HEADER */}
                      <div className="w-full flex items-center gap-4 pb-3 border-b-2 border-black">
                        <div className="w-20 h-20 shrink-0">
                          <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full text-black" />
                        </div>
                        <div className="flex-1 text-center">
                          <h1 className="text-[22px] font-black uppercase tracking-wide text-black leading-tight mb-1">EVERSHAHEEN ACADEMY</h1>
                          <div className="w-72 h-[2px] bg-black mx-auto mb-1" />
                          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-600">Pakistan Education System</p>
                          <p className="text-[8px] text-gray-500 mt-0.5">Madina Town, near Mandiala Warraich Road, Labor Gulshan Colony</p>
                          <p className="text-[8px] text-gray-500">Boys: 0328-4010522 &nbsp;|&nbsp; Girls: 0324-8985526</p>
                        </div>
                        <div className="w-20 shrink-0 text-right text-[8px] font-bold text-gray-600">
                          <p>{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>
                      {/* TITLE */}
                      <div className="w-full text-center mt-2.5 mb-2.5">
                        <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-black inline-block border border-black px-6 py-0.5 bg-gray-50">
                          {selectedExamSessionId ? `${selectedExamSessionId.replace(/-/g, ' ')}` : 'Official Result Card'}
                        </h2>
                      </div>

                      {/* STUDENT INFO + PHOTO */}
                      <div className="w-full flex items-stretch border border-black mb-3.5">
                        <div className="flex-1 p-2.5 text-[9px] space-y-1">
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            <div className="flex gap-1"><span className="font-bold uppercase w-24 shrink-0">Roll No:</span><span className="font-black underline">{selectedStudent.rollNumber || '—'}</span></div>
                            <div className="flex gap-1"><span className="font-bold uppercase w-24 shrink-0">Shift / Mode:</span><span className="font-bold underline uppercase">{selectedStudent.class?.shift || selectedStudent.shift || 'MORNING'} / PHYSICAL</span></div>
                            
                            <div className="flex gap-1"><span className="font-bold uppercase w-24 shrink-0">Reg No:</span><span className="font-black underline font-mono text-[8.5px]">{selectedStudent.registrationNumber}</span></div>
                            <div className="flex gap-1"><span className="font-bold uppercase w-24 shrink-0">Perf House:</span><span className="font-black underline uppercase" style={{ color: selectedStudent.house?.color || '#111827' }}>{selectedStudent.house?.name || '—'}</span></div>
                            
                            <div className="flex gap-1 col-span-2"><span className="font-bold uppercase w-24 shrink-0">Student Name:</span><span className="font-black underline">{selectedStudent.firstName} {selectedStudent.lastName}</span></div>
                            <div className="flex gap-1 col-span-2"><span className="font-bold uppercase w-24 shrink-0">Father Name:</span><span className="font-black underline">{selectedStudent.fatherName || '—'}</span></div>
                            
                            <div className="flex gap-1"><span className="font-bold uppercase w-24 shrink-0">Class / Sec:</span><span className="font-black underline">{selectedStudent.class?.name || '—'}</span></div>
                            <div className="flex gap-1"><span className="font-bold uppercase w-24 shrink-0">Date of Issue:</span><span className="font-bold">{new Date().toLocaleDateString('en-PK')}</span></div>
                          </div>
                        </div>
                        <div className="w-20 shrink-0 border-l border-black p-1 flex items-center justify-center bg-gray-50">
                          {profilePictureDataUrl ? (
                            <img src={profilePictureDataUrl} alt="Student" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[7px] text-gray-400 font-bold uppercase text-center leading-tight">Passport<br/>Photo</span>
                          )}
                        </div>
                      </div>
                      {/* MARKS TABLE */}
                      <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse', border: '1px solid black' }}>
                        <thead>
                          <tr style={{ background: '#1e3a8a', color: 'white' }}>
                            <th style={{ border: '1px solid #1e3a8a', padding: '4px 6px', textAlign: 'left', width: '38%' }}>Subject</th>
                            <th style={{ border: '1px solid #1e3a8a', padding: '4px 6px', textAlign: 'center' }}>Total Marks</th>
                            <th style={{ border: '1px solid #1e3a8a', padding: '4px 6px', textAlign: 'center' }}>Obtained Marks</th>
                            <th style={{ border: '1px solid #1e3a8a', padding: '4px 6px', textAlign: 'center' }}>%</th>
                            <th style={{ border: '1px solid #1e3a8a', padding: '4px 6px', textAlign: 'center' }}>Grade</th>
                            <th style={{ border: '1px solid #1e3a8a', padding: '4px 6px', textAlign: 'center' }}>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subjectsToRender.length === 0 ? (
                            <tr><td colSpan={6} style={{ border: '1px solid black', padding: '12px', textAlign: 'center', color: '#9ca3af', fontWeight: 'bold' }}>No exam results recorded for this student.</td></tr>
                          ) : (
                            subjectsToRender.map((s: any, idx: number) => {
                              const pct = s.total > 0 ? Math.round((s.obtained / s.total) * 100) : 0
                              return (
                                <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                  <td style={{ border: '1px solid black', padding: '4px 6px', fontWeight: 'bold' }}>{s.subject}</td>
                                  <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>{s.total}</td>
                                  <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900' }}>{s.obtained}</td>
                                  <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>{pct}%</td>
                                  <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900', fontFamily: 'monospace' }}>{s.grade}</td>
                                  <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900', fontSize: '8.5px', textTransform: 'uppercase' }}>{s.status}</td>
                                </tr>
                              )
                            })
                          )}
                          <tr style={{ background: '#eff6ff' }}>
                            <td style={{ border: '1px solid black', padding: '4px 6px', fontWeight: '900', textTransform: 'uppercase', fontSize: '8.5px' }}>Total</td>
                            <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900' }}>{totalPossible}</td>
                            <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900' }}>{totalObtained}</td>
                            <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900' }}>{cumulativePercentage}%</td>
                            <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900', fontFamily: 'monospace' }}>{activeTermResult?.grade || getOverallGrade(cumulativePercentage)}</td>
                            <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', fontWeight: '900', fontSize: '8.5px', textTransform: 'uppercase' }}>{cumulativePercentage >= 40 ? 'Pass' : 'Fail'}</td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Result Summary */}
                      <div className="w-full mt-2 pb-1 border-b border-black text-[9px] flex justify-between items-center">
                        <div>
                          <span className="font-bold">Result Status: </span>
                          <span className="font-black text-indigo-900">{cumulativePercentage}% &nbsp;|&nbsp; Grade: {activeTermResult?.grade || getOverallGrade(cumulativePercentage)} &nbsp;|&nbsp; {cumulativePercentage >= 40 ? 'PASS' : 'FAIL'}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-gray-500 uppercase">Term: </span>
                          <span className="font-black text-indigo-700">{selectedExamSessionId ? selectedExamSessionId.toUpperCase() : '—'}</span>
                        </div>
                      </div>

                      {/* Performance Batch, Position & Remarks */}
                      <div className="w-full mt-2 grid grid-cols-2 gap-2 text-[9px]">
                        <div className="border border-black p-2 bg-gray-50 flex flex-col justify-center space-y-1">
                          <div className="flex justify-between"><span className="font-bold">Class Position:</span><span className="font-black underline">{activeTermResult?.classPosition ? `${activeTermResult.classPosition}${activeTermResult.classPosition === 1 ? 'st' : activeTermResult.classPosition === 2 ? 'nd' : activeTermResult.classPosition === 3 ? 'rd' : 'th'}` : '—'}</span></div>
                          <div className="flex justify-between"><span className="font-bold">Performance Batch:</span><span className="font-black text-blue-700 font-mono">{activeTermResult?.performanceBatch || '—'}</span></div>
                        </div>
                        <div className="border border-black p-2 bg-gray-50 flex flex-col justify-between">
                          <span className="font-bold block mb-0.5">Teacher's Remarks:</span>
                          <span className="italic font-medium text-gray-700 leading-tight block">{activeTermResult?.teacherRemarks || 'No remarks recorded.'}</span>
                        </div>
                      </div>

                      {/* Term Custom Fields */}
                      {activeTermResult?.customFields && Array.isArray(activeTermResult.customFields) && (activeTermResult.customFields as any[]).length > 0 && (
                        <div className="w-full mt-2 border border-black p-2 bg-gray-50/50 text-[9px]">
                          <span className="font-bold block mb-1">Additional Assessments & co-curricular metrics:</span>
                          <div className="grid grid-cols-3 gap-2">
                            {(activeTermResult.customFields as any[]).map((cf, idx) => (
                              <div key={idx} className="flex justify-between border-b border-gray-200 pb-0.5">
                                <span className="text-gray-500 uppercase font-bold text-[7.5px]">{cf.label}:</span>
                                <span className="font-black">{cf.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex-1" style={{ minHeight: '4px' }} />
                      {/* SIGNATURES — fully contained within 842px canvas */}
                      <div className="w-full px-2" style={{ paddingBottom: '8px' }}>
                        {/* Row 1 */}
                        <div className="w-full flex justify-between mb-4">
                          <div className="text-center" style={{ width: '44%' }}>
                            <div style={{ height: '22px', borderBottom: '1px solid black', marginBottom: '3px' }} />
                            <span style={{ fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Parent / Guardian</span>
                          </div>
                          <div className="text-center" style={{ width: '44%' }}>
                            <div style={{ height: '22px', borderBottom: '1px solid black', marginBottom: '3px' }} />
                            <span style={{ fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Class Teacher</span>
                          </div>
                        </div>
                        {/* Row 2 */}
                        <div className="w-full flex justify-between items-center">
                          <div className="text-center" style={{ width: '38%' }}>
                            <div style={{ height: '22px', borderBottom: '1px solid black', marginBottom: '3px' }} />
                            <span style={{ fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Controller of Exams</span>
                          </div>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', fontSize: '5px', fontWeight: '900', color: 'rgba(0,0,0,0.3)', textAlign: 'center', lineHeight: '1.3', flexShrink: 0 }}>OFFICIAL<br />SEAL</div>
                          <div className="text-center" style={{ width: '38%' }}>
                            <div style={{ height: '22px', borderBottom: '1px solid black', marginBottom: '3px' }} />
                            <span style={{ fontSize: '8px', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Principal</span>
                          </div>
                        </div>
                        {/* QR + Disclaimer */}
                        <div className="w-full flex items-center justify-between" style={{ marginTop: '6px', paddingTop: '5px', borderTop: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <div style={{ width: '38px', height: '38px', border: '1px solid #d1d5db', padding: '2px', background: '#fff' }}>
                              <img src={qrCodeDataUrl} alt="QR" style={{ width: '100%', height: '100%' }} />
                            </div>
                            <span style={{ fontSize: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Scan to Verify</span>
                          </div>
                          <p style={{ fontSize: '6.5px', color: '#9ca3af', textAlign: 'right', lineHeight: '1.4', fontStyle: 'italic', maxWidth: '72%' }}>This document is computer-generated by Evershaheen Academy. For authenticity, scan the QR code.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── 4.5 PERFORMANCE CARD PREVIEW ──────────────────────── */}
                {docType === 'performance_card' && selectedStudent && (() => {
                  const academicPct = cumulativePercentage;
                  const academicGrade = getOverallGrade(academicPct);
                  const attendanceVal = "N/A";
                  const sportsGrade = "N/A";
                  const conductGrade = "N/A";
                  const houseColor = selectedStudent.house?.color || "#1e3a8a";
                  const houseName = selectedStudent.house?.name || "Unassigned House";

                  return (
                    <div
                      data-document-page
                      className="w-[595px] min-h-[842px] bg-white flex flex-col items-start relative overflow-hidden shrink-0"
                      style={{ fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                    >
                      <div className="absolute inset-0 border-[12px] border-[#1e3a8a] pointer-events-none z-20" />
                      <div className="absolute inset-0 border-[16px] border-white pointer-events-none z-20" />

                      {/* Watermark */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none z-10">
                        <div className="w-[300px] h-[300px]">
                          <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full" />
                        </div>
                      </div>

                      <div className="w-full px-10 pt-8 flex flex-col h-full relative z-10">
                        {/* Header Letterhead */}
                        <div className="w-full flex items-center justify-between border-b-[3px] border-[#1e3a8a] pb-4">
                          <div className="flex items-center gap-3">
                            <AcademyLogo className="w-14 h-14 text-[#1e3a8a] shrink-0" />
                            <div>
                              <h2 className="text-[20px] font-black uppercase text-[#1e3a8a] leading-none tracking-tight">EVERSHAHEEN ACADEMY</h2>
                              <p className="text-[8.5px] text-gray-500 uppercase tracking-[0.2em] font-black mt-1">We Make your Children More Valuable</p>
                              <p className="text-[7.5px] text-gray-600 mt-0.5">Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony</p>
                            </div>
                          </div>
                          <div className="text-right text-[8px] text-gray-500 font-bold space-y-0.5">
                            <p>📱 Boys: 0328-4010522</p>
                            <p>📱 Girls: 0324-8985526</p>
                            <p className="mt-1.5 text-indigo-600 font-mono">Date: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>

                        {/* Document Title */}
                        <div className="w-full text-center mt-4 mb-4 relative">
                          <div className="absolute inset-x-10 top-1/2 h-px bg-gray-200 -z-10" />
                          <h1 className="text-[26px] font-black uppercase tracking-[0.15em] text-[#0f172a] leading-tight bg-white px-6 inline-block">
                            STUDENT<br/>PERFORMANCE &amp;<br/>CONDUCT CARD
                          </h1>
                        </div>

                        {/* Profile Info Strip */}
                        <div className="w-full border border-gray-200 rounded-xl p-3 bg-gray-50/80 flex items-center gap-4 shadow-sm relative z-10">
                          <div className="w-16 h-16 rounded-lg border-2 border-[#1e3a8a] overflow-hidden shadow flex-shrink-0 bg-white">
                            <img
                              src={profilePictureDataUrl || getAvatarDataUrl(selectedStudent.firstName, selectedStudent.lastName, '#1e3a8a')}
                              alt={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex flex-wrap text-[11px] leading-tight text-gray-800 flex-1 justify-between">
                            <div className="block w-[45%] mb-3">
                              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Student Name</span>
                              <span className="font-black text-gray-900 text-[13px] block">{selectedStudent.firstName} {selectedStudent.lastName}</span>
                            </div>
                            <div className="block w-[45%] mb-3">
                              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Roll No / Reg ID</span>
                              <span className="font-bold text-gray-900 text-[12px] block">{selectedStudent.rollNumber || '—'} / <span className="font-mono text-[#1e3a8a]">{selectedStudent.registrationNumber}</span></span>
                            </div>
                            <div className="block w-[45%] mb-3">
                              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Class Section</span>
                              <span className="font-bold text-gray-900 text-[12px] block">{selectedStudent.class?.name || 'Scholar Group'}</span>
                            </div>
                            <div className="block w-[45%] mb-3">
                              <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">House Affiliation</span>
                              <span className="text-white font-black text-[9px] uppercase rounded px-1.5 py-0.5 shadow-sm inline-block mt-1" style={{ backgroundColor: houseColor }}>
                                {houseName}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Performance Metric Cards */}
                        <div className="w-full flex justify-between mt-3 z-10 relative">
                          {[
                            {label:'Academic Avg',value:`${academicPct}%`,sub:`Grade: ${academicGrade}`,bg:'bg-blue-50/80',border:'border-blue-200',color:'text-blue-900'},
                            {label:'Attendance',value:attendanceVal,sub:'Status: Regular',bg:'bg-emerald-50/80',border:'border-emerald-200',color:'text-emerald-900'},
                            {label:'Sports & Phys',value:sportsGrade,sub:'Grade: Elite',bg:'bg-amber-50/80',border:'border-amber-200',color:'text-amber-900'},
                            {label:'Conduct',value:conductGrade,sub:'Exemplary',bg:'bg-rose-50/80',border:'border-rose-200',color:'text-rose-900'},
                          ].map((m,i) => (
                            <div key={i} className={`border ${m.border} rounded-lg p-2 ${m.bg} block text-center shadow-sm w-[110px] min-w-[110px] flex-shrink-0`}>
                              <div className="text-[8px] uppercase font-black text-gray-500 tracking-widest block">{m.label}</div>
                              <div className={`text-[16px] font-black ${m.color} mt-1 mb-1 leading-none block`}>{m.value}</div>
                              <div className="text-[8px] font-bold text-gray-600 block">{m.sub}</div>
                            </div>
                          ))}
                        </div>

                        {/* Evaluation Table */}
                        <div className="w-full mt-4 border rounded-lg overflow-hidden shadow-sm border-gray-300 relative z-10">
                          <table className="w-full text-left border-collapse border border-gray-300" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                              <tr className="bg-[#1e3a8a] text-white border-b border-gray-300 text-[8px] uppercase font-black tracking-widest">
                                <th className="px-3 py-2 border-r border-gray-300">Evaluation Metric</th>
                                <th className="px-3 py-2 border-r border-gray-300">Score</th>
                                <th className="px-3 py-2 border-r border-gray-300">Band</th>
                                <th className="px-3 py-2 text-right">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 text-[10px] text-gray-800 bg-white">
                              {[
                                ['Cognitive & Academic Mastery',`${academicPct}%`,academicGrade,'Excellent curriculum understanding'],
                                ['Punctuality & Presence Quotient',attendanceVal,'A+','Consistently punctual and focused'],
                                ['Extracurricular & Sports Participation','Active','A','Keen interest in sports & athletics'],
                                ['Behavioral Standard & Respect Quotient','Excellent','A+','Demonstrates leadership & respect'],
                              ].map((row,i) => (
                                <tr key={i} className="hover:bg-blue-50 transition-colors">
                                  <td className="px-3 py-2 font-bold text-gray-900 border-r-2 border-gray-300">{row[0]}</td>
                                  <td className="px-3 py-2 font-black text-[#1e3a8a] border-r-2 border-gray-300">{row[1]}</td>
                                  <td className="px-3 py-2 font-mono font-black border-r-2 border-gray-300">{row[2]}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-600">{row[3]}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Remarks */}
                        <div className="w-full mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50/80 shadow-sm relative z-10">
                          <div className="text-[9px] font-black text-[#1e3a8a] uppercase tracking-widest mb-1.5 border-b border-gray-200 pb-0.5">Class Advisor Final Comments</div>
                          <div className="text-[11px] text-gray-700 leading-relaxed font-medium">
                            <strong className="text-gray-900">{selectedStudent.firstName}</strong> exhibits exceptional dedication to academic pursuits and serves as a stellar role model for fellow peers. Their conduct is exemplary, displaying superior manners and responsibility in all academy environments. Highly recommended for continued advanced placements.
                          </div>
                        </div>

                        <div className="flex-1 min-h-[16px]" />
                        {/* QR + Signature Footer */}
                        <div className="w-full flex justify-between items-end mb-4 relative z-10">
                          {/* Secure QR */}
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="w-16 h-16 border-2 border-[#1e3a8a]/30 p-1.5 rounded-lg bg-white shadow-sm flex-shrink-0">
                              <img
                                src={qrCodeDataUrl}
                                alt="QR Verify"
                                className="w-full h-full"
                              />
                            </div>
                            <span className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Scan to Verify</span>
                          </div>
                          {/* Signature block */}
                          <div className="block text-center">
                            <div className="w-44 border-b border-gray-400 pb-2 mx-auto mb-2">
                              <span className="font-black text-[12px] text-gray-900 block">Principal</span>
                            </div>
                            <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest block">Academy Principal</span>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}

                {/* ─── 5. REPORTS DASHBOARD PREVIEW ───────────────────────── */}
                {docType === 'reports' && (
                  <div 
                    data-document-page
                    className="w-[595px] min-h-[842px] h-auto bg-white flex flex-col items-start relative overflow-hidden shrink-0"
                    style={{ fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                  >
                    <div className="absolute inset-0 border-[8px] border-[#1e3a8a] pointer-events-none z-20" />
                    
                    <div className="w-full px-10 pt-8 flex flex-col h-full relative z-10">
                      {/* Header Letterhead */}
                      <div className="w-full flex items-center justify-between border-b-[3px] border-[#1e3a8a] pb-4">
                        <div className="flex items-center gap-3">
                          <AcademyLogo className="w-14 h-14 text-[#1e3a8a] shrink-0" />
                          <div>
                            <h2 className="text-[20px] font-black uppercase text-[#1e3a8a] leading-none tracking-tight">EVERSHAHEEN ACADEMY</h2>
                            <p className="text-[8.5px] text-gray-500 uppercase tracking-[0.2em] font-black mt-1">We Make your Children More Valuable</p>
                            <p className="text-[7.5px] text-gray-600 mt-0.5">Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony</p>
                          </div>
                        </div>
                        <div className="text-right text-[8px] text-gray-500 font-bold space-y-0.5">
                          <p>📱 Boys: 0328-4010522</p>
                          <p>📱 Girls: 0324-8985526</p>
                        </div>
                      </div>

                      {/* Report Category */}
                      <div className="w-full flex justify-between items-center mt-3 text-[9px] font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded border border-gray-200 shadow-sm">
                        <span>Serial No: <strong className="text-[#1e3a8a] font-black">ESA/REP/{reportSubtype.toUpperCase()}/{new Date().getFullYear()}</strong></span>
                        <span>Run Date: <strong className="text-gray-800">{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></span>
                      </div>

                      <div className="w-full text-center mt-3 mb-1">
                        <h1 className="text-[16px] font-black uppercase tracking-[0.2em] text-[#1e3a8a] border-b border-[#1e3a8a] inline-block pb-0.5">
                          {reportSubtype === 'fees' ? 'Fees Outstanding Deficit Report' : reportSubtype === 'attendance' ? 'Campus Attendance & Presence Report' : 'Academic Grade Distribution Report'}
                        </h1>
                      </div>

                      {/* Deficit Fees Report */}
                      {reportSubtype === 'fees' && (() => {
                        const totalOutstandingVal = liveReport?.totalOutstanding !== undefined
                          ? `PKR ${liveReport.totalOutstanding.toLocaleString('en-PK')}`
                          : "PKR 0";
                        const totalCollectedVal = liveReport?.totalCollected !== undefined
                          ? `PKR ${liveReport.totalCollected.toLocaleString('en-PK')}`
                          : "PKR 0";
                        const overdueCountVal = liveReport?.overdueStudentsCount !== undefined
                          ? `${liveReport.overdueStudentsCount} Accounts`
                          : "0 Accounts";

                        const overdueList = (liveReport?.overdueStudentsList as OverdueItem[] | undefined) || [];

                        return (
                          <div className="w-full space-y-4 mt-3 flex-1">
                            {/* Summary Block */}
                            <div className="flex flex-wrap justify-between gap-y-2">
                              <div className="border rounded-lg p-2.5 bg-indigo-50/50 border-indigo-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-indigo-950 tracking-widest">Total Outstanding</span>
                                <h3 className="text-[16px] font-black text-indigo-900 mt-0.5">{totalOutstandingVal}</h3>
                              </div>
                              <div className="border rounded-lg p-2.5 bg-emerald-50/50 border-emerald-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-emerald-950 tracking-widest">Total Collected</span>
                                <h3 className="text-[16px] font-black text-emerald-900 mt-0.5">{totalCollectedVal}</h3>
                              </div>
                              <div className="border rounded-lg p-2.5 bg-rose-50/50 border-rose-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-rose-950 tracking-widest">Overdue Students</span>
                                <h3 className="text-[16px] font-black text-rose-900 mt-0.5">{overdueCountVal}</h3>
                              </div>
                            </div>

                            {/* Deficit Table */}
                            <div className="border rounded-lg overflow-hidden border-gray-300 shadow-sm">
                              <table className="w-full text-left border-collapse border border-gray-300" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr className="bg-[#1e3a8a] text-white border-b border-gray-300 text-[8px] uppercase font-black tracking-widest">
                                    <th className="px-3 py-2 border-r border-gray-300">Student Name</th>
                                    <th className="px-3 py-2 border-r border-gray-300">Class Section</th>
                                    <th className="px-3 py-2 border-r border-gray-300">Roll / Registration</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-right">Deficit Amount</th>
                                    <th className="px-3 py-2 text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-[10px] text-gray-800 bg-white">
                                  {overdueList.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-4 text-center text-gray-400 font-bold border border-gray-300 bg-gray-50">
                                        No overdue accounts found in this report.
                                      </td>
                                    </tr>
                                  ) : (
                                    overdueList.map((item: OverdueItem, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 py-1.5 font-bold text-gray-900 border-r-2 border-gray-300">{item.name}</td>
                                        <td className="px-3 py-1.5 font-bold text-gray-700 border-r-2 border-gray-300">{item.classSection}</td>
                                        <td className="px-3 py-1.5 font-bold text-gray-600 border-r-2 border-gray-300 font-mono">
                                          {item.rollNumber ? `${item.rollNumber} / ` : ''}{item.registrationNumber}
                                        </td>
                                        <td className="px-3 py-1.5 font-black text-[#1e3a8a] border-r-2 border-gray-300 text-right">PKR {Number(item.dueAmount).toLocaleString('en-PK')}</td>
                                        <td className="px-3 py-1.5 text-right font-black">
                                          <span className="inline-block px-1.5 py-0.5 rounded text-[8px] tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                                            OVERDUE
                                          </span>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Attendance Report */}
                      {reportSubtype === 'attendance' && (() => {
                        const avgPresenceVal = liveReport?.averagePresence !== undefined
                          ? `${liveReport.averagePresence} %`
                          : "0 %";
                        const markedSectionsVal = liveReport?.totalClassesMarked !== undefined
                          ? `${liveReport.totalClassesMarked} Sections`
                          : "0 Sections";
                        const severeCountVal = liveReport?.severeAbsenteesCount !== undefined
                          ? `${liveReport.severeAbsenteesCount} Students`
                          : "0 Students";

                        const classList = (liveReport?.classSectionsList as AttendanceSection[] | undefined) || [];

                        return (
                          <div className="w-full space-y-4 mt-3 flex-1">
                            {/* Summary Block */}
                            <div className="flex flex-wrap justify-between gap-y-2">
                              <div className="border rounded-lg p-2.5 bg-indigo-50/50 border-indigo-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-indigo-950 tracking-widest">Average Presence</span>
                                <h3 className="text-[16px] font-black text-indigo-900 mt-0.5">{avgPresenceVal}</h3>
                              </div>
                              <div className="border rounded-lg p-2.5 bg-emerald-50/50 border-emerald-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-emerald-950 tracking-widest">Classes Marked</span>
                                <h3 className="text-[16px] font-black text-emerald-900 mt-0.5">{markedSectionsVal}</h3>
                              </div>
                              <div className="border rounded-lg p-2.5 bg-rose-50/50 border-rose-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-rose-950 tracking-widest">Severe Absentees</span>
                                <h3 className="text-[16px] font-black text-rose-900 mt-0.5">{severeCountVal}</h3>
                              </div>
                            </div>

                            {/* Attendance Table */}
                            <div className="border rounded-lg overflow-hidden border-gray-300 shadow-sm">
                              <table className="w-full text-left border-collapse border border-gray-300" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr className="bg-[#1e3a8a] text-white border-b border-gray-300 text-[8px] uppercase font-black tracking-widest">
                                    <th className="px-3 py-2 border-r border-gray-300">Class Section</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-center">Total Students</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-center">Present Today</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-center">Absent Today</th>
                                    <th className="px-3 py-2 text-right">Attendance Rate</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-[10px] text-gray-800 bg-white">
                                  {classList.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-4 text-center text-gray-400 font-bold border border-gray-300 bg-gray-50">
                                        No attendance data available in this report.
                                      </td>
                                    </tr>
                                  ) : (
                                    classList.map((item: AttendanceSection, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 py-1.5 font-bold text-gray-900 border-r-2 border-gray-300">{item.classSection}</td>
                                        <td className="px-3 py-1.5 font-bold text-gray-700 border-r-2 border-gray-300 text-center">{item.totalStudents}</td>
                                        <td className="px-3 py-1.5 font-black text-emerald-700 border-r-2 border-gray-300 text-center">{item.presentToday}</td>
                                        <td className="px-3 py-1.5 font-black text-rose-700 border-r-2 border-gray-300 text-center">{item.absentToday}</td>
                                        <td className="px-3 py-1.5 text-right font-black text-[#1e3a8a]">{item.attendanceRate} %</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Performance Report */}
                      {reportSubtype === 'performance' && (() => {
                        const avgPctVal = liveReport?.averagePercentage !== undefined
                          ? `${liveReport.averagePercentage} %`
                          : "0 %";
                        const topClassVal = liveReport?.topPerformingClass || "None";
                        const strugglingCountVal = liveReport?.strugglingStudentsCount !== undefined
                          ? `${liveReport.strugglingStudentsCount} Students`
                          : "0 Students";

                        const classList = (liveReport?.classSectionsList as PerformanceSection[] | undefined) || [];

                        return (
                          <div className="w-full space-y-4 mt-3 flex-1">
                            {/* Summary Block */}
                            <div className="flex flex-wrap justify-between gap-y-2">
                              <div className="border rounded-lg p-2.5 bg-indigo-50/50 border-indigo-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-indigo-950 tracking-widest">Average Percentage</span>
                                <h3 className="text-[16px] font-black text-indigo-900 mt-0.5">{avgPctVal}</h3>
                              </div>
                              <div className="border rounded-lg p-2.5 bg-emerald-50/50 border-emerald-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-emerald-950 tracking-widest">Top Class</span>
                                <h3 className="text-[16px] font-black text-emerald-900 mt-0.5 break-words" title={topClassVal}>{topClassVal}</h3>
                              </div>
                              <div className="border rounded-lg p-2.5 bg-rose-50/50 border-rose-200 shadow-sm w-[32%]">
                                <span className="text-[8px] uppercase font-black text-rose-950 tracking-widest">Struggling Accounts</span>
                                <h3 className="text-[16px] font-black text-rose-900 mt-0.5">{strugglingCountVal}</h3>
                              </div>
                            </div>

                            {/* Performance Table */}
                            <div className="border rounded-lg overflow-hidden border-gray-300 shadow-sm">
                              <table className="w-full text-left border-collapse border border-gray-300" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr className="bg-[#1e3a8a] text-white border-b border-gray-300 text-[8px] uppercase font-black tracking-widest">
                                    <th className="px-3 py-2 border-r border-gray-300">Class Section</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-center">Run Exams</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-center">Highest Score</th>
                                    <th className="px-3 py-2 border-r border-gray-300 text-center">Class Average</th>
                                    <th className="px-3 py-2 text-right">Class Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-[10px] text-gray-800 bg-white">
                                  {classList.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-4 text-center text-gray-400 font-bold border border-gray-300 bg-gray-50">
                                        No performance data available in this report.
                                      </td>
                                    </tr>
                                  ) : (
                                    classList.map((item: PerformanceSection, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-3 py-1.5 font-bold text-gray-900 border-r-2 border-gray-300">{item.classSection}</td>
                                        <td className="px-3 py-1.5 font-bold text-gray-700 border-r-2 border-gray-300 text-center">{item.runExams}</td>
                                        <td className="px-3 py-1.5 font-black text-[#1e3a8a] border-r-2 border-gray-300 text-center">{item.highestScore}</td>
                                        <td className="px-3 py-1.5 font-black text-emerald-700 border-r-2 border-gray-300 text-center">{item.classAverage} %</td>
                                        <td className="px-3 py-1.5 text-right font-black">
                                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider ${
                                            item.classStatus === 'EXCELLENT'
                                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                              : item.classStatus === 'GOOD'
                                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                                          }`}>
                                            {item.classStatus}
                                          </span>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex-1 min-h-[16px]" />
                      {/* Bottom stamp with Secure QR */}
                      <div className="w-full flex justify-between items-end mb-4 relative z-10">
                        <div className="text-[8px] text-gray-500 max-w-[200px] leading-relaxed">
                          <p className="font-black text-gray-600 uppercase tracking-widest mb-0.5 border-b border-gray-300 pb-0.5 inline-block">Evershine Reports Engine</p>
                          <p>Automated document generated securely from live academic database records. Not valid without official seal.</p>
                        </div>

                        {/* Secure QR */}
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="w-16 h-16 border border-[#1e3a8a]/30 p-1 rounded bg-white shadow-sm flex-shrink-0">
                            <img
                              src={qrCodeDataUrl}
                              alt="QR Verify"
                              className="w-full h-full"
                            />
                          </div>
                          <span className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Scan to Verify</span>
                        </div>

                        <div className="flex flex-col items-center">
                          <div className="w-40 border-b border-gray-400 pb-1 flex items-end justify-center h-10">
                            <span className="font-serif italic text-[11px] text-gray-400">System Audit Signed</span>
                          </div>
                          <span className="text-[9px] uppercase font-bold text-gray-600 mt-1 tracking-widest">Superintendent Sign</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── TEACHER ID CARD PREVIEW (CR80 FORMAT 680×428) ─── */}
                {docType === 'teacher_id_card' && selectedTeacher && (
                  <div data-document-page className="flex flex-col gap-8 p-0 bg-transparent items-center" style={{ width: '680px' }}>
                    {/* Front Face */}
                    <div
                      id="teacher-card-template-front"
                      className="w-[680px] h-[428px] bg-white shrink-0 rounded-[20px] shadow-lg relative flex flex-row border-[3px] border-[#cbd5e1] overflow-hidden"
                      style={{ width: '680px', height: '428px', fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                      data-card="front"
                      data-pdf-width="680"
                      data-pdf-height="428"
                      data-pdf-physical-width="85.6"
                      data-pdf-physical-height="54"
                      data-pdf-physical-unit="mm"
                    >
                      {/* Left Sidebar Accent */}
                      <div className="w-[18px] h-[428px] bg-[#0f172a] shrink-0 z-20 relative" />
                      
                      {/* Main Front Content */}
                      <div className="w-[452px] flex flex-col pt-7 pb-6 pl-8 pr-6 relative z-10 h-[428px] bg-[#f8fafc]">
                        
                        {/* Header: Logo and Institute Name */}
                        <div className="flex items-center border-b-2 border-[#cbd5e1] pb-4 mb-5 relative z-10 shrink-0">
                          <div className="w-[54px] h-[54px] flex items-center justify-center shrink-0 bg-white rounded-xl shadow-sm border border-[#e2e8f0] p-1.5 mr-4">
                            <AcademyLogo className="w-full h-full text-[#0f172a]" />
                          </div>
                          <div className="flex flex-col w-[330px]">
                            <h2 className="text-[24px] font-black tracking-tight text-[#0f172a] leading-[1.2] m-0 uppercase whitespace-nowrap">Evershaheen Academy</h2>
                            <span className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#475569] leading-[1.2] mt-1 block whitespace-nowrap">Staff Identity Card</span>
                          </div>
                        </div>

                        {/* Details Table (Html2canvas Safe) */}
                        <div className="flex flex-col gap-[12px] text-[14px] font-bold text-[#1f2937] relative z-10 flex-1 w-full">
                          <div className="flex items-start">
                             <div className="w-[110px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Name</div>
                             <div className="text-[#94a3b8] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[270px] break-words">{selectedTeacher.firstName} {selectedTeacher.lastName}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[110px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Designation</div>
                             <div className="text-[#94a3b8] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[270px] break-words">{selectedTeacher.designation || 'Staff'}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[110px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Employee ID</div>
                             <div className="text-[#94a3b8] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[270px] break-words">{selectedTeacher.employeeId}</div>
                          </div>
                          <div className="flex items-start">
                             <div className="w-[110px] text-[#6b7280] uppercase tracking-wider text-[11px] font-bold leading-[1.2] pt-[2px]">Contact</div>
                             <div className="text-[#94a3b8] font-normal mr-3 leading-[1.2] pt-[2px]">:</div>
                             <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-[270px] break-words">{selectedTeacher.phoneNumber || 'N/A'}</div>
                          </div>
                        </div>

                        {/* Footer Functional */}
                        <div className="mt-auto flex justify-between items-end relative z-10 w-full shrink-0">
                            <div className="block">
                               <div className="text-[10px] text-[#6b7280] font-bold leading-[1.2] mb-1 block">Issued:</div>
                               <div className="text-[13px] font-black text-[#0f172a] leading-[1.2] whitespace-nowrap block">{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                            </div>
                            <div className="block text-center">
                                <div className="w-[130px] border-b-[2px] border-[#0f172a] pb-2 mx-auto mb-2">
                                   <span className="font-serif italic text-[#0f172a] text-[13px] leading-[1.2] block">System Authorized</span>
                                </div>
                                <span className="text-[9px] uppercase font-bold text-[#6b7280] tracking-widest leading-[1.2] block">Director / Principal</span>
                            </div>
                        </div>
                      </div>

                      {/* Right Panel Avatar */}
                      <div className="w-[210px] bg-[#0f172a] shrink-0 relative flex flex-col items-center justify-center z-20">
                         {/* Avatar Box */}
                         <div className="relative z-10 flex flex-col items-center w-full px-6">
                           <div className="w-[150px] h-[190px] rounded-[14px] p-[6px] bg-[#334155] border border-[#475569] shadow-xl relative flex items-center justify-center">
                            <div className="w-full h-full rounded-[8px] overflow-hidden bg-[#f8fafc] border-[3px] border-white relative shadow-inner">
                              <img
                                src={teacherProfileDataUrl || getAvatarDataUrl(selectedTeacher.firstName, selectedTeacher.lastName, '#0f172a')}
                                alt={`${selectedTeacher.firstName} ${selectedTeacher.lastName}`}
                                className="w-full h-full object-cover relative z-10"
                                crossOrigin="anonymous"
                              />
                            </div>
                           </div>
                           <div className="mt-6 bg-white text-[#0f172a] px-6 py-2 rounded-full text-[13px] font-black uppercase tracking-widest shadow-lg leading-[1.2] border border-[#e2e8f0]">
                             Staff
                           </div>
                         </div>
                      </div>
                    </div>

                    {/* Back Face */}
                    <div
                      id="teacher-card-template-back"
                      className="w-[680px] h-[428px] bg-white shrink-0 rounded-[20px] shadow-lg relative flex flex-row border-[3px] border-[#cbd5e1] overflow-hidden"
                      style={{ width: '680px', height: '428px', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}
                      data-card="back"
                      data-pdf-width="680"
                      data-pdf-height="428"
                      data-pdf-physical-width="85.6"
                      data-pdf-physical-height="54"
                      data-pdf-physical-unit="mm"
                    >
                      {/* Left Panel Verification Area */}
                      <div className="w-[210px] bg-[#f8fafc] flex flex-col items-center justify-center p-6 relative border-r-2 border-[#e2e8f0] z-20 shrink-0 h-[428px]">
                          {/* Top decorative line */}
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-[#0f172a]" />
                          
                          <div className="w-[130px] h-[130px] bg-white p-2.5 border-[3px] border-[#e2e8f0] rounded-2xl shadow-sm flex items-center justify-center relative mb-5">
                            {qrCodeDataUrl ? (
                              <img 
                                src={qrCodeDataUrl}
                                alt="Verification QR Code"
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-50 flex items-center justify-center rounded-xl border border-dashed border-[#d1d5db]">
                                <span className="text-[10px] text-[#9ca3af] font-medium">Generating...</span>
                              </div>
                            )}
                          </div>
                          <div className="w-[160px] bg-[#0f172a] text-white px-4 py-2.5 rounded-lg text-center shadow-md border border-[#1e293b]">
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase block leading-[1.2]">Scan to Verify</span>
                            <span className="text-[8px] font-medium text-[#94a3b8] mt-1 block opacity-90 leading-[1.2]">Official System Record</span>
                          </div>
                      </div>

                      {/* Content Container */}
                      <div className="w-[470px] flex flex-col py-8 px-8 relative bg-white z-10 h-[428px]">
                         <div className="relative z-10 flex flex-col h-full w-full">
                            
                            {/* Information Table */}
                            <div className="block w-full pt-2">
                                <div className="block w-full mb-6">
                                    <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Campus Allocation</div>
                                    <div className="text-[#0f172a] font-black text-[15px] leading-[1.2] w-full break-words block">{selectedTeacher.campus?.name ?? 'Madina Town Campus'}</div>
                                </div>
                                
                                <div className="flex flex-row w-full gap-[30px] mb-6">
                                    <div className="block w-[160px]">
                                        <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Emergency Contact</div>
                                        <div className="text-[#0f172a] font-black text-[14px] leading-[1.2] w-full block">{selectedTeacher.emergencyContact || '—'}</div>
                                    </div>
                                    <div className="block w-[160px]">
                                        <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">Academy HR Contact</div>
                                        <div className="text-[#0f172a] font-black text-[14px] leading-[1.2] w-full block">0328-4010522</div>
                                    </div>
                                </div>

                                <div className="block w-full">
                                    <div className="text-[#9ca3af] uppercase tracking-wider text-[10px] font-bold leading-[1.2] mb-1.5 block">CNIC / Identity No</div>
                                    <div className="text-[#0f172a] font-bold text-[13px] leading-[1.4] w-full break-words block font-mono">{selectedTeacher.cnic || '—'}</div>
                                </div>
                            </div>
                            
                            {/* Important Note Box */}
                            <div className="mt-auto pt-5 w-full">
                                <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 w-full">
                                    <div className="flex items-center mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#ef4444] mr-2" />
                                        <div className="text-[11px] uppercase font-black tracking-widest text-[#0f172a] leading-[1.2]">Important Notice</div>
                                    </div>
                                    <p className="text-[10px] text-[#4b5563] leading-[1.5] font-medium m-0 p-0 w-full">
                                        This identity card is the property of <strong className="text-[#1f2937]">Evershaheen Academy</strong>. It must be worn and visible at all times while on campus. If found by a third party, please return to the administration immediately.
                                    </p>
                                </div>
                            </div>

                         </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── EXPERIENCE LETTER PREVIEW ─── */}
                {docType === 'teacher_experience' && selectedTeacher && (
                  <div 
                    data-document-page 
                    className="w-[595px] min-h-[842px] h-auto bg-white flex flex-col items-start relative overflow-visible shrink-0"
                    style={{ fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                  >
                    <div className="absolute inset-0 border-[12px] border-[#065F46] pointer-events-none z-20" />
                    <div className="absolute inset-0 border-[16px] border-white pointer-events-none z-20" />

                    {/* Watermark */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none z-10">
                      <div className="w-[300px] h-[300px]">
                        <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full" />
                      </div>
                    </div>

                    <div className="w-full px-10 pt-8 flex flex-col h-full relative z-10">
                      {/* Header Letterhead */}
                      <div className="w-full flex items-center justify-between border-b-[3px] border-[#065F46] pb-4">
                        <div className="flex items-center gap-3">
                          <AcademyLogo className="w-14 h-14 text-[#065F46] shrink-0" />
                          <div>
                            <h2 className="text-[20px] font-black uppercase text-[#065F46] leading-none tracking-tight">EVERSHAHEEN ACADEMY</h2>
                            <p className="text-[8.5px] text-gray-500 uppercase tracking-[0.2em] font-black mt-1">We Make your Children More Valuable</p>
                            <p className="text-[7.5px] text-gray-600 mt-0.5">Madina Town near Mandiala Warraich Road, Near Labor Gulshan Colony</p>
                          </div>
                        </div>
                        <div className="text-right text-[8px] text-gray-500 font-bold space-y-0.5">
                          <p>📱 Boys: 0328-4010522</p>
                          <p>📱 Girls: 0324-8985526</p>
                          <p className="mt-1.5 text-emerald-700 font-mono">Date: {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>

                      {/* Metadata Serial No */}
                      <div className="w-full flex justify-between items-center mt-3 text-[9px] font-bold text-gray-500">
                        <span>Ref No: ESA/EXP/{selectedTeacher.employeeId}/{new Date().getFullYear()}</span>
                      </div>

                      {/* Document Title */}
                      <div className="w-full flex items-center mt-4 mb-6 px-10">
                        <div className="flex-1 h-px bg-gray-300" />
                        <h1 className="text-[24px] font-black uppercase tracking-[0.15em] text-[#0f172a] px-6 text-center leading-[1.1]">
                          EXPERIENCE<br/>CERTIFICATE
                        </h1>
                        <div className="flex-1 h-px bg-gray-300" />
                      </div>

                      {/* Teacher quick-reference bar */}
                      <div className="w-full bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl p-3 flex items-center gap-4 shadow-sm relative z-10 mb-4">
                        {/* Teacher Photo placeholder / Avatar */}
                        <div className="w-16 h-16 rounded-lg border-2 border-[#065F46] overflow-hidden shadow flex-shrink-0 bg-white flex items-center justify-center">
                          <img
                            src={getAvatarDataUrl(selectedTeacher.firstName, selectedTeacher.lastName, '#065F46')}
                            alt={`${selectedTeacher.firstName} ${selectedTeacher.lastName}`}
                            className="w-full h-full"
                            style={{ objectFit: 'cover' }}
                          />
                        </div>
                        {/* Meta */}
                        <div className="flex flex-wrap text-[11px] leading-tight text-gray-800 flex-1 justify-between">
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Staff Name</span>
                            <span className="font-black text-gray-900 text-[13px] block">{selectedTeacher.firstName} {selectedTeacher.lastName}</span>
                          </div>
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Employee ID</span>
                            <span className="font-black text-[#065F46] text-[13px] block font-mono">{selectedTeacher.employeeId}</span>
                          </div>
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Designation</span>
                            <span className="font-black text-gray-900 text-[12px] block">{selectedTeacher.designation}</span>
                          </div>
                          <div className="block w-[45%] mb-3">
                            <span className="font-bold text-gray-400 uppercase text-[8px] tracking-wider mb-1 block">Department</span>
                            <span className="font-bold text-gray-900 text-[12px] block">{selectedTeacher.specialization ?? 'Academic'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="w-full text-[12px] text-gray-800 space-y-4 leading-relaxed text-left relative z-10 font-medium">
                        <p>
                          This is to certify that <strong className="font-black text-[#065F46] text-[13px] border-b border-[#065F46]/30">{selectedTeacher.firstName} {selectedTeacher.lastName}</strong>, holding Employee ID <strong className="font-black text-gray-900">{selectedTeacher.employeeId}</strong>, has served as <strong className="font-black text-gray-900">{selectedTeacher.designation}</strong> in the <strong className="font-black text-gray-900">{selectedTeacher.specialization ?? 'Academic'}</strong> Department at Evershaheen Academy, {selectedTeacher.campus?.name ?? 'Madina Town Campus'}, since <strong className="font-black text-gray-900">{selectedTeacher.joiningDate ? new Date(selectedTeacher.joiningDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</strong>
                          {expEndDate ? ` to ${new Date(expEndDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}` : ' and is currently serving in this role'}.
                        </p>
                        <p>
                          During this tenure, <strong className="font-black text-gray-900">{selectedTeacher.firstName}</strong> has performed the following responsibilities with dedication and professionalism:
                        </p>
                        <div className="pl-4 space-y-2">
                          {expResponsibilities.split('\n').filter(r => r.trim()).slice(0, 6).map((r, i) => (
                            <p key={i} className="text-[11px] flex items-start gap-2">
                              <span className="text-[#065F46] mt-0.5 font-bold">•</span>
                              <span className="flex-1">{r.trim()}</span>
                            </p>
                          ))}
                        </div>
                        <p>
                          <strong className="font-black text-gray-900">{selectedTeacher.firstName} {selectedTeacher.lastName}</strong> has demonstrated excellent professional conduct, punctuality, and commitment throughout the period of service. We wish them the very best in all future endeavors.
                        </p>
                      </div>
                      
                      <div className="flex-1 min-h-[16px]" />
                      <p className="text-[9px] text-gray-400 text-center mb-6 font-bold uppercase tracking-widest">
                          This certificate is issued on official request and is valid for verification purposes only.
                      </p>

                      {/* Verification Block */}
                      <div className="w-full flex justify-between items-end mb-4 relative z-10">
                        {/* HR block */}
                        <div className="block text-center">
                          <div className="w-32 border-b border-gray-400 pb-2 mx-auto mb-2">
                            <span className="font-black text-[12px] text-gray-900 block">HR Administrator</span>
                          </div>
                          <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest block">Evershaheen Academy</span>
                        </div>

                        {/* Seal / QR placeholder */}
                        <div className="flex flex-col items-center gap-1.5">
                           <div className="w-16 h-16 rounded-full border-[3px] border-[#065F46] flex flex-col items-center justify-center bg-emerald-50 shrink-0">
                             <div className="text-[7px] font-black text-[#065F46] text-center leading-[1.2]">OFFICIAL<br />SEAL</div>
                           </div>
                        </div>

                        {/* Signature block */}
                        <div className="block text-center">
                          <div className="w-32 border-b border-gray-400 pb-2 mx-auto mb-2">
                            <span className="font-black text-[12px] text-gray-900 block">{expPrincipalName}</span>
                          </div>
                          <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest block">{expPrincipalTitle}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── STUDENT PROFILE PREVIEW ───────────────────────── */}
                {docType === 'student_profile' && selectedStudent && (
                  <div
                    data-document-page
                    className="w-[595px] bg-white flex flex-col relative shrink-0 overflow-hidden"
                    style={{
                      fontFamily: 'Arial, sans-serif',
                      color: '#111827',
                      boxSizing: 'border-box',
                      height: '842px',
                      border: '4px solid black',
                      outline: '1px solid black',
                      outlineOffset: '-10px',
                    }}
                  >

                    <div className="w-full px-7 pt-4 pb-6 flex flex-col h-full relative z-10" style={{ gap: '7px' }}>
                      {/* Header */}
                      <div className="w-full flex items-center justify-between">
                        <div className="w-16 h-16 shrink-0">
                          <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full text-black" />
                        </div>
                        <div className="flex-1 text-center">
                          <h1 className="text-[18px] font-black uppercase tracking-wider text-black leading-tight mb-1.5">EVERSHAHEEN ACADEMY</h1>
                          <div className="w-56 h-[2px] bg-black mx-auto"></div>
                          <p className="text-[8px] font-bold tracking-widest mt-1.5 uppercase text-gray-600">Pakistan Education System</p>
                          <div className="mt-1 text-[11px] font-black uppercase border border-black inline-block px-3 py-0.5 bg-gray-100">Admission / Student Profile</div>
                        </div>
                        <div className="w-20 h-24 shrink-0 border-2 border-black p-0.5 flex items-center justify-center bg-gray-50">
                          {profilePictureDataUrl ? (
                            <img src={profilePictureDataUrl} alt="Photo" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[8px] text-gray-400 font-bold uppercase text-center leading-tight">Passport<br/>Photo</span>
                          )}
                        </div>
                      </div>

                      <div className="w-full border-2 border-black bg-white">
                        <div className="bg-gray-100 border-b-2 border-black px-2 py-0.5 text-[10.5px] font-black uppercase text-center tracking-wide">Student Information</div>
                        <table className="w-full text-left text-[10px]" style={{ borderCollapse: 'collapse' }}>
                          <tbody>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Registration No:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-1.5 font-mono font-black text-blue-900">{selectedStudent.registrationNumber}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Roll No:</td>
                              <td className="w-[22%] px-2 py-1.5 font-bold">{selectedStudent.rollNumber || '—'}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Student Name:</td>
                              <td colSpan={3} className="px-2 py-1.5 font-bold">{selectedStudent.firstName} {selectedStudent.lastName}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Class / Batch:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-1.5 font-bold">{selectedStudent.class?.name || '—'}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Date of Birth:</td>
                              <td className="w-[22%] px-2 py-1.5 font-bold">{selectedStudent.dateOfBirth ? new Date(selectedStudent.dateOfBirth).toLocaleDateString('en-PK') : '—'}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Gender:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-1.5 font-bold">{(selectedStudent as any).gender || '—'}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Blood Group:</td>
                              <td className="w-[22%] px-2 py-1.5 font-bold">{selectedStudent.bloodGroup || '—'}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">CNIC / Form-B:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-1.5 font-mono font-bold">{selectedStudent.cnicBForm}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Religion:</td>
                              <td className="w-[22%] px-2 py-1.5 font-bold">{selectedStudent.religion || 'Islam'}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Present Address:</td>
                              <td colSpan={3} className="px-2 py-1.5 font-bold">{selectedStudent.address || '—'}</td>
                            </tr>
                            <tr>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-1.5 font-bold uppercase">Permanent Address:</td>
                              <td colSpan={3} className="px-2 py-1.5 font-bold">{selectedStudent.permanentAddress || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Main Grid: Guardian Info */}
                      <div className="w-full border-2 border-black mt-2 bg-white">
                        <div className="bg-gray-100 border-b-2 border-black px-2 py-1 text-[12px] font-black uppercase text-center">
                          Parent / Guardian Information
                        </div>
                        <table className="w-full text-left text-[11px] font-medium" style={{ borderCollapse: 'collapse' }}>
                          <tbody>
                            {selectedStudent.guardians && selectedStudent.guardians.length > 0 ? (
                              <>
                                <tr className="border-b border-gray-400">
                                  <td className="w-[28%] border-r border-gray-400 px-2 py-2 font-bold uppercase">Guardian Name:</td>
                                  <td className="w-[22%] border-r border-gray-400 px-2 py-2 font-bold">{selectedStudent.guardians[0].firstName} {selectedStudent.guardians[0].lastName}</td>
                                  <td className="w-[28%] border-r border-gray-400 px-2 py-2 font-bold uppercase">Relationship:</td>
                                  <td className="w-[22%] px-2 py-2 font-bold">{selectedStudent.guardians[0].relationship}</td>
                                </tr>
                                <tr className="border-b border-gray-400">
                                  <td className="w-[28%] border-r border-gray-400 px-2 py-2 font-bold uppercase">Guardian CNIC:</td>
                                  <td className="w-[22%] border-r border-gray-400 px-2 py-2 font-mono font-bold">{selectedStudent.guardians[0].cnic || '—'}</td>
                                  <td className="w-[28%] border-r border-gray-400 px-2 py-2 font-bold uppercase">Contact No:</td>
                                  <td className="w-[22%] px-2 py-2 font-bold font-mono">{selectedStudent.guardians[0].phoneNumber}</td>
                                </tr>
                                <tr>
                                  <td className="w-[28%] border-r border-gray-400 px-2 py-2 font-bold uppercase">Father Occupation:</td>
                                  <td colSpan={3} className="px-2 py-2 font-bold">{selectedStudent.fatherOccupation || '—'}</td>
                                </tr>
                              </>
                            ) : (
                                <tr>
                                  <td colSpan={4} className="px-2 py-4 text-center font-bold text-gray-400">No guardian details on file.</td>
                                </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Declaration */}
                      <div className="w-full border-2 border-black mt-2 bg-white relative mb-1 shrink-0 overflow-hidden flex-1" style={{ minHeight: '150px' }}>
                        <div className="bg-gray-100 border-b-2 border-black px-2 py-1 text-[12px] font-black uppercase text-center">
                          Declaration & Undertaking
                        </div>
                        <div className="px-6 py-3 text-[10.5px] text-justify leading-relaxed font-medium">
                          <p>
                            I solemnly declare that the information provided is accurate. I agree to abide by the rules, regulations, and disciplinary policies of Evershaheen Academy. I commit to maintaining regular attendance and paying all dues on time.
                          </p>
                        </div>
                        
                        {/* Signatures using Absolute Positioning for perfect html2canvas capture */}
                        <div className="absolute bottom-4 left-0 right-0 px-10 flex justify-between items-end w-full">
                          <div className="block text-center" style={{ width: '38%' }}>
                            <div className="w-full border-b-[1.5px] border-black h-6 mb-2"></div>
                            <span className="text-[10px] font-bold uppercase block">Signature of Parent / Guardian</span>
                          </div>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', fontSize: '6px', fontWeight: '900', color: 'rgba(0,0,0,0.3)', textAlign: 'center', lineHeight: '1.3', flexShrink: 0 }}>
                            OFFICIAL<br />SEAL
                          </div>
                          <div className="block text-center" style={{ width: '38%' }}>
                            <div className="w-full border-b-[1.5px] border-black h-6 mb-2"></div>
                            <span className="text-[10px] font-bold uppercase block">Principal / Administrator</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── TEACHER PROFILE PREVIEW ───────────────────────── */}
                {docType === 'teacher_profile' && selectedTeacher && (
                  <div
                    data-document-page
                    className="w-[595px] min-h-[842px] bg-white flex flex-col relative overflow-hidden shrink-0 border border-gray-100"
                    style={{ fontFamily: 'Arial, sans-serif', color: '#111827', boxSizing: 'border-box' }}
                  >
                    {/* Outer Border */}
                    <div className="absolute inset-2 border-[4px] border-[#065F46] pointer-events-none z-20" />
                    <div className="absolute inset-3 border border-[#065F46] pointer-events-none z-20" />

                    <div className="w-full px-8 py-8 flex flex-col h-full relative z-10 space-y-4">
                      {/* Header Section */}
                      <div className="w-full flex items-center justify-between mt-2">
                        <div className="w-24 h-24 shrink-0">
                          <AcademyLogo variant="icon" theme="mono-black" className="w-full h-full text-[#065F46]" />
                        </div>
                        <div className="flex-1 text-center">
                          <h1 className="text-[20px] font-black uppercase tracking-wider text-[#065F46] leading-tight border-b-2 border-[#065F46] inline-block pb-1 px-4">
                            EVERSHAHEEN ACADEMY
                          </h1>
                          <p className="text-[10px] font-bold tracking-widest mt-2 uppercase text-gray-600">Pakistan Education System</p>
                          <div className="mt-2 text-[14px] font-black uppercase border border-[#065F46] inline-block px-4 py-1 bg-emerald-50 text-[#065F46]">
                            Staff / Faculty Profile
                          </div>
                        </div>
                        <div className="w-24 h-32 shrink-0 border-2 border-[#065F46] p-1 flex items-center justify-center bg-gray-50">
                          {teacherProfileDataUrl ? (
                            <img src={teacherProfileDataUrl} alt="Photo" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-gray-400 font-bold uppercase text-center">Photograph<br/>(Passport Size)</span>
                          )}
                        </div>
                      </div>

                      {/* Main Grid: Staff Info */}
                      <div className="w-full border-2 border-[#065F46] mt-2 bg-white">
                        <div className="bg-emerald-50 border-b-2 border-[#065F46] px-2 py-1 text-[12px] font-black uppercase text-center text-[#065F46]">
                          Personal Information
                        </div>
                        <table className="w-full text-left text-[11px] font-medium" style={{ borderCollapse: 'collapse' }}>
                          <tbody>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Employee ID:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-2 font-mono font-black text-blue-900">{selectedTeacher.employeeId}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Joining Date:</td>
                              <td className="w-[22%] px-2 py-2 font-bold">{new Date(selectedTeacher.joiningDate).toLocaleDateString('en-PK')}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Full Name:</td>
                              <td colSpan={3} className="px-2 py-2 font-bold">{selectedTeacher.firstName} {selectedTeacher.lastName}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Gender:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-2 font-bold">{selectedTeacher.gender || '—'}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Date of Birth:</td>
                              <td className="w-[22%] px-2 py-2 font-bold">{selectedTeacher.dateOfBirth ? new Date(selectedTeacher.dateOfBirth).toLocaleDateString('en-PK') : '—'}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">CNIC No:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-2 font-mono font-black">{selectedTeacher.cnic || '—'}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Contact No:</td>
                              <td className="w-[22%] px-2 py-2 font-bold font-mono">{selectedTeacher.phoneNumber}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Email Address:</td>
                              <td colSpan={3} className="px-2 py-2 font-bold">{selectedTeacher.email || '—'}</td>
                            </tr>
                            <tr>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Residential Address:</td>
                              <td colSpan={3} className="px-2 py-2 font-bold">{selectedTeacher.address || '—'} {selectedTeacher.city ? `, ${selectedTeacher.city}` : ''}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Main Grid: Professional Info */}
                      <div className="w-full border-2 border-[#065F46] mt-2 bg-white">
                        <div className="bg-emerald-50 border-b-2 border-[#065F46] px-2 py-1 text-[12px] font-black uppercase text-center text-[#065F46]">
                          Professional Information
                        </div>
                        <table className="w-full text-left text-[11px] font-medium" style={{ borderCollapse: 'collapse' }}>
                          <tbody>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Designation:</td>
                              <td className="w-[22%] border-r border-gray-300 px-2 py-2 font-bold">{selectedTeacher.designation}</td>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Experience:</td>
                              <td className="w-[22%] px-2 py-2 font-bold">{selectedTeacher.experienceYears} Years</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Highest Qualification:</td>
                              <td colSpan={3} className="px-2 py-2 font-bold">{selectedTeacher.qualification}</td>
                            </tr>
                            <tr className="border-b border-gray-300">
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Specialization:</td>
                              <td colSpan={3} className="px-2 py-2 font-bold">{selectedTeacher.specialization || '—'}</td>
                            </tr>
                            <tr>
                              <td className="w-[28%] border-r border-gray-300 px-2 py-2 font-bold uppercase text-[#065F46]">Emergency Contact:</td>
                              <td colSpan={3} className="px-2 py-2 font-bold font-mono">{selectedTeacher.emergencyContact || '—'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Declaration */}
                      <div className="w-full border-2 border-[#065F46] mt-2 bg-white relative mb-1 shrink-0 overflow-hidden flex-1" style={{ minHeight: '150px' }}>
                        <div className="bg-emerald-50 border-b-2 border-[#065F46] px-2 py-1 text-[12px] font-black uppercase text-center text-[#065F46]">
                          Staff Undertaking
                        </div>
                        <div className="p-4 py-3 text-[10px] text-justify leading-relaxed font-medium space-y-1">
                          <p>
                            I declare that the particulars furnished in this profile are true and complete. I shall perform my duties with dedication, maintain confidentiality, and uphold the academic standards of Evershaheen Academy.
                          </p>
                        </div>
                        
                        {/* Signatures using Absolute Positioning for perfect html2canvas capture */}
                        <div className="absolute bottom-4 left-0 right-0 px-8 flex justify-between items-end w-full">
                          <div className="text-center w-40 border-t border-[#065F46] pt-2">
                            <span className="font-bold text-[10px] uppercase text-[#065F46]">Employee Signature</span>
                          </div>
                          <div className="text-center w-40 border-t border-[#065F46] pt-2 relative">
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full border-[2px] border-[#065F46]/20 flex flex-col items-center justify-center bg-emerald-50 shrink-0">
                               <div className="text-[6px] font-black text-[#065F46]/40 text-center leading-[1.2]">OFFICIAL<br />SEAL</div>
                            </div>
                            <span className="font-bold text-[10px] uppercase text-[#065F46]">Director / Principal</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
                )}
              </>
            ) : (
              isStudent ? (
                // Students: profile is auto-loading via /api/students/profile.
                // Show a spinner rather than the admin-targeted "search" prompt.
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 py-36">
                  <div className="w-16 h-16 mb-4 rounded-2xl bg-indigo-50 flex items-center justify-center">
                    <svg className="animate-spin w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <p className="font-black text-base text-gray-600 mt-1">Loading Your Documents…</p>
                  <p className="text-xs text-gray-400 mt-2 text-center max-w-xs leading-relaxed">
                    We are retrieving your student profile. Your document preview will appear automatically.
                  </p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 py-36">
                  <FileText className="w-16 h-16 mb-4 text-gray-200" />
                  <p className="font-black text-lg uppercase tracking-tighter">Document Hub Preview</p>
                  <p className="text-xs max-w-[280px] text-center mt-3 opacity-60 leading-relaxed">
                    Search for a student and select a document type above to view and download high-resolution templates!
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

