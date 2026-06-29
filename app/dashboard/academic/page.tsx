'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/shared/empty-state'
import { AccessDenied } from '@/components/AccessDenied'
import { notify } from '@/lib/notify'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import {
  Calendar, Clock, Layers, Users, BookOpen, CalendarDays,
  MapPin, CheckSquare, BarChart, HardDrive, GraduationCap, Layout,
  AlertCircle, Zap, Info, Trash2
} from 'lucide-react'

// WHY: Shift-aware labels for section dropdowns to distinguish same-name
// classes across Morning/Evening/Night shifts.
const SHIFT_ICONS: Record<string, string> = { MORNING: '🌅', EVENING: '🌆', NIGHT: '🌙' }
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type DeliveryMode = 'PHYSICAL' | 'ONLINE' | 'HYBRID'
type CurriculumMode = 'FIXED' | 'ELECTIVE'
type AcademicYear = { id: string; name: string; isActive: boolean; isLocked: boolean }
type ShiftOption = { id: string; code: string; name: string; startTime: string; endTime: string }
type CampusOption = { id: string; name: string; code?: string; gender?: string | null }
type BatchOption = { id: string; name: string; code?: string }
type SubjectOption = { id: string; name: string; code: string }
type TeacherOption = { id: string; firstName: string; lastName: string; designation?: string | null }
type ClassSectionOption = SectionLike & {
  id: string
  campusId: string
  batchId: string
  shiftId: string
  deliveryMode: DeliveryMode
  curriculumMode?: CurriculumMode | null
  campus?: { name: string; code?: string } | null
  batch?: { name: string; code?: string } | null
}
type SubjectOfferingOption = {
  id: string
  teacherId?: string | null
  isMandatory: boolean
  subject: { name: string; code?: string }
  teacher?: { firstName: string; lastName: string } | null
}
type RoomOption = { id: string; name: string; capacity: number; campus?: { name: string; code?: string } | null }
type ElectiveGroupOption = {
  id: string
  name: string
  minSelections: number
  maxSelections: number
  offerings?: Array<{ subject: { name: string } }>
}
type SectionEnrollmentRow = {
  id: string
  rollNumber: string
  student: {
    id: string
    firstName: string
    lastName: string
    house?: { id: string; name: string; color: string } | null
  }
}
type HouseOption = { id: string; name: string; color: string }
type PendingElectiveRow = {
  id: string
  studentEnrollment: { student: { firstName: string; lastName: string }; rollNumber: string }
  subjectOffering: { subject: { name: string } }
}
type TimetableSlotRow = {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isPublished: boolean
  subjectOffering: { subject: { name: string } }
  teacher?: { firstName: string; lastName: string } | null
}
type GradingSchemeRow = {
  id: string
  name: string
  isPublished: boolean
  subject: { name: string }
  components: Array<{ id: string; name: string; weightPercentage: number; assessments: Array<{ id: string; title: string }> }>
}

type SectionLike = { className: string; sectionName: string; shift?: { name: string; code: string } | null }
function sectionLabel(s: SectionLike): string {
  const icon = s.shift?.code ? SHIFT_ICONS[s.shift.code] ?? '' : ''
  return `${s.className}-${s.sectionName} · ${icon} ${s.shift?.name || 'Unassigned'}`
}

/** Group sections by shift for SelectGroup rendering */
function groupByShift<T extends SectionLike & { id: string }>(items: T[]): { shiftCode: string; shiftLabel: string; sections: T[] }[] {
  const groups: Record<string, { shiftCode: string; shiftLabel: string; sections: T[] }> = {}
  for (const s of items) {
    const code = s.shift?.code ?? 'NONE'
    const label = s.shift?.code ? `${SHIFT_ICONS[s.shift.code] ?? ''} ${s.shift.name}` : 'No Shift'
    if (!groups[code]) groups[code] = { shiftCode: code, shiftLabel: label, sections: [] }
    groups[code].sections.push(s)
  }
  const order = ['MORNING', 'EVENING', 'NIGHT', 'NONE']
  return Object.values(groups).sort((a, b) => order.indexOf(a.shiftCode) - order.indexOf(b.shiftCode))
}
const VALID_TABS = [
  'years',
  'shifts',
  'sections',
  'enrollments',
  'offerings',
  'timetable',
  'rooms',
  'elective-groups',
  'electives',
  'grading',
  'migration',
] as const

