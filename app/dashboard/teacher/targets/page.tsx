'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { notify } from '@/lib/notify'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Save, Target, Info, CheckCircle2, ArrowUpRight,
  Users, Sparkles
} from 'lucide-react'

// ─── Grade Configuration (Pakistani Board Standard) ─────────────────────────
// WHY defined here: Centralises the grade → percentage mapping for both the
// dropdown selector and the auto-calculated min/max values sent to the API.
const GRADE_OPTIONS = [
  { grade: 'A+', label: 'A+ (90–100%)', min: 90, max: 100 },
  { grade: 'A',  label: 'A (80–89%)',   min: 80, max: 89 },
  { grade: 'B',  label: 'B (70–79%)',   min: 70, max: 79 },
  { grade: 'C',  label: 'C (60–69%)',   min: 60, max: 69 },
  { grade: 'D',  label: 'D (50–59%)',   min: 50, max: 59 },
  { grade: 'F',  label: 'F (Below 50%)', min: 0, max: 49 },
] as const

type GradeKey = typeof GRADE_OPTIONS[number]['grade']

interface ClassSection {
  id: string
  className: string
  sectionName: string
}

interface SubjectOffering {
  id: string
  subjectName: string
  subjectCode: string
}

interface StudentTarget {
  subjectOfferingId: string
  subjectName: string
  subjectCode: string
  targetGrade: string | null
  minPercentage: number | null
  maxPercentage: number | null
}

interface StudentRow {
  studentId: string
  rollNumber: string
  name: string
  registrationNumber: string
  targets: StudentTarget[]
}

interface TargetsData {
  classSectionId: string
  offerings: SubjectOffering[]
  students: StudentRow[]
}

