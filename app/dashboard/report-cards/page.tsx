'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { generateAcademicReportCard } from '@/lib/pdf'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccessDenied } from '@/components/AccessDenied'
import { notify } from '@/lib/notify'
import { FileText, Download, Loader2 } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

type ReportCardPayload = {
  studentName: string
  fatherName: string
  className: string
  rollNo: string
  registrationNumber: string
  session: string
  subjects: Array<{ subject: string; marks: number; maxMarks: number; grade: string; status: string }>
  totalObtained: number
  totalPossible: number
  percentage: number
  overallGrade: string
  attendancePct: number | null
}

type ClassExport = {
  enrollmentId: string
} & ReportCardPayload

export default function ReportCardsPage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role

  const [yearId, setYearId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data: years } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => fetchApi<Array<{ id: string; name: string }>>('/api/academic-years'),
    enabled: role === 'SUPER_ADMIN' || role === 'ADMIN',
  })

  const { data: sections } = useQuery({
    queryKey: ['class-sections'],
    queryFn: () => fetchApi<Array<{ id: string; className: string; sectionName: string }>>('/api/class-sections'),
    enabled: role === 'SUPER_ADMIN' || role === 'ADMIN',
  })

  const { data: classCards, isFetching, refetch } = useQuery({
    queryKey: ['report-cards-class', yearId, sectionId],
    queryFn: () =>
      fetchApi<{ count: number; cards: ClassExport[] }>(
        `/api/report-cards?academicYearId=${yearId}&classSectionId=${sectionId}`
      ),
    enabled: false,
  })

  if (status === 'loading') return null
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <AccessDenied title="Report cards" message="Administrators generate academic report cards here." />
  }

  async function downloadCard(card: ReportCardPayload, enrollmentId?: string) {
    const key = enrollmentId ?? card.registrationNumber
    setDownloadingId(key)
    try {
      await generateAcademicReportCard({
        studentName: card.studentName,
        className: card.className,
        rollNo: card.rollNo,
        registrationNumber: card.registrationNumber,
        session: card.session,
        subjects: card.subjects.map((s) => ({
          subject: s.subject,
          marks: s.marks,
          maxMarks: s.maxMarks,
          grade: s.grade,
        })),
        totalObtained: card.totalObtained,
        percentage: card.percentage,
        overallGrade: card.overallGrade,
        attendancePct: card.attendancePct,
      })
      notify.success(`Downloaded ${card.studentName}`)
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'PDF failed')
    } finally {
      setDownloadingId(null)
    }
  }

  async function downloadAll() {
    if (!classCards?.cards?.length) return
    for (const card of classCards.cards) {
      await downloadCard(card, card.enrollmentId)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-7 h-7 text-indigo-600" />
          Report cards
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          PDF result cards from published grading schemes in the academic engine.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class export</CardTitle>
          <CardDescription>Select year and section, then preview or download PDFs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Academic year</Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  {(years ?? []).map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class section</Label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  {(sections ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.className}-{s.sectionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!yearId || !sectionId || isFetching}
              onClick={() => refetch()}
              className="gap-2"
            >
              {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Load class results
            </Button>
            <Button
              variant="outline"
              disabled={!classCards?.cards?.length || !!downloadingId}
              onClick={downloadAll}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Download all ({classCards?.count ?? 0})
            </Button>
          </div>

          {classCards && classCards.count === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              No students with published results in this section. Publish grading schemes first.
            </p>
          )}

          {(classCards?.cards ?? []).length > 0 && (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead>%</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Attendance</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classCards!.cards.map((card) => (
                    <TableRow key={card.enrollmentId}>
                      <TableCell className="font-medium">{card.studentName}</TableCell>
                      <TableCell>{card.rollNo}</TableCell>
                      <TableCell>{card.percentage}%</TableCell>
                      <TableCell>
                        <Badge>{card.overallGrade}</Badge>
                      </TableCell>
                      <TableCell>
                        {card.attendancePct != null ? `${card.attendancePct}%` : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={downloadingId === card.enrollmentId}
                          onClick={() => downloadCard(card, card.enrollmentId)}
                        >
                          {downloadingId === card.enrollmentId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