export default function AcademicEnginePage() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(() => {
    return tabParam && (VALID_TABS as readonly string[]).includes(tabParam) ? tabParam : 'years'
  })
  const qc = useQueryClient()
  const role = session?.user?.role

  const [yearForm, setYearForm] = useState({ name: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31' })
  const [sectionForm, setSectionForm] = useState({
    campusId: '',
    batchId: '',
    shiftId: '',
    className: 'Class 9',
    sectionName: 'A',
    grade: 9,
    deliveryMode: 'PHYSICAL' as DeliveryMode,
    curriculumMode: 'ELECTIVE' as CurriculumMode,
  })

  const [offeringForm, setOfferingForm] = useState({
    academicYearId: '',
    classSectionId: '',
    subjectId: '',
    teacherId: '',
    isMandatory: true,
    electiveGroupId: '' as string,
  })

  const [slotForm, setSlotForm] = useState({
    academicYearId: '',
    classSectionId: '',
    subjectOfferingId: '',
    teacherId: '',
    roomId: 'none' as string,
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '09:45',
  })

  const [roomForm, setRoomForm] = useState({ campusId: '', name: '', capacity: 40 })
  const [roomCampusFilter, setRoomCampusFilter] = useState('all')
  const [electiveGroupForm, setElectiveGroupForm] = useState({
    classSectionId: '',
    name: 'Elective Block A',
    minSelections: 1,
    maxSelections: 1,
  })
  const [electiveSectionFilter, setElectiveSectionFilter] = useState('')
  const [enrollSectionId, setEnrollSectionId] = useState('')

  const [ttCampus, setTtCampus] = useState('all')
  const [ttShift, setTtShift] = useState('all')

  const [slotFilterSection, setSlotFilterSection] = useState('')

  const [gradingSectionId, setGradingSectionId] = useState('')
  const [gradingForm, setGradingForm] = useState({ subjectId: '', name: 'Standard Assessment Plan' })
  const [assessmentForm, setAssessmentForm] = useState({
    schemeId: '',
    gradingComponentId: '',
    title: '',
    dueDate: new Date().toISOString().split('T')[0],
  })

  const DEFAULT_COMPONENTS = [
    { name: 'Quiz', maxMarks: 10, weightPercentage: 10, orderIndex: 0 },
    { name: 'Assignment', maxMarks: 10, weightPercentage: 10, orderIndex: 1 },
    { name: 'Activity', maxMarks: 10, weightPercentage: 10, orderIndex: 2 },
    { name: 'Midterm', maxMarks: 30, weightPercentage: 30, orderIndex: 3 },
    { name: 'Final', maxMarks: 40, weightPercentage: 40, orderIndex: 4 },
  ]

  const { data: years } = useQuery({ queryKey: ['academic-years'], queryFn: () => fetchApi<AcademicYear[]>('/api/academic-years') })
  const activeYear = (years ?? []).find((y) => y.isActive)
  const { data: shifts, refetch: refetchShifts } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => fetchApi<ShiftOption[]>('/api/shifts'),
  })
  const [shiftEdits, setShiftEdits] = useState<Record<string, { startTime: string; endTime: string }>>({})

  const saveShift = useMutation({
    mutationFn: (payload: { id: string; startTime: string; endTime: string }) =>
      fetchApi(`/api/shifts/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startTime: payload.startTime,
          endTime: payload.endTime,
        }),
      }),
    onSuccess: () => {
      notify.success('Shift times updated')
      refetchShifts()
    },
    onError: (e: Error) => notify.error(e.message),
  })
  const { data: sections } = useQuery({ queryKey: ['class-sections'], queryFn: () => fetchApi<ClassSectionOption[]>('/api/class-sections') })
  const { data: campuses } = useQuery({ queryKey: ['campuses-ac'], queryFn: () => fetchApi<CampusOption[]>('/api/campuses') })
  const { data: batches } = useQuery({
    queryKey: ['batches-ac', sectionForm.campusId],
    queryFn: () => fetchApi<BatchOption[]>(`/api/batches?campusId=${sectionForm.campusId}`),
    enabled: !!sectionForm.campusId,
  })

  const { data: migrationStatus, refetch: refetchMigration } = useQuery({
    queryKey: ['academic-migrate-status'],
    queryFn: () =>
      fetchApi<{
        academicYear: { id: string; name: string } | null
        legacyActiveClasses: number
        legacyStudentsWithClass: number
        engineSections: number
        engineEnrollmentsForYear: number
        studentsPendingEnrollment: number
      }>('/api/academic/migrate'),
  })

  const [migrateOpts, setMigrateOpts] = useState({
    migrateTimetable: false,
    migrateAttendance: false,
  })

  const migrateLegacy = useMutation({
    mutationFn: (dryRun: boolean) =>
      fetchApi('/api/academic/migrate', {
        method: 'POST',
        body: JSON.stringify({
          dryRun,
          migrateSections: true,
          migrateEnrollments: true,
          migrateSubjects: true,
          migrateTimetable: migrateOpts.migrateTimetable,
          migrateAttendance: migrateOpts.migrateAttendance,
        }),
      }),
    onSuccess: (r: {
      dryRun: boolean
      sectionsCreated: number
      enrollmentsCreated: number
      offeringsCreated: number
      errors: Array<{ message: string }>
    }) => {
      const label = r.dryRun ? 'Dry run' : 'Migration'
      notify.success(
        `${label}: ${r.sectionsCreated} sections, ${r.enrollmentsCreated} enrollments, ${r.offeringsCreated} offerings`
      )
      if (r.errors?.length) notify.error(`${r.errors.length} issue(s) — see console`)
      refetchMigration()
      qc.invalidateQueries({ queryKey: ['class-sections'] })
      qc.invalidateQueries({ queryKey: ['academic-years'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const bootstrap = useMutation({
    mutationFn: () => fetchApi('/api/academic/bootstrap', { method: 'POST', body: '{}' }),
    onSuccess: (r: { shiftsCreated: number; yearCreated: boolean; activeYear?: { name: string } }) => {
      notify.success(
        `Foundation ready${r.activeYear ? ` · ${r.activeYear.name}` : ''}${r.shiftsCreated ? ` · ${r.shiftsCreated} shifts` : ''}`
      )
      qc.invalidateQueries({ queryKey: ['academic-years'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const createYear = useMutation({
    mutationFn: () =>
      fetchApi('/api/academic-years', {
        method: 'POST',
        body: JSON.stringify({ ...yearForm, isActive: true }),
      }),
    onSuccess: () => {
      notify.success('Academic year created')
      qc.invalidateQueries({ queryKey: ['academic-years'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const { data: subjects } = useQuery({
    queryKey: ['academic-subjects'],
    queryFn: () => fetchApi<SubjectOption[]>('/api/academic-subjects'),
  })

  const { data: teachersData } = useQuery({
    queryKey: ['teachers-select'],
    queryFn: () => fetchApi<{ teachers: TeacherOption[] }>('/api/teachers/for-selection'),
  })
  const teachers = teachersData?.teachers ?? []

  const { data: offerings } = useQuery({
    queryKey: ['subject-offerings', offeringForm.classSectionId, activeYear?.id],
    queryFn: () =>
      fetchApi<SubjectOfferingOption[]>(
        `/api/subject-offerings?academicYearId=${activeYear?.id}&classSectionId=${offeringForm.classSectionId}`
      ),
    enabled: !!activeYear?.id && !!offeringForm.classSectionId,
  })

  const { data: slotOfferings } = useQuery({
    queryKey: ['subject-offerings-slot', slotFilterSection, activeYear?.id],
    queryFn: () =>
      fetchApi<SubjectOfferingOption[]>(
        `/api/subject-offerings?academicYearId=${activeYear?.id}&classSectionId=${slotFilterSection}`
      ),
    enabled: !!activeYear?.id && !!slotFilterSection,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms', roomCampusFilter],
    queryFn: () =>
      fetchApi<RoomOption[]>(
        `/api/rooms${roomCampusFilter !== 'all' ? `?campusId=${roomCampusFilter}` : ''}`
      ),
  })

  const { data: electiveGroups } = useQuery({
    queryKey: ['elective-groups', electiveSectionFilter],
    queryFn: () => fetchApi<ElectiveGroupOption[]>(`/api/elective-groups?classSectionId=${electiveSectionFilter}`),
    enabled: !!electiveSectionFilter,
  })

  const { data: offeringElectiveGroups } = useQuery({
    queryKey: ['elective-groups-offering', offeringForm.classSectionId],
    queryFn: () => fetchApi<ElectiveGroupOption[]>(`/api/elective-groups?classSectionId=${offeringForm.classSectionId}`),
    enabled: !!offeringForm.classSectionId && !offeringForm.isMandatory,
  })

  const createRoom = useMutation({
    mutationFn: () =>
      fetchApi('/api/rooms', { method: 'POST', body: JSON.stringify(roomForm) }),
    onSuccess: () => {
      notify.success('Room created')
      qc.invalidateQueries({ queryKey: ['rooms'] })
      setRoomForm({ ...roomForm, name: '' })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const createElectiveGroup = useMutation({
    mutationFn: () =>
      fetchApi('/api/elective-groups', { method: 'POST', body: JSON.stringify(electiveGroupForm) }),
    onSuccess: () => {
      notify.success('Elective group created')
      qc.invalidateQueries({ queryKey: ['elective-groups'] })
      qc.invalidateQueries({ queryKey: ['elective-groups-offering'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const enrollSection = (sections ?? []).find((s) => s.id === enrollSectionId)

  const { data: sectionEnrollments, refetch: refetchEnrollments } = useQuery({
    queryKey: ['section-enrollments', enrollSectionId, activeYear?.id],
    queryFn: () =>
      fetchApi<SectionEnrollmentRow[]>(
        `/api/student-enrollments?classSectionId=${enrollSectionId}&academicYearId=${activeYear?.id}&status=ACTIVE`
      ),
    enabled: !!enrollSectionId && !!activeYear?.id,
  })

  const { data: batchHouses } = useQuery({
    queryKey: ['houses-batch', enrollSection?.batchId],
    queryFn: () => fetchApi<HouseOption[]>(`/api/houses?batchId=${enrollSection?.batchId}`),
    enabled: !!enrollSection?.batchId,
  })

  const assignHouse = useMutation({
    mutationFn: ({ studentId, houseId }: { studentId: string; houseId: string | null }) =>
      fetchApi(`/api/students/${studentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ houseId }),
      }),
    onSuccess: () => {
      notify.success('House assigned')
      refetchEnrollments()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const { data: pendingElectives } = useQuery({
    queryKey: ['pending-electives'],
    queryFn: () => fetchApi<PendingElectiveRow[]>('/api/subject-enrollments?status=PENDING'),
  })

  const { data: timetableSlots } = useQuery({
    queryKey: ['timetable-slots', activeYear?.id, slotFilterSection],
    queryFn: () =>
      fetchApi<TimetableSlotRow[]>(
        `/api/timetable/slots?academicYearId=${activeYear?.id}&classSectionId=${slotFilterSection}`
      ),
    enabled: !!activeYear?.id && !!slotFilterSection,
  })

  const [newSubject, setNewSubject] = useState({ name: '', code: '' })

  const createSubject = useMutation({
    mutationFn: () =>
      fetchApi('/api/academic-subjects', {
        method: 'POST',
        body: JSON.stringify({ name: newSubject.name, code: newSubject.code.toUpperCase() }),
      }),
    onSuccess: () => {
      notify.success('Subject added')
      qc.invalidateQueries({ queryKey: ['academic-subjects'] })
      setNewSubject({ name: '', code: '' })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const createOffering = useMutation({
    mutationFn: () =>
      fetchApi('/api/subject-offerings', {
        method: 'POST',
        body: JSON.stringify({
          ...offeringForm,
          academicYearId: activeYear?.id,
          teacherId: offeringForm.teacherId || null,
          electiveGroupId: offeringForm.isMandatory
            ? null
            : offeringForm.electiveGroupId || null,
        }),
      }),
    onSuccess: () => {
      notify.success('Subject offering created')
      qc.invalidateQueries({ queryKey: ['subject-offerings'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const createSlot = useMutation({
    mutationFn: () =>
      fetchApi('/api/timetable/slots', {
        method: 'POST',
        body: JSON.stringify({
          ...slotForm,
          academicYearId: activeYear?.id,
          // Convert sentinel 'none' back to null for the API
          roomId: slotForm.roomId === 'none' ? null : slotForm.roomId,
        }),
      }),
    onSuccess: () => {
      notify.success('Timetable slot added')
      qc.invalidateQueries({ queryKey: ['timetable-slots'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const publishTimetable = useMutation({
    mutationFn: () =>
      fetchApi('/api/timetable/slots', {
        method: 'PUT',
        body: JSON.stringify({
          academicYearId: activeYear?.id,
          classSectionId: slotFilterSection || undefined,
        }),
      }),
    onSuccess: () => notify.success('Timetable published for section'),
    onError: (e: Error) => notify.error(e.message),
  })

  const { data: gradingSchemes } = useQuery({
    queryKey: ['grading-schemes', activeYear?.id, gradingSectionId],
    queryFn: () =>
      fetchApi<GradingSchemeRow[]>(
        `/api/grading-schemes?academicYearId=${activeYear?.id}&classSectionId=${gradingSectionId}`
      ),
    enabled: !!activeYear?.id && !!gradingSectionId,
  })

  const createGradingScheme = useMutation({
    mutationFn: () =>
      fetchApi('/api/grading-schemes', {
        method: 'POST',
        body: JSON.stringify({
          academicYearId: activeYear?.id,
          classSectionId: gradingSectionId,
          subjectId: gradingForm.subjectId,
          name: gradingForm.name,
          components: DEFAULT_COMPONENTS,
        }),
      }),
    onSuccess: () => {
      notify.success('Grading scheme created (weights total 100%)')
      qc.invalidateQueries({ queryKey: ['grading-schemes'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const publishScheme = useMutation({
    mutationFn: (schemeId: string) =>
      fetchApi(`/api/grading-schemes/${schemeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: true }),
      }),
    onSuccess: () => {
      notify.success('Results published — students can now view grades')
      qc.invalidateQueries({ queryKey: ['grading-schemes'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const addAssessment = useMutation({
    mutationFn: () =>
      fetchApi(`/api/grading-schemes/${assessmentForm.schemeId}/assessments`, {
        method: 'POST',
        body: JSON.stringify({
          gradingComponentId: assessmentForm.gradingComponentId,
          title: assessmentForm.title,
          dueDate: assessmentForm.dueDate,
        }),
      }),
    onSuccess: () => {
      notify.success('Assessment added')
      qc.invalidateQueries({ queryKey: ['grading-schemes'] })
      setAssessmentForm((f) => ({ ...f, title: '' }))
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const approveElectives = useMutation({
    mutationFn: (ids: string[]) =>
      fetchApi('/api/subject-enrollments', {
        method: 'PATCH',
        body: JSON.stringify({ enrollmentIds: ids, approve: true }),
      }),
    onSuccess: () => {
      notify.success('Electives approved')
      qc.invalidateQueries({ queryKey: ['pending-electives'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const createSection = useMutation({
    mutationFn: () =>
      fetchApi('/api/class-sections', {
        method: 'POST',
        body: JSON.stringify(sectionForm),
      }),
    onSuccess: () => {
      notify.success('Class section created')
      qc.invalidateQueries({ queryKey: ['class-sections'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteSection = useMutation({
    mutationFn: (sectionId: string) =>
      fetchApi(`/api/class-sections/${sectionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Class section deleted successfully')
      qc.invalidateQueries({ queryKey: ['class-sections'] })
    },
    onError: (e: Error) => notify.error(e.message || 'Failed to delete class section'),
  })

  if (status === 'loading') return null
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <AccessDenied title="Academic Engine" message="Administrators manage academic years, shifts, and class sections here." />
  }

  const filteredSectionsForTimetable = (sections ?? []).filter((s) => {
    if (ttCampus !== 'all' && s.campusId !== ttCampus) return false
    if (ttShift !== 'all' && s.shiftId !== ttShift) return false
    return true
  })

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Academic Engine</h1>
              <p className="text-blue-200 text-sm mt-0.5">Configure years · shifts · sections · timetables · grading</p>
            </div>
          </div>
          {activeYear && (
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-bold flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              Active: {activeYear.name}
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="grid gap-6 lg:grid-cols-[minmax(260px,300px)_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/95 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-slate-500 mt-1" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Academic Engine helper</p>
                <p className="text-xs text-slate-500">Navigate setup, class configuration, enrollments, operations, and migration in a grouped workflow.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">Foundation</span> starts with Academic Years, Shifts and Rooms.</p>
              <p><span className="font-semibold text-slate-900">Class Management</span> organizes Sections and Elective Groups.</p>
              <p><span className="font-semibold text-slate-900">Enrollments & Subjects</span> links students, houses and offerings.</p>
              <p><span className="font-semibold text-slate-900">Operations</span> includes Timetable building and Grading.</p>
            </div>
          </div>

          <TabsList className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-sm">
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Foundation setup</p>
              <TabsTrigger value="years" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <Calendar className="w-4 h-4" />Academic Years
              </TabsTrigger>
              <TabsTrigger value="shifts" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <Clock className="w-4 h-4" />Shifts
              </TabsTrigger>
              <TabsTrigger value="rooms" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <MapPin className="w-4 h-4" />Rooms
              </TabsTrigger>
            </div>
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Class management</p>
              <TabsTrigger value="sections" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <Layers className="w-4 h-4" />Sections
              </TabsTrigger>
              <TabsTrigger value="elective-groups" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <Layout className="w-4 h-4" />Elective Groups
              </TabsTrigger>
            </div>
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Enrollments & subjects</p>
              <TabsTrigger value="enrollments" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <Users className="w-4 h-4" />Houses
              </TabsTrigger>
              <TabsTrigger value="offerings" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <BookOpen className="w-4 h-4" />Offerings
              </TabsTrigger>
              <TabsTrigger value="electives" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <CheckSquare className="w-4 h-4" />Approvals
              </TabsTrigger>
            </div>
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Operations</p>
              <TabsTrigger value="timetable" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <CalendarDays className="w-4 h-4" />Timetable
              </TabsTrigger>
              <TabsTrigger value="grading" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <BarChart className="w-4 h-4" />Grading
              </TabsTrigger>
            </div>
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">System</p>
              <TabsTrigger value="migration" className="text-sm gap-2 data-[state=active]:bg-slate-100 data-[state=active]:shadow-sm">
                <HardDrive className="w-4 h-4" />Migration
              </TabsTrigger>
            </div>
          </TabsList>
        </div>

        <div className="space-y-4">

        <TabsContent value="years" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-t-4 border-t-indigo-500 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calendar className="w-4 h-4 text-indigo-500" />Create Academic Year</CardTitle>
                <CardDescription>Only one year can be active at a time. Use Quick Bootstrap if starting fresh.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Year Name</Label>
                  <Input
                    placeholder="e.g. 2025-2026"
                    value={yearForm.name}
                    onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                    className="border-gray-200 focus:border-indigo-400 focus:ring-indigo-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Start Date</Label>
                    <Input type="date" value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">End Date</Label>
                    <Input type="date" value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} />
                  </div>
                </div>
                <Button onClick={() => createYear.mutate()} disabled={createYear.isPending} className="w-full bg-indigo-600 hover:bg-indigo-700">
                  {createYear.isPending ? 'Creating…' : 'Create & Activate Year'}
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100" /></div>
                  <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or</span></div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  disabled={bootstrap.isPending}
                  onClick={() => bootstrap.mutate()}
                >
                  <Zap className="w-3.5 h-3.5 mr-2" />
                  {bootstrap.isPending ? 'Bootstrapping…' : 'Quick Bootstrap (shifts + year)'}
                </Button>
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-slate-300 shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" />Registered Years</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(years ?? []).length === 0 && (
                  <p className="text-gray-400 text-sm py-4 text-center">No academic years yet. Create one on the left.</p>
                )}
                {(years ?? []).map((y: { id: string; name: string; isActive: boolean; isLocked: boolean }) => (
                  <div key={y.id} className={`flex justify-between items-center rounded-xl p-3 gap-2 border ${
                    y.isActive ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                    <div>
                      <p className="font-semibold text-gray-900">{y.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {y.isActive && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full"><span className="w-1 h-1 rounded-full bg-emerald-500" />ACTIVE</span>}
                        {y.isLocked && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">LOCKED</span>}
                        {!y.isActive && !y.isLocked && <span className="text-[10px] text-gray-400">Inactive</span>}
                      </div>
                    </div>
                    {!y.isLocked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={async () => {
                          try {
                            await fetchApi(`/api/academic-years/${y.id}/lock`, { method: 'POST' })
                            notify.success('Year locked')
                            qc.invalidateQueries({ queryKey: ['academic-years'] })
                          } catch (e) {
                            notify.error(e instanceof Error ? e.message : 'Lock failed')
                          }
                        }}
                      >Lock</Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs h-7"
                        onClick={async () => {
                          try {
                            await fetchApi(`/api/academic-years/${y.id}/unlock`, { method: 'POST' })
                            notify.success('Year unlocked')
                            qc.invalidateQueries({ queryKey: ['academic-years'] })
                          } catch (e) {
                            notify.error(e instanceof Error ? e.message : 'Unlock failed')
                          }
                        }}
                      >Unlock</Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="mt-0">
          <Card className="border-t-4 border-t-blue-500 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" />Institution Shifts</CardTitle>
              <CardDescription>
                Default: Morning 09:00–12:00, Evening 15:00–18:00, Night 18:00–21:00. 
                Students can enroll in multiple sections (one per shift) per academic year.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-6">
              {(shifts ?? []).length === 0 && (
                <div className="col-span-3">
                  <EmptyState icon={Clock} title="No Shifts Found" description="Use Quick Bootstrap on the Years tab to initialize default shifts." />
                </div>
              )}
              {(shifts ?? []).map((s: { id: string; code: string; name: string; startTime: string; endTime: string }) => {
                const edit = shiftEdits[s.id] ?? { startTime: s.startTime, endTime: s.endTime }
                return (
                  <div key={s.id} className="border border-blue-100 bg-blue-50/30 rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                    <p className="font-bold text-blue-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      {SESSION_SHIFT_LABELS[s.code as keyof typeof SESSION_SHIFT_LABELS] ?? s.name}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Start Time</Label>
                        <Input
                          type="time"
                          value={edit.startTime}
                          onChange={(e) =>
                            setShiftEdits((prev) => ({
                              ...prev,
                              [s.id]: { ...edit, startTime: e.target.value.slice(0, 5) },
                            }))
                          }
                          className="border-gray-200 focus:border-blue-400 focus:ring-blue-100 h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">End Time</Label>
                        <Input
                          type="time"
                          value={edit.endTime}
                          onChange={(e) =>
                            setShiftEdits((prev) => ({
                              ...prev,
                              [s.id]: { ...edit, endTime: e.target.value.slice(0, 5) },
                            }))
                          }
                          className="border-gray-200 focus:border-blue-400 focus:ring-blue-100 h-9"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-blue-600 border-blue-200 hover:bg-blue-100 h-9"
                      disabled={saveShift.isPending}
                      onClick={() => saveShift.mutate({ id: s.id, ...edit })}
                    >
                      {saveShift.isPending ? 'Saving...' : 'Save Times'}
                    </Button>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sections" className="mt-0">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 mb-4">
            <p className="font-semibold text-slate-900">Class sections capture the academic structure.</p>
            <p className="mt-1">Define campus, batch, shift, class, section name, and curriculum mode before assigning subject offerings.</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-t-4 border-t-violet-500 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Layers className="w-4 h-4 text-violet-500" />New Class Section</CardTitle>
                <CardDescription>Combine campuses, batches, and shifts to define section rules.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Campus</Label>
                    <Select value={sectionForm.campusId} onValueChange={(v) => setSectionForm({ ...sectionForm, campusId: v, batchId: '' })}>
                      <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Campus" /></SelectTrigger>
                      <SelectContent>
                        {(campuses ?? []).map((c: { id: string; name: string }) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Batch</Label>
                    <Select value={sectionForm.batchId} onValueChange={(v) => setSectionForm({ ...sectionForm, batchId: v })}>
                      <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Batch" /></SelectTrigger>
                      <SelectContent>
                        {(batches ?? []).map((b: { id: string; name: string }) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Session Shift</Label>
                    <Info className="w-3.5 h-3.5 text-gray-400" aria-label="Each section is linked to one shift. Students enroll in one section per shift per year." />
                  </div>
                  <Select value={sectionForm.shiftId} onValueChange={(v) => setSectionForm({ ...sectionForm, shiftId: v })}>
                    <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Shift (e.g. Morning)" /></SelectTrigger>
                    <SelectContent>
                      {(shifts ?? []).map((s: { id: string; name: string }) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Class Name</Label>
                    <Input placeholder="e.g. 9" value={sectionForm.className} onChange={(e) => setSectionForm({ ...sectionForm, className: e.target.value })} className="border-gray-200" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Section Name</Label>
                    <Input placeholder="e.g. A" value={sectionForm.sectionName} onChange={(e) => setSectionForm({ ...sectionForm, sectionName: e.target.value })} className="border-gray-200" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Delivery Mode</Label>
                      <Info className="w-3.5 h-3.5 text-gray-400" aria-label="Choose where this section will operate: on-campus, remote, or hybrid." />
                    </div>
                    <Select value={sectionForm.deliveryMode} onValueChange={(v) => setSectionForm({ ...sectionForm, deliveryMode: v as DeliveryMode })}>
                      <SelectTrigger className="border-gray-200"><SelectValue placeholder="Mode" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PHYSICAL">Physical (On-Campus)</SelectItem>
                        <SelectItem value="ONLINE">Online (Remote)</SelectItem>
                        <SelectItem value="HYBRID">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Curriculum</Label>
                      <Info className="w-3.5 h-3.5 text-gray-400" aria-label="Fixed means a common curriculum. Elective means student choice within group blocks." />
                    </div>
                    <Select
                      value={sectionForm.curriculumMode}
                      onValueChange={(v) => setSectionForm({ ...sectionForm, curriculumMode: v as CurriculumMode })}
                    >
                      <SelectTrigger className="border-gray-200"><SelectValue placeholder="Curriculum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed (All Core)</SelectItem>
                        <SelectItem value="ELECTIVE">Elective Choice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={() => createSection.mutate()} disabled={createSection.isPending || !sectionForm.shiftId} className="w-full bg-violet-600 hover:bg-violet-700">
                  {createSection.isPending ? 'Creating...' : 'Create Class Section'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-slate-300 shadow-sm">
              <CardHeader><CardTitle className="flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" />Configured Sections</CardTitle></CardHeader>
              <CardContent className="max-h-[520px] overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-gray-200">
                {(sections ?? []).length === 0 && (
                  <p className="text-gray-400 text-sm py-4 text-center">No sections created yet.</p>
                )}
                {groupByShift(sections ?? []).map((group) => (
                  <div key={group.shiftCode} className="space-y-2">
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{group.shiftLabel}</span>
                      <span className="flex-1 border-t border-slate-100" />
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{group.sections.length}</span>
                    </div>
                    {group.sections.map((s: { id: string; className: string; sectionName: string; campus?: { name: string }; batch?: { name: string }; shift?: { name: string; code: string }; deliveryMode: string; curriculumMode?: string }) => (
                      <div key={s.id} className="border border-gray-100 bg-gray-50/50 rounded-xl p-3 hover:border-violet-200 hover:bg-violet-50/30 transition-colors ml-2">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <p className="font-bold text-gray-900 text-base">{s.className}-{s.sectionName}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black tracking-wider px-2 py-0.5 rounded-md bg-gray-200 text-gray-600">
                              {s.curriculumMode ?? 'FIXED'}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-red-600 hover:bg-red-50"
                              onClick={() => {
                                if (!confirm(`Delete class section ${s.className}-${s.sectionName}? This will hide it from active lists.`)) return
                                deleteSection.mutate(s.id)
                              }}
                              disabled={deleteSection.isPending}
                              title="Delete class section"
                            >
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 font-medium">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" />{s.campus?.name}</span>
                          <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-gray-400" />{s.batch?.name}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gray-400" />{s.shift?.name}</span>
                          <span className="flex items-center gap-1"><Layout className="w-3 h-3 text-gray-400" />{s.deliveryMode}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="enrollments" className="mt-0">
          {!activeYear ? (
            <Card className="border-t-4 border-t-amber-500 shadow-sm">
              <CardContent className="pt-6 pb-6">
                <EmptyState icon={AlertCircle} title="No Active Year" description="Activate an academic year first to manage enrollments and houses." />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-t-4 border-t-emerald-500 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-500" />Assign Houses & Sports Gala</CardTitle>
                <CardDescription>
                  Houses are per batch (Shaheen, Parvaaz, Junoon, etc.). Updates the student profile for the active year enrollment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Select Class Section</Label>
                  <Select value={enrollSectionId} onValueChange={setEnrollSectionId}>
                    <SelectTrigger className="max-w-md border-gray-200 focus:ring-emerald-100 focus:border-emerald-400">
                      <SelectValue placeholder="Choose a section..." />
                    </SelectTrigger>
                    <SelectContent>
                      {groupByShift(sections ?? []).map((group) => (
                        <SelectGroup key={group.shiftCode}>
                          <SelectLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.shiftLabel}</SelectLabel>
                          {group.sections.map((s: { id: string; className: string; sectionName: string; batch?: { name: string }; shift?: { name: string; code: string } }) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="font-semibold">{s.className}-{s.sectionName}</span> <span className="text-gray-400">({s.batch?.name})</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!enrollSectionId ? (
                  <div className="border border-dashed border-gray-200 rounded-xl bg-gray-50/50 p-8 text-center text-gray-400 text-sm">
                    Select a section above to view and assign enrolled students.
                  </div>
                ) : (sectionEnrollments ?? []).length === 0 ? (
                  <div className="border border-dashed border-amber-200 rounded-xl bg-amber-50/50 p-8 text-center text-amber-700 text-sm font-medium">
                    No active enrollments found in this section for {activeYear.name}.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200">
                    {(sectionEnrollments ?? []).map((row: {
                      id: string
                      rollNumber: string
                      student: {
                        id: string
                        firstName: string
                        lastName: string
                        house?: { id: string; name: string; color: string } | null
                      }
                    }) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 bg-white shadow-sm rounded-xl p-3 hover:border-emerald-200 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 flex-shrink-0">
                            <Users className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">
                              {row.student.firstName} {row.student.lastName}
                            </p>
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Roll: {row.rollNumber}</p>
                          </div>
                        </div>
                        <Select
                          value={row.student.house?.id ?? 'none'}
                          onValueChange={(v) =>
                            assignHouse.mutate({
                              studentId: row.student.id,
                              houseId: v === 'none' ? null : v,
                            })
                          }
                        >
                          <SelectTrigger className="w-48 h-9 border-gray-200 bg-gray-50">
                            <SelectValue placeholder="Assign House" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><span className="text-gray-400 font-medium">No House</span></SelectItem>
                            {(batchHouses ?? []).map((h: { id: string; name: string; color: string }) => (
                              <SelectItem key={h.id} value={h.id}>
                                <span className="inline-flex items-center gap-2 font-medium">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-black/10"
                                    style={{ backgroundColor: h.color }}
                                  />
                                  {h.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="offerings" className="mt-0">
          {!activeYear ? (
            <Card className="border-t-4 border-t-amber-500 shadow-sm">
              <CardContent className="pt-6 pb-6">
                <EmptyState icon={AlertCircle} title="No Active Year" description="Create and activate an academic year first to assign subject offerings." />
              </CardContent>
            </Card>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="border-t-4 border-t-pink-500 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-pink-500" />Assign Subjects</CardTitle>
                  <CardDescription>Link subjects and teachers to class sections for the active year.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Class Section</Label>
                      <Select value={offeringForm.classSectionId} onValueChange={(v) => setOfferingForm({ ...offeringForm, classSectionId: v })}>
                        <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Section" /></SelectTrigger>
                        <SelectContent>
                          {groupByShift(sections ?? []).map((group) => (
                            <SelectGroup key={group.shiftCode}>
                              <SelectLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.shiftLabel}</SelectLabel>
                              {group.sections.map((s: { id: string; className: string; sectionName: string; shift?: { name: string; code: string } }) => (
                                <SelectItem key={s.id} value={s.id}>{sectionLabel(s)}</SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Subject</Label>
                      <Select value={offeringForm.subjectId} onValueChange={(v) => setOfferingForm({ ...offeringForm, subjectId: v })}>
                        <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Subject" /></SelectTrigger>
                        <SelectContent>
                          {(subjects ?? []).map((s: { id: string; name: string; code: string }) => (
                            <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="border border-gray-100 bg-gray-50/50 p-4 rounded-xl space-y-3 mt-2">
                    <p className="text-xs font-semibold text-gray-700">Can&apos;t find the subject? Create a new one:</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label className="text-[10px] uppercase text-gray-500">Name</Label><Input placeholder="e.g. Physics" value={newSubject.name} onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} className="h-8 text-xs bg-white" /></div>
                      <div className="space-y-1.5"><Label className="text-[10px] uppercase text-gray-500">Code</Label><Input placeholder="e.g. PHY101" value={newSubject.code} onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })} className="h-8 text-xs bg-white" /></div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => createSubject.mutate()} disabled={!newSubject.name || !newSubject.code || createSubject.isPending} className="w-full h-8 text-xs text-pink-600 border-pink-200 hover:bg-pink-50">
                      {createSubject.isPending ? 'Adding...' : 'Add Subject to Catalog'}
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Assigned Teacher (Optional)</Label>
                    <Select value={offeringForm.teacherId} onValueChange={(v) => setOfferingForm({ ...offeringForm, teacherId: v })}>
                      <SelectTrigger className="border-gray-200"><SelectValue placeholder="Select Teacher" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}{t.designation ? ` · ${t.designation}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex flex-col gap-3 p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={offeringForm.isMandatory}
                        onChange={(e) => setOfferingForm({ ...offeringForm, isMandatory: e.target.checked, electiveGroupId: '' })}
                        className="w-4 h-4 rounded text-pink-600 border-gray-300 focus:ring-pink-500"
                      />
                      <span className="text-sm font-semibold text-gray-700">Mandatory (Core Curriculum)</span>
                    </label>
                    {!offeringForm.isMandatory && (
                      <div className="pl-7 space-y-1.5 animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Elective Group</Label>
                        <Select value={offeringForm.electiveGroupId} onValueChange={(v) => setOfferingForm({ ...offeringForm, electiveGroupId: v })}>
                          <SelectTrigger className="border-gray-200 bg-gray-50"><SelectValue placeholder="Choose Group (Optional)" /></SelectTrigger>
                          <SelectContent>
                            {(offeringElectiveGroups ?? []).map((g: { id: string; name: string; maxSelections: number }) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name} (max {g.maxSelections})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <Button onClick={() => createOffering.mutate()} disabled={!offeringForm.classSectionId || !offeringForm.subjectId || createOffering.isPending} className="w-full bg-pink-600 hover:bg-pink-700">
                    {createOffering.isPending ? 'Creating...' : 'Create Subject Offering'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-t-4 border-t-slate-300 shadow-sm">
                <CardHeader><CardTitle className="flex items-center gap-2"><Info className="w-4 h-4 text-slate-400" />Current Offerings</CardTitle></CardHeader>
                <CardContent className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200">
                  {(offerings ?? []).length === 0 && (
                    <p className="text-gray-400 text-sm py-4 text-center">No offerings assigned yet.</p>
                  )}
                  {(offerings ?? []).map((o: { id: string; isMandatory: boolean; subject: { name: string }; teacher?: { firstName: string; lastName: string } }) => (
                    <div key={o.id} className="border border-gray-100 bg-gray-50/50 rounded-xl p-3 hover:border-pink-200 hover:bg-pink-50/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-gray-900">{o.subject.name}</p>
                        {o.isMandatory ? (
                          <span className="text-[10px] font-black tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">CORE</span>
                        ) : (
                          <span className="text-[10px] font-black tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">ELECTIVE</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-gray-500 mt-1">
                        Teacher: {o.teacher ? <span className="text-gray-700">{o.teacher.firstName} {o.teacher.lastName}</span> : <span className="text-gray-400 italic">Unassigned</span>}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="timetable" className="mt-4">
          {!activeYear ? (
            <Card><CardContent className="pt-6 text-sm text-amber-700">Activate an academic year first.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {/* Guide Banner */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-semibold mb-1">📋 How to build a timetable</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><strong>Step 1 — Rooms:</strong> Go to the <em>Rooms</em> tab first and create at least one room (e.g. &quot;Room 101&quot;).</li>
                  <li><strong>Step 2 — Select Section:</strong> Choose the Class Section you want to schedule.</li>
                  <li><strong>Step 3 — Pick Subject:</strong> Select the subject offering (subject + teacher pair).</li>
                  <li><strong>Step 4 — Set Day &amp; Time:</strong> Enter the day (1=Mon … 7=Sun) and start/end times (24-hr format, e.g. 09:00).</li>
                  <li><strong>Step 5 — Assign Room (optional):</strong> Select a room. The system prevents double-booking conflicts automatically.</li>
                  <li><strong>Step 6 — Add Slot:</strong> Click <em>Add slot</em>. Repeat for all periods.</li>
                  <li><strong>Step 7 — Publish:</strong> When all slots are ready, click <em>Publish timetable for section</em> to make it visible to teachers and students.</li>
                </ol>
              </div>


              <div className="grid lg:grid-cols-2 gap-6">
              <Card className="border-t-4 border-t-blue-500 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle>Add timetable slot</CardTitle>
                  <CardDescription>Conflict validation runs on save. Day 1=Mon … 7=Sun.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Select value={ttCampus} onValueChange={setTtCampus}>
                      <SelectTrigger className="h-8 text-xs bg-slate-50"><SelectValue placeholder="Filter Campus" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Campuses</SelectItem>
                        {(campuses ?? []).map((c: { id: string; name: string }) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={ttShift} onValueChange={setTtShift}>
                      <SelectTrigger className="h-8 text-xs bg-slate-50"><SelectValue placeholder="Filter Shift" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Shifts</SelectItem>
                        {(shifts ?? []).map((s: { id: string; name: string }) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Select value={slotFilterSection} onValueChange={(v) => { setSlotFilterSection(v); setSlotForm({ ...slotForm, classSectionId: v }) }}>
                    <SelectTrigger><SelectValue placeholder="1. Choose class section" /></SelectTrigger>
                    <SelectContent>
                      {groupByShift(filteredSectionsForTimetable).map((group) => (
                        <SelectGroup key={group.shiftCode}>
                          <SelectLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.shiftLabel}</SelectLabel>
                          {group.sections.map((s: { id: string; className: string; sectionName: string; shift?: { name: string; code: string } }) => (
                            <SelectItem key={s.id} value={s.id}>{sectionLabel(s)}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={slotForm.subjectOfferingId}
                    onValueChange={(v) => {
                      const off = (slotOfferings ?? []).find((o: { id: string; teacherId?: string }) => o.id === v)
                      setSlotForm({
                        ...slotForm,
                        subjectOfferingId: v,
                        classSectionId: slotFilterSection,
                        teacherId: off?.teacherId ?? slotForm.teacherId,
                      })
                    }}
                    disabled={!slotFilterSection}
                  >
                    <SelectTrigger><SelectValue placeholder="2. Choose subject offering" /></SelectTrigger>
                    <SelectContent>
                      {(slotOfferings ?? []).map((o: { id: string; subject: { name: string } }) => (
                        <SelectItem key={o.id} value={o.id}>{o.subject.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div>
                    <Label>Teacher for this slot (Required)</Label>
                    <Select
                      value={slotForm.teacherId}
                      onValueChange={(v) => setSlotForm({ ...slotForm, teacherId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                      <SelectContent>
                        {teachers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}{t.designation ? ` · ${t.designation}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>3. Day (1–7)</Label><Input type="number" min={1} max={7} value={slotForm.dayOfWeek} onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: Number(e.target.value) })} /></div>
                    <div><Label>Start time</Label><Input placeholder="09:00" value={slotForm.startTime} onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })} /></div>
                    <div><Label>End time</Label><Input placeholder="09:45" value={slotForm.endTime} onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })} /></div>
                  </div>
                  <div>
                    <Label>4. Room (optional)</Label>
                    <Select
                      value={slotForm.roomId}
                      onValueChange={(v) => setSlotForm({ ...slotForm, roomId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="No room assigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No room assigned</SelectItem>
                        {(rooms ?? []).map((r: { id: string; name: string; campus?: { name: string } }) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}{r.campus ? ` · ${r.campus.name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(rooms ?? []).length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">⚠ No rooms found. Go to the <strong>Rooms</strong> tab to create one first.</p>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => createSlot.mutate()} disabled={!slotForm.subjectOfferingId || !slotFilterSection || !slotForm.teacherId}>
                      Add slot
                    </Button>
                    <Button variant="secondary" onClick={() => publishTimetable.mutate()} disabled={!slotFilterSection}>
                      Publish timetable for section
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-t-4 border-t-emerald-500 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader><CardTitle>Slots (draft + published)</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2 max-h-[400px] overflow-y-auto">
                  {(timetableSlots ?? []).length === 0 ? (
                    <p className="text-gray-400">No slots yet. Add a slot on the left to begin.</p>
                  ) : (
                    (timetableSlots ?? []).map((sl: { id: string; dayOfWeek: number; startTime: string; endTime: string; isPublished: boolean; subjectOffering: { subject: { name: string } }; teacher?: { firstName: string; lastName: string } }) => (
                      <div key={sl.id} className="border border-slate-100 rounded-lg p-3 flex justify-between items-center shadow-sm hover:border-blue-200 transition-colors">
                        <span className="font-medium text-slate-700">
                          <span className="inline-block min-w-[32px] text-slate-500">{DAY_NAMES[sl.dayOfWeek] || `D${sl.dayOfWeek}`}</span>
                          &nbsp;{sl.startTime}–{sl.endTime}
                          &nbsp;<span className="text-blue-600 font-semibold">· {sl.subjectOffering.subject.name}</span>
                          {sl.teacher && <span className="text-slate-400 font-normal"> · {sl.teacher.firstName} {sl.teacher.lastName}</span>}
                        </span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${sl.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {sl.isPublished ? '✓ Published' : 'Draft'}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rooms" className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 mb-4">
            <p className="font-semibold text-slate-900">Rooms are required for timetable scheduling.</p>
            <p className="mt-1">Create named rooms for each campus, then assign them to timetable slots and avoid double-booking conflicts.</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Add room</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Campus</Label>
                  <Select value={roomForm.campusId} onValueChange={(v) => setRoomForm({ ...roomForm, campusId: v })}>
                    <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                    <SelectContent>
                      {(campuses ?? []).map((c: { id: string; name: string }) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Name</Label><Input value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} placeholder="Room 101" /></div>
                <div><Label>Capacity</Label><Input type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} /></div>
                <Button onClick={() => createRoom.mutate()} disabled={!roomForm.campusId || !roomForm.name}>Create room</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Rooms</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={roomCampusFilter} onValueChange={setRoomCampusFilter}>
                  <SelectTrigger><SelectValue placeholder="All campuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All campuses</SelectItem>
                    {(campuses ?? []).map((c: { id: string; name: string }) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="max-h-[360px] overflow-y-auto space-y-2 text-sm">
                  {(rooms ?? []).length === 0 ? (
                    <EmptyState icon={MapPin} title="No rooms created" description="Add a room to assign it to timetable slots and campus schedules." />
                  ) : (
                    (rooms ?? []).map((r: { id: string; name: string; capacity: number; campus?: { name: string } }) => (
                      <div key={r.id} className="border rounded p-2 flex justify-between">
                        <span>{r.name} · {r.campus?.name}</span>
                        <span className="text-gray-500">Cap {r.capacity}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="elective-groups" className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 mb-4">
            <p className="font-semibold text-slate-900">Elective groups let students choose optional subjects.</p>
            <p className="mt-1">Define groups for elective sections, then use them when assigning elective offerings to students.</p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Elective group</CardTitle>
                <CardDescription>For sections with ELECTIVE curriculum mode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={electiveGroupForm.classSectionId}
                  onValueChange={(v) => setElectiveGroupForm({ ...electiveGroupForm, classSectionId: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Class section" /></SelectTrigger>
                  <SelectContent>
                    {(sections ?? [])
                      .filter((s: { curriculumMode?: string }) => s.curriculumMode === 'ELECTIVE')
                      .map((s: { id: string; className: string; sectionName: string; shift?: { name: string; code: string } }) => (
                        <SelectItem key={s.id} value={s.id}>{sectionLabel(s)}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div><Label>Name</Label><Input value={electiveGroupForm.name} onChange={(e) => setElectiveGroupForm({ ...electiveGroupForm, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Min picks</Label><Input type="number" min={0} value={electiveGroupForm.minSelections} onChange={(e) => setElectiveGroupForm({ ...electiveGroupForm, minSelections: Number(e.target.value) })} /></div>
                  <div><Label>Max picks</Label><Input type="number" min={1} value={electiveGroupForm.maxSelections} onChange={(e) => setElectiveGroupForm({ ...electiveGroupForm, maxSelections: Number(e.target.value) })} /></div>
                </div>
                <Button onClick={() => createElectiveGroup.mutate()} disabled={!electiveGroupForm.classSectionId}>Create group</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Groups by section</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={electiveSectionFilter} onValueChange={setElectiveSectionFilter}>
                  <SelectTrigger><SelectValue placeholder="View section" /></SelectTrigger>
                  <SelectContent>
                    {groupByShift(sections ?? []).map((group) => (
                      <SelectGroup key={group.shiftCode}>
                        <SelectLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.shiftLabel}</SelectLabel>
                        {group.sections.map((s: { id: string; className: string; sectionName: string; shift?: { name: string; code: string } }) => (
                          <SelectItem key={s.id} value={s.id}>{sectionLabel(s)}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-2 text-sm max-h-[360px] overflow-y-auto">
                  {electiveSectionFilter ? (
                    (electiveGroups ?? []).length === 0 ? (
                      <EmptyState icon={AlertCircle} title="No elective groups" description="This section does not have any elective groups yet." />
                    ) : (
                      (electiveGroups ?? []).map((g: { id: string; name: string; minSelections: number; maxSelections: number; offerings: Array<{ subject: { name: string } }> }) => (
                        <div key={g.id} className="border rounded p-2">
                          <p className="font-medium">{g.name} (pick {g.minSelections}–{g.maxSelections})</p>
                          <p className="text-gray-500 text-xs">
                            {(g.offerings ?? []).map((o) => o.subject.name).join(', ') || 'No subjects linked yet'}
                          </p>
                        </div>
                      ))
                    )
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                      Select a class section above to view elective groups.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="electives" className="mt-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 mb-4">
            <p className="font-semibold text-slate-900">Approve pending elective requests.</p>
            <p className="mt-1">Review student elective selections and approve them so they are included in timetables and academic records.</p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Pending elective requests</CardTitle>
              <CardDescription>Students choose electives; approve to include in timetable and records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(pendingElectives ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">No pending requests.</p>
              ) : (
                <>
                  {(pendingElectives ?? []).map((row: { id: string; studentEnrollment: { student: { firstName: string; lastName: string }; rollNumber: string }; subjectOffering: { subject: { name: string } } }) => (
                    <div key={row.id} className="flex justify-between items-center border rounded p-3 text-sm">
                      <div>
                        <p className="font-medium">{row.studentEnrollment.student.firstName} {row.studentEnrollment.student.lastName}</p>
                        <p className="text-gray-500">Roll {row.studentEnrollment.rollNumber} · {row.subjectOffering.subject.name}</p>
                      </div>
                    </div>
                  ))}
                  <Button
                    onClick={() => approveElectives.mutate((pendingElectives ?? []).map((r: { id: string }) => r.id))}
                    disabled={!(pendingElectives ?? []).length}
                  >
                    Approve all pending
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grading" className="mt-4">
          {!activeYear ? (
            <Card><CardContent className="pt-6 text-sm text-amber-700">Activate an academic year first.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {/* Guide Banner */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold mb-1">📊 How to set up Grading &amp; publish Results</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><strong>Step 1 — Create a Scheme:</strong> Select a Class Section and Subject, give it a name (e.g. &quot;Standard Assessment Plan&quot;), then click <em>Create scheme</em>. The system auto-creates 5 weighted components: Quiz 10%, Assignment 10%, Activity 10%, Midterm 30%, Final 40%.</li>
                  <li><strong>Step 2 — Add Assessments:</strong> Under &quot;Add assessment to component&quot;, select your new scheme, pick the component (e.g. Quiz), enter a title (e.g. &quot;Quiz 1&quot;) and due date, then click <em>Add assessment</em>. Repeat for each exam or quiz.</li>
                  <li><strong>Step 3 — Teachers Enter Marks:</strong> Teachers use the Teacher Portal to enter marks against each assessment you have defined here.</li>
                  <li><strong>Step 4 — Publish Results:</strong> On the right panel, find the scheme and click <em>Publish</em>. This releases the final results so students and parents can view their report cards. <strong>This action is irreversible while the year is active.</strong></li>
                </ol>
              </div>
              <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Create grading scheme</CardTitle>
                  <CardDescription>
                    Auto-generates 5 weighted components: Quiz 10% · Assignment 10% · Activity 10% · Midterm 30% · Final 40%
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Select value={gradingSectionId} onValueChange={setGradingSectionId}>
                    <SelectTrigger><SelectValue placeholder="1. Choose class section" /></SelectTrigger>
                    <SelectContent>
                      {groupByShift(sections ?? []).map((group) => (
                        <SelectGroup key={group.shiftCode}>
                          <SelectLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400">{group.shiftLabel}</SelectLabel>
                          {group.sections.map((s: { id: string; className: string; sectionName: string; shift?: { name: string; code: string } }) => (
                            <SelectItem key={s.id} value={s.id}>{sectionLabel(s)}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={gradingForm.subjectId} onValueChange={(v) => setGradingForm({ ...gradingForm, subjectId: v })}>
                    <SelectTrigger><SelectValue placeholder="2. Choose subject" /></SelectTrigger>
                    <SelectContent>
                      {(subjects ?? []).map((s: { id: string; name: string }) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div>
                    <Label>3. Scheme name</Label>
                    <Input placeholder="e.g. Standard Assessment Plan" value={gradingForm.name} onChange={(e) => setGradingForm({ ...gradingForm, name: e.target.value })} />
                  </div>
                  <Button
                    onClick={() => createGradingScheme.mutate()}
                    disabled={!gradingSectionId || !gradingForm.subjectId || createGradingScheme.isPending}
                  >
                    Create scheme
                  </Button>

                  <hr className="my-4" />

                  <p className="text-sm font-semibold">4. Add assessment to a component</p>
                  <Select
                    value={assessmentForm.schemeId}
                    onValueChange={(v) => setAssessmentForm({ ...assessmentForm, schemeId: v, gradingComponentId: '' })}
                  >
                    <SelectTrigger><SelectValue placeholder="Grading scheme" /></SelectTrigger>
                    <SelectContent>
                      {(gradingSchemes ?? []).map((s: { id: string; name: string; subject: { name: string } }) => (
                        <SelectItem key={s.id} value={s.id}>{s.subject.name} — {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assessmentForm.schemeId && (
                    <Select
                      value={assessmentForm.gradingComponentId}
                      onValueChange={(v) => setAssessmentForm({ ...assessmentForm, gradingComponentId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Component" /></SelectTrigger>
                      <SelectContent>
                        {(gradingSchemes ?? [])
                          .find((s: { id: string }) => s.id === assessmentForm.schemeId)
                          ?.components?.map((c: { id: string; name: string; weightPercentage: number }) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.weightPercentage}%)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    placeholder="Assessment title e.g. Quiz 1"
                    value={assessmentForm.title}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, title: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={assessmentForm.dueDate}
                    onChange={(e) => setAssessmentForm({ ...assessmentForm, dueDate: e.target.value })}
                  />
                  <Button
                    variant="outline"
                    onClick={() => addAssessment.mutate()}
                    disabled={!assessmentForm.schemeId || !assessmentForm.gradingComponentId || !assessmentForm.title}
                  >
                    Add assessment
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Schemes &amp; publish</CardTitle>
                  <CardDescription>Select a section on the left to see its schemes. Click <strong>Publish</strong> to release grades.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm max-h-[520px] overflow-y-auto">
                  {(gradingSchemes ?? []).length === 0 ? (
                    <p className="text-gray-400">Select a class section on the left to view its grading schemes.</p>
                  ) : (
                    (gradingSchemes ?? []).map((s: {
                      id: string
                      name: string
                      isPublished: boolean
                      subject: { name: string }
                      components: Array<{ id: string; name: string; weightPercentage: number; assessments: Array<{ id: string; title: string }> }>
                    }) => (
                      <div key={s.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">{s.subject.name}</p>
                            <p className="text-gray-500 text-xs">{s.name}</p>
                          </div>
                          {!s.isPublished ? (
                            <Button size="sm" onClick={() => publishScheme.mutate(s.id)}>
                              Publish Results
                            </Button>
                          ) : (
                            <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-1 rounded-full">✓ Published</span>
                          )}
                        </div>
                        {s.components.map((c) => (
                          <div key={c.id} className="pl-2 border-l-2 border-gray-200">
                            <p className="text-xs font-semibold text-gray-700">{c.name} <span className="text-gray-400 font-normal">({c.weightPercentage}%)</span></p>
                            <ul className="text-xs text-gray-500 list-disc pl-4">
                              {c.assessments.length === 0 ? (
                                <li className="italic">No assessments added yet</li>
                              ) : (
                                c.assessments.map((a) => <li key={a.id}>{a.title}</li>)
                              )}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="migration" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Legacy → Academic Engine</CardTitle>
              <CardDescription>
                Copies legacy classes, student placements, and subjects into class sections and enrollments for the{' '}
                <strong>{migrationStatus?.academicYear?.name ?? 'active'}</strong> year. Legacy data is not deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="rounded border p-3">
                  <p className="text-gray-500">Legacy classes</p>
                  <p className="text-xl font-semibold">{migrationStatus?.legacyActiveClasses ?? '—'}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-gray-500">Students on legacy class</p>
                  <p className="text-xl font-semibold">{migrationStatus?.legacyStudentsWithClass ?? '—'}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-gray-500">Pending engine enrollment</p>
                  <p className="text-xl font-semibold text-amber-700">
                    {migrationStatus?.studentsPendingEnrollment ?? '—'}
                  </p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-gray-500">Engine sections</p>
                  <p className="text-xl font-semibold">{migrationStatus?.engineSections ?? '—'}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-gray-500">Enrollments (active year)</p>
                  <p className="text-xl font-semibold">{migrationStatus?.engineEnrollmentsForYear ?? '—'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={migrateOpts.migrateTimetable}
                    onChange={(e) =>
                      setMigrateOpts((o) => ({ ...o, migrateTimetable: e.target.checked }))
                    }
                  />
                  Also migrate legacy timetable slots (requires subject offerings)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={migrateOpts.migrateAttendance}
                    onChange={(e) =>
                      setMigrateOpts((o) => ({ ...o, migrateAttendance: e.target.checked }))
                    }
                  />
                  Migrate legacy attendance (up to 5,000 recent records)
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={migrateLegacy.isPending}
                  onClick={() => migrateLegacy.mutate(true)}
                >
                  {migrateLegacy.isPending ? 'Running…' : 'Dry run'}
                </Button>
                <Button
                  disabled={migrateLegacy.isPending || !migrationStatus?.academicYear}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Migrate legacy classes and enrollments into the academic engine for the active year?'
                      )
                    ) {
                      return
                    }
                    migrateLegacy.mutate(false)
                  }}
                >
                  Run migration
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                CLI: <code className="bg-gray-100 px-1 rounded">npm run db:migrate:academic:dry</code> then{' '}
                <code className="bg-gray-100 px-1 rounded">npm run db:migrate:academic</code>
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </div>
      </Tabs>
    </div>
  )
}
