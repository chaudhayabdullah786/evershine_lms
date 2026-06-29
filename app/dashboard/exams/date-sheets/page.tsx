'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'
import { fetchApi } from '@/lib/api-client'
import { AccessDenied } from '@/components/AccessDenied'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Trash2, Calendar } from 'lucide-react'

type Section = { id: string; className: string; sectionName: string }
type ExamSession = { id: string; name: string; term: string }
type Offering = { id: string; subject: { name: string; code: string } }
type DateSheetSlot = {
  id?: string
  subjectOfferingId: string
  examDate: string
  startTime: string
  endTime: string
  roomNumber: string
}

type DateSheetResponse = {
  title: string
  slots: Array<{
    id: string
    subjectOfferingId: string
    examDate: string
    startTime: string
    endTime: string
    roomNumber: string | null
    subjectOffering: { subject: { name: string; code: string } }
  }>
}

const EMPTY_SLOT: DateSheetSlot = {
  id: '',
  subjectOfferingId: '',
  examDate: '',
  startTime: '',
  endTime: '',
  roomNumber: '',
}

export default function ExamDateSheetsPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()

  const [classSectionId, setClassSectionId] = useState('')
  const [examSessionId, setExamSessionId] = useState('')
  const [title, setTitle] = useState('')
  const [slots, setSlots] = useState<DateSheetSlot[]>([EMPTY_SLOT])

  const isTeacher = session?.user?.role === 'TEACHER'

  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi<Section[]>('/api/teacher-portal/sections'),
    enabled: isTeacher,
  })

  const { data: examSessions = [] } = useQuery<ExamSession[]>({
    queryKey: ['exam-sessions'],
    queryFn: () => fetchApi<ExamSession[]>('/api/exam-sessions'),
    enabled: !!session?.user,
  })

  const { data: offerings = [] } = useQuery<Offering[]>({
    queryKey: ['date-sheet-offerings', classSectionId],
    queryFn: () => fetchApi<Offering[]>(`/api/teacher-portal/sections/${classSectionId}/offerings`),
    enabled: !!classSectionId,
  })

  const { data: dateSheet, isFetching: isFetchingSheet } = useQuery<DateSheetResponse | null>({
    queryKey: ['date-sheet', classSectionId, examSessionId],
    queryFn: () => fetchApi<DateSheetResponse | null>(`/api/academic-upgrades/date-sheets?classSectionId=${classSectionId}&examSessionId=${examSessionId}`),
    enabled: !!classSectionId && !!examSessionId,
  })

  useEffect(() => {
    if (!classSectionId || !examSessionId || dateSheet === undefined) return
    if (!dateSheet) {
      setTitle('')
      setSlots([EMPTY_SLOT])
      return
    }

    setTitle(dateSheet.title)
    setSlots(dateSheet.slots.map((slot) => ({
      id: slot.id,
      subjectOfferingId: slot.subjectOfferingId,
      examDate: slot.examDate.split('T')[0],
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomNumber: slot.roomNumber ?? '',
    })))
  }, [classSectionId, examSessionId, dateSheet])

  const handleSectionChange = (value: string) => {
    setClassSectionId(value)
    if (!value) {
      setTitle('')
      setSlots([EMPTY_SLOT])
    }
  }

  const handleExamSessionChange = (value: string) => {
    setExamSessionId(value)
    if (!value) {
      setTitle('')
      setSlots([EMPTY_SLOT])
    }
  }

  const saveDateSheet = useMutation({
    mutationFn: () =>
      fetchApi('/api/academic-upgrades/date-sheets', {
        method: 'POST',
        body: JSON.stringify({
          classSectionId,
          examSessionId,
          title,
          slots: slots.map((slot) => ({
            subjectOfferingId: slot.subjectOfferingId,
            examDate: slot.examDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            roomNumber: slot.roomNumber || undefined,
          })),
        }),
      }),
    onSuccess: () => {
      notify.success('Date sheet published successfully')
      qc.invalidateQueries({ queryKey: ['date-sheet', classSectionId, examSessionId] })
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to save date sheet'),
  })

  const addSlot = () => setSlots((prev) => [...prev, { ...EMPTY_SLOT }])

  const updateSlot = (index: number, field: keyof DateSheetSlot, value: string) => {
    setSlots((prev) => prev.map((slot, idx) => idx === index ? { ...slot, [field]: value } : slot))
  }

  const removeSlot = (index: number) => {
    setSlots((prev) => prev.filter((_, idx) => idx !== index))
  }

  const hasOfferings = offerings.length > 0
  const isValidForm =
    !!title.trim() &&
    slots.length > 0 &&
    slots.every((slot) => slot.subjectOfferingId && slot.examDate && slot.startTime && slot.endTime)

  if (status === 'loading') return null
  if (!session?.user) return <AccessDenied title="Exam Date Sheets" message="Please sign in to view exam schedules." />
  if (!isTeacher) return <AccessDenied title="Exam Date Sheets" message="This page is available to teachers only." />

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Calendar className="w-6 h-6 text-indigo-600" />
            Exam Date Sheets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View your published exam date sheets and draft new schedules for assigned sections.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Choose a section and term</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="classSection">Class section</Label>
            <Select value={classSectionId} onValueChange={handleSectionChange}>
              <SelectTrigger id="classSection" className="mt-2">
                <SelectValue placeholder="Select a section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.className} — {section.sectionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="examSession">Exam session</Label>
            <Select value={examSessionId} onValueChange={handleExamSessionChange}>
              <SelectTrigger id="examSession" className="mt-2">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {examSessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {classSectionId && examSessionId ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Published Date Sheet</CardTitle>
            </CardHeader>
            <CardContent>
              {isFetchingSheet ? (
                <p className="text-sm text-slate-500">Loading published date sheet...</p>
              ) : dateSheet ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Title: <span className="font-medium text-slate-900">{dateSheet.title}</span></p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dateSheet.slots.map((slot) => (
                          <TableRow key={slot.id}>
                            <TableCell>{slot.subjectOffering.subject.name}</TableCell>
                            <TableCell>{slot.examDate.split('T')[0]}</TableCell>
                            <TableCell>{slot.startTime} – {slot.endTime}</TableCell>
                            <TableCell>{slot.roomNumber || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No published date sheet exists for the selected section and exam session.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Draft or update date sheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!hasOfferings ? (
                <p className="text-sm text-slate-500">
                  You do not have assigned subject offerings for this section. Assign subjects before preparing a date sheet.
                </p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="sheetTitle">Schedule title</Label>
                      <Input
                        id="sheetTitle"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Final exam schedule"
                        className="mt-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {slots.map((slot, index) => (
                      <div key={`${slot.id}-${index}`} className="grid gap-3 grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end">
                        <div>
                          <Label htmlFor={`subject-${index}`}>Subject</Label>
                          <Select
                            value={slot.subjectOfferingId}
                            onValueChange={(value) => updateSlot(index, 'subjectOfferingId', value)}
                          >
                            <SelectTrigger id={`subject-${index}`} className="mt-2">
                              <SelectValue placeholder="Select subject" />
                            </SelectTrigger>
                            <SelectContent>
                              {offerings.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.subject.name} ({option.subject.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`date-${index}`}>Exam date</Label>
                          <Input
                            id={`date-${index}`}
                            type="date"
                            value={slot.examDate}
                            onChange={(event) => updateSlot(index, 'examDate', event.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`start-${index}`}>Start</Label>
                          <Input
                            id={`start-${index}`}
                            type="time"
                            value={slot.startTime}
                            onChange={(event) => updateSlot(index, 'startTime', event.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`end-${index}`}>End</Label>
                          <Input
                            id={`end-${index}`}
                            type="time"
                            value={slot.endTime}
                            onChange={(event) => updateSlot(index, 'endTime', event.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mt-8 h-10 w-10"
                          onClick={() => removeSlot(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Button type="button" variant="secondary" onClick={addSlot} className="gap-2">
                      <Plus className="w-4 h-4" /> Add slot
                    </Button>
                    <Button
                      type="button"
                      onClick={() => saveDateSheet.mutate()}
                      disabled={!isValidForm || !hasOfferings || saveDateSheet.isPending}
                    >
                      {saveDateSheet.isPending ? 'Saving…' : 'Publish date sheet'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
