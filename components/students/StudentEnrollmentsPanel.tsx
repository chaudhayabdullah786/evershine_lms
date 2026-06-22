'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, Plus, Loader2 } from 'lucide-react'
import { notify } from '@/lib/notify'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import Link from 'next/link'

export interface StudentEnrollmentRow {
  id: string
  rollNumber: string
  status: string
  deliveryMode: string
  academicYear: { id: string; name: string; isActive: boolean; isLocked: boolean }
  classSection: {
    id: string
    className: string
    sectionName: string
    grade?: number | null
    campus: { name: string; code: string }
    batch: { name: string; code: string }
    shift: { code: SessionShift; name: string; startTime: string; endTime: string }
  }
  subjectEnrollments?: Array<{
    subjectOffering: { subject: { name: string; code: string } }
  }>
}

interface ClassSectionOption {
  id: string
  className: string
  sectionName: string
  grade?: number
  campus: { code: string }
  batch: { code: string }
  shift: { code: SessionShift; name: string }
}

interface Props {
  studentId: string
  campusId: string
  batchId?: string
  canManage?: boolean
  compact?: boolean
}

export function StudentEnrollmentsPanel({
  studentId,
  campusId,
  batchId,
  canManage = false,
  compact = false,
}: Props) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [classSectionId, setClassSectionId] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<'PHYSICAL' | 'ONLINE' | 'HYBRID'>('PHYSICAL')

  const { data: enrollmentsRaw, isLoading } = useQuery({
    queryKey: ['student-enrollments', studentId],
    queryFn: () => fetchApi<StudentEnrollmentRow[]>(`/api/students/${studentId}/enrollments`),
  })

  const enrollments = Array.isArray(enrollmentsRaw)
    ? enrollmentsRaw
    : (enrollmentsRaw as { data?: StudentEnrollmentRow[] })?.data ?? []

  const { data: sectionsRaw } = useQuery({
    queryKey: ['class-sections', campusId, batchId],
    queryFn: () => {
      const params = new URLSearchParams({ campusId })
      if (batchId) params.set('batchId', batchId)
      return fetchApi<ClassSectionOption[]>(`/api/class-sections?${params}`)
    },
    enabled: showAdd && !!campusId,
  })

  const sections = Array.isArray(sectionsRaw)
    ? sectionsRaw
    : (sectionsRaw as { data?: ClassSectionOption[] })?.data ?? []

  const addMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/students/${studentId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({ classSectionId, rollNumber, deliveryMode }),
      }),
    onSuccess: () => {
      notify.success('Section enrollment added')
      qc.invalidateQueries({ queryKey: ['student-enrollments', studentId] })
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      setShowAdd(false)
      setClassSectionId('')
      setRollNumber('')
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to add enrollment'),
  })

  const active = enrollments.filter((e) => e.status === 'ACTIVE')

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              Academic Engine Enrollments
            </CardTitle>
            <CardDescription className="text-xs">
              Active-year section placements (supports multiple shifts per student).
            </CardDescription>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="w-3.5 h-3.5" />
              Add section
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && canManage && (
          <div className="p-3 rounded-lg border bg-indigo-50/50 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Class section</Label>
              <Select value={classSectionId} onValueChange={setClassSectionId}>
                <SelectTrigger className="h-9 text-sm bg-white">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.className}-{s.sectionName} · {s.shift.name} · {s.campus.code}/{s.batch.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Roll number</Label>
                <Input className="h-9 text-sm bg-white" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Delivery</Label>
                <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as typeof deliveryMode)}>
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHYSICAL">Physical</SelectItem>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!classSectionId || !rollNumber || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save enrollment'}
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-gray-400">Loading enrollments…</p>
        ) : active.length === 0 ? (
          <p className="text-xs text-gray-500">
            No active section enrollments. Use{' '}
            <Link href="/dashboard/academic" className="text-blue-600 underline">
              Academic Engine
            </Link>{' '}
            or add a section above.
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((e) => {
              const shift = e.classSection.shift.code
              return (
                <li key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border bg-gray-50/80">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {e.classSection.className} — Section {e.classSection.sectionName}
                      <span className="text-gray-400 font-normal ml-1">· Roll {e.rollNumber}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {e.academicYear.name} · {e.classSection.campus.code} · {e.classSection.batch.name} · {e.deliveryMode}
                    </p>
                    {e.subjectEnrollments && e.subjectEnrollments.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {e.subjectEnrollments.length} subject(s) enrolled
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${SESSION_SHIFT_BADGE_CLASS[shift]}`}>
                      {SESSION_SHIFT_LABELS[shift]}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {e.status}
                    </Badge>
                    <Link href={`/dashboard/attendance/sections?sectionId=${e.classSection.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs h-7">
                        Attendance
                      </Button>
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {enrollments.some((e) => e.status !== 'ACTIVE') && !compact && (
          <p className="text-[10px] text-gray-400 pt-1 border-t">
            {enrollments.length - active.length} historical enrollment(s) on record.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