export default function TeacherTargetsPage() {
  const queryClient = useQueryClient()
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')

  // Local editing state: studentId:subjectOfferingId → grade
  const [editState, setEditState] = useState<Record<string, GradeKey | ''>>({})
  const [bulkGrade, setBulkGrade] = useState<GradeKey | ''>('')

  // Fetch teacher's sections
  const { data: sections = [], isLoading: isLoadingSections } = useQuery<ClassSection[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi<ClassSection[]>('/api/teacher-portal/sections'),
  })

  // Fetch targets for selected section
  const { data: targetsData, isLoading: isLoadingTargets, refetch } = useQuery<TargetsData>({
    queryKey: ['teacher-targets', selectedSectionId],
    queryFn: () =>
      fetchApi<TargetsData>(`/api/teacher-portal/targets?classSectionId=${selectedSectionId}`),
    enabled: !!selectedSectionId,
  })

  // Initialise edit state from fetched data when it loads
  // WHY useEffect-free: We populate from the query data on every successful fetch.
  // If the user hasn't edited yet, editState is empty and we fall through to the
  // DB value. This prevents stale state after a refetch.
  const getGradeForCell = (studentId: string, subjectOfferingId: string): GradeKey | '' => {
    const key = `${studentId}:${subjectOfferingId}`
    if (editState[key] !== undefined) return editState[key]

    // Find from loaded data
    const student = targetsData?.students.find((s) => s.studentId === studentId)
    const target = student?.targets.find((t) => t.subjectOfferingId === subjectOfferingId)
    return (target?.targetGrade as GradeKey) || ''
  }

  const handleGradeChange = (studentId: string, subjectOfferingId: string, grade: GradeKey | '') => {
    setEditState((prev) => ({
      ...prev,
      [`${studentId}:${subjectOfferingId}`]: grade,
    }))
  }

  const handleBulkAssign = () => {
    if (!bulkGrade || !targetsData) return
    const newState: Record<string, GradeKey | ''> = {}
    targetsData.students.forEach((student) => {
      targetsData.offerings.forEach((off) => {
        newState[`${student.studentId}:${off.id}`] = bulkGrade
      })
    })
    setEditState(newState)
    notify.success(`All students set to target grade: ${bulkGrade}`)
  }

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi('/api/teacher-portal/targets', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data: any) => {
      notify.success(data?.message || 'Targets saved successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-targets', selectedSectionId] })
      setEditState({}) // Clear edits on success
      refetch()
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to save targets')
    },
  })

  const handleSave = () => {
    if (!targetsData || !selectedSectionId) return

    // Collect all cells that have a grade assigned
    const targets: Array<{
      studentId: string
      subjectOfferingId: string
      targetGrade: string
      minPercentage: number
      maxPercentage: number
    }> = []

    targetsData.students.forEach((student) => {
      targetsData.offerings.forEach((off) => {
        const grade = getGradeForCell(student.studentId, off.id)
        if (grade) {
          const gradeConfig = GRADE_OPTIONS.find((g) => g.grade === grade)
          if (gradeConfig) {
            targets.push({
              studentId: student.studentId,
              subjectOfferingId: off.id,
              targetGrade: grade,
              minPercentage: gradeConfig.min,
              maxPercentage: gradeConfig.max,
            })
          }
        }
      })
    })

    if (targets.length === 0) {
      notify.error('No targets to save. Please assign at least one target grade.')
      return
    }

    saveMutation.mutate({
      classSectionId: selectedSectionId,
      targets,
    })
  }

  const selectedSection = sections.find((s) => s.id === selectedSectionId)
  const totalStudents = targetsData?.students.length ?? 0
  const assignedCount = targetsData?.students.filter((s) =>
    s.targets.some((t) => getGradeForCell(s.studentId, t.subjectOfferingId) !== '')
  ).length ?? 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" />
            Student Target Assignment
          </h1>
          <p className="text-sm text-gray-500">
            Set academic performance targets for students. Targets are visible on their portal.
          </p>
        </div>
      </div>

      {/* Section Selector */}
      <Card className="border-indigo-100 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Class Section
              </label>
              {isLoadingSections ? (
                <div className="h-10 bg-gray-100 rounded-md animate-pulse" />
              ) : (
                <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                  <SelectTrigger className="w-full border-gray-200">
                    <SelectValue placeholder="Select a class section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.className} - {s.sectionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Bulk Assign */}
            {targetsData && targetsData.students.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Bulk Assign Target (All Students)
                </label>
                <div className="flex gap-2">
                  <Select value={bulkGrade} onValueChange={(v) => setBulkGrade(v as GradeKey)}>
                    <SelectTrigger className="flex-1 border-gray-200">
                      <SelectValue placeholder="Select grade for all" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_OPTIONS.map((g) => (
                        <SelectItem key={g.grade} value={g.grade}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="default"
                    onClick={handleBulkAssign}
                    disabled={!bulkGrade}
                    className="gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    <Users className="w-4 h-4" />
                    Apply All
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {!selectedSectionId ? (
        <Card className="p-8 text-center border-dashed border-gray-300">
          <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Select a class section to load enrolled students and assign targets.
          </p>
        </Card>
      ) : isLoadingTargets ? (
        <div className="flex flex-col items-center gap-2 text-gray-500 py-16 justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-sm">Loading students and targets...</span>
        </div>
      ) : !targetsData || targetsData.students.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">No active students enrolled in this section.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-slate-50/50 border-slate-100">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-slate-600">Total Students</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{totalStudents}</p>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50/50 border-indigo-100">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-indigo-700">Targets Assigned</p>
                <p className="text-xl font-bold text-indigo-900 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  {assignedCount}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-amber-50/50 border-amber-100">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-amber-700">Subjects</p>
                <p className="text-xl font-bold text-amber-900 mt-1">
                  {targetsData.offerings.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Target Assignment Table */}
          <Card className="shadow-sm border-gray-200 overflow-hidden">
            <CardHeader className="bg-gray-50 border-b py-4 px-6">
              <CardTitle className="text-base text-gray-900 flex justify-between items-center">
                <span className="flex items-center gap-2 font-semibold">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Target Assignment Sheet
                </span>
                <span className="text-xs font-normal text-gray-500">
                  {selectedSection?.className} - {selectedSection?.sectionName}
                </span>
              </CardTitle>
              <CardDescription>
                Assign target grades per student per subject. Students will see these targets on their portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-full divide-y divide-gray-200">
                <TableHeader className="bg-gray-100/75">
                  <TableRow>
                    <TableHead className="w-[60px] font-bold text-center">S.No</TableHead>
                    <TableHead className="w-[100px] font-bold text-center">Roll No</TableHead>
                    <TableHead className="font-bold min-w-[180px]">Student Name</TableHead>
                    {targetsData.offerings.map((off) => (
                      <TableHead
                        key={off.id}
                        className="font-bold text-center min-w-[140px]"
                      >
                        {off.subjectName}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-200">
                  {targetsData.students.map((student, idx) => (
                    <TableRow
                      key={student.studentId}
                      className="hover:bg-gray-50/50"
                    >
                      <TableCell className="text-center font-medium text-sm text-gray-600">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="text-center font-mono font-medium text-sm text-gray-600">
                        {student.rollNumber}
                      </TableCell>
                      <TableCell className="font-semibold text-gray-900">
                        {student.name}
                      </TableCell>
                      {targetsData.offerings.map((off) => {
                        const currentGrade = getGradeForCell(student.studentId, off.id)
                        const gradeConfig = GRADE_OPTIONS.find((g) => g.grade === currentGrade)

                        return (
                          <TableCell key={off.id} className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Select
                                value={currentGrade}
                                onValueChange={(v) =>
                                  handleGradeChange(
                                    student.studentId,
                                    off.id,
                                    v as GradeKey
                                  )
                                }
                              >
                                <SelectTrigger className="w-[120px] mx-auto text-center border-gray-200 h-8 text-xs">
                                  <SelectValue placeholder="Set target" />
                                </SelectTrigger>
                                <SelectContent>
                                  {GRADE_OPTIONS.map((g) => (
                                    <SelectItem key={g.grade} value={g.grade}>
                                      {g.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {gradeConfig && (
                                <span className="text-[10px] text-gray-400">
                                  {gradeConfig.min}–{gradeConfig.max}%
                                </span>
                              )}
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Targets
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
