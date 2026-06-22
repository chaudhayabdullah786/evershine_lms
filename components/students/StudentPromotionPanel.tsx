'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowUpCircle, Loader2, Wand2, ExternalLink } from 'lucide-react'
import { notify } from '@/lib/notify'
import Link from 'next/link'
import type { StudentEnrollmentRow } from './StudentEnrollmentsPanel'

interface Props {
  studentId: string
  studentName: string
  enrollments: StudentEnrollmentRow[]
  canManage?: boolean
}

export function StudentPromotionPanel({
  studentId,
  studentName,
  enrollments,
  canManage = false,
}: Props) {
  const qc = useQueryClient()
  const activeEnrollments = enrollments.filter((e) => e.status === 'ACTIVE')

  const [fromEnrollmentId, setFromEnrollmentId] = useState('')
  const [toYearId, setToYearId] = useState('')
  const [toSectionId, setToSectionId] = useState('')
  const [status, setStatus] = useState<'PROMOTED' | 'RETAINED' | 'GRADUATED'>('PROMOTED')

  const defaultFromId = useMemo(() => activeEnrollments[0]?.id ?? '', [activeEnrollments])
  const effectiveFromId = fromEnrollmentId || defaultFromId
  const fromEnrollment = activeEnrollments.find((e) => e.id === effectiveFromId)

  const { data: yearsRaw } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => fetchApi<Array<{ id: string; name: string; isLocked: boolean }>>('/api/academic-years'),
    enabled: canManage,
  })
  const years = Array.isArray(yearsRaw) ? yearsRaw : (yearsRaw as { data?: typeof yearsRaw })?.data ?? []

  const { data: sectionsRaw } = useQuery({
    queryKey: ['class-sections-promo'],
    queryFn: () =>
      fetchApi<Array<{ id: string; className: string; sectionName: string; batch: { code: string } }>>(
        '/api/class-sections'
      ),
    enabled: canManage,
  })
  const sections = Array.isArray(sectionsRaw) ? sectionsRaw : (sectionsRaw as { data?: typeof sectionsRaw })?.data ?? []

  const promoteMutation = useMutation({
    mutationFn: () => {
      if (!fromEnrollment) throw new Error('Select a source enrollment')
      return fetchApi('/api/promotions', {
        method: 'POST',
        body: JSON.stringify({
          fromAcademicYearId: fromEnrollment.academicYear.id,
          toAcademicYearId: status === 'GRADUATED' ? undefined : toYearId,
          fromClassSectionId: fromEnrollment.classSection.id,
          toClassSectionId:
            status === 'GRADUATED' ? undefined : status === 'RETAINED' ? fromEnrollment.classSection.id : toSectionId,
          studentIds: [studentId],
          status,
          remarks: `Single-student promotion from profile: ${studentName}`,
        }),
      })
    },
    onSuccess: () => {
      notify.success('Promotion recorded')
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      qc.invalidateQueries({ queryKey: ['student-enrollments', studentId] })
    },
    onError: (err: Error) => notify.error(err.message || 'Promotion failed'),
  })

  const suggestMutation = useMutation({
    mutationFn: async () => {
      const enr = activeEnrollments.find((e) => e.id === effectiveFromId)
      if (!enr) throw new Error('Select enrollment first')
      const raw = await fetchApi<{
        rows: Array<{
          studentId: string
          suggestedStatus: 'PROMOTED' | 'RETAINED' | 'GRADUATED'
          suggestedToSectionId: string | null
        }>
      }>(
        `/api/promotions/suggest?fromAcademicYearId=${enr.academicYear.id}&fromClassSectionId=${enr.classSection.id}`
      )
      const payload = (raw as { data?: typeof raw }).data ?? raw
      const match = payload.rows?.find((r) => r.studentId === studentId)
      if (!match) throw new Error('No suggestion for this student in this section')
      setStatus(match.suggestedStatus)
      if (match.suggestedToSectionId) setToSectionId(match.suggestedToSectionId)
    },
    onSuccess: () => notify.success('Suggestion applied'),
    onError: (err: Error) => notify.error(err.message || 'Could not load suggestion'),
  })

  if (!canManage) return null
  if (activeEnrollments.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 text-xs text-gray-500">
          No active enrollments — assign a section before promotion.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-violet-200 bg-violet-50/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-violet-900">
          <ArrowUpCircle className="w-4 h-4" />
          Year-end promotion
        </CardTitle>
        <CardDescription className="text-xs">
          Promote, retain, or graduate this student for a specific section enrollment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">From enrollment</Label>
          <Select value={effectiveFromId} onValueChange={setFromEnrollmentId}>
            <SelectTrigger className="h-9 text-sm bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeEnrollments.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.academicYear.name} · {e.classSection.className}-{e.classSection.sectionName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROMOTED">Promoted</SelectItem>
                <SelectItem value="RETAINED">Retained</SelectItem>
                <SelectItem value="GRADUATED">Graduated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status !== 'GRADUATED' && (
            <div className="space-y-1">
              <Label className="text-xs">Target year</Label>
              <Select value={toYearId} onValueChange={setToYearId}>
                <SelectTrigger className="h-9 text-sm bg-white"><SelectValue placeholder="Select year" /></SelectTrigger>
                <SelectContent>
                  {years.filter((y) => !y.isLocked).map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {status === 'PROMOTED' && (
          <div className="space-y-1">
            <Label className="text-xs">Target section</Label>
            <Select value={toSectionId} onValueChange={setToSectionId}>
              <SelectTrigger className="h-9 text-sm bg-white"><SelectValue placeholder="Next class section" /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.className}-{s.sectionName} · {s.batch.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            disabled={!effectiveFromId || suggestMutation.isPending}
            onClick={() => suggestMutation.mutate()}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto-suggest
          </Button>
          <Button
            size="sm"
            className="gap-1 text-xs bg-violet-600 hover:bg-violet-700"
            disabled={
              promoteMutation.isPending ||
              !effectiveFromId ||
              (status !== 'GRADUATED' && !toYearId) ||
              (status === 'PROMOTED' && !toSectionId)
            }
            onClick={() => promoteMutation.mutate()}
          >
            {promoteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply promotion'}
          </Button>
          <Link
            href={
              fromEnrollment
                ? `/dashboard/promotions?studentId=${studentId}&fromYearId=${fromEnrollment.academicYear.id}&fromSectionId=${fromEnrollment.classSection.id}`
                : `/dashboard/promotions?studentId=${studentId}`
            }
          >
            <Button size="sm" variant="ghost" className="gap-1 text-xs">
              <ExternalLink className="w-3.5 h-3.5" />
              Bulk wizard
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
