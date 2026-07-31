'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'
import { fetchApi, ApiError } from '@/lib/api-client'
import { AccessDenied } from '@/components/AccessDenied'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Plus, Trash2, Calendar, Eye, EyeOff, Edit2, FilePlus2, Loader2,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Section     = { id: string; className: string; sectionName: string }
type ExamSession = { id: string; name: string; term: string }
type Offering    = { id: string; subject: { name: string; code: string } }

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
  isPublished: boolean
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
  id: '', subjectOfferingId: '', examDate: '',
  startTime: '', endTime: '', roomNumber: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleMutationError(err: Error, fallback: string) {
  if (err instanceof ApiError && err.hasFieldErrors) {
    notify.error(`Validation: ${err.fieldErrors.map((fe) => fe.message).join('; ')}`)
  } else {
    notify.error(err.message || fallback)
  }
}

// ── Page Component ─────────────────────────────────────────────────────────────

export default function ExamDateSheetsPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()

  const [classSectionId, setClassSectionId] = useState('')
  const [examSessionId,  setExamSessionId]  = useState('')
  const [title,          setTitle]          = useState('')
  const [slots,          setSlots]          = useState<DateSheetSlot[]>([EMPTY_SLOT])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const role      = session?.user?.role
  const isTeacher = role === 'TEACHER'
  const isAdmin   = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const canAccess = isTeacher || isAdmin
  const canManage = isAdmin

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ['date-sheet-sections', role],
    queryFn: () =>
      fetchApi<Section[]>(isTeacher ? '/api/teacher-portal/sections' : '/api/class-sections'),
    enabled: canAccess,
  })

  const { data: examSessions = [] } = useQuery<ExamSession[]>({
    queryKey: ['exam-sessions'],
    queryFn: () => fetchApi<ExamSession[]>('/api/exam-sessions'),
    enabled: !!session?.user,
  })

  const { data: offerings = [] } = useQuery<Offering[]>({
    queryKey: ['date-sheet-offerings', role, classSectionId],
    queryFn: () =>
      fetchApi<Offering[]>(
        isTeacher
          ? `/api/teacher-portal/sections/${classSectionId}/offerings`
          : `/api/subject-offerings?classSectionId=${classSectionId}`
      ),
    enabled: canAccess && !!classSectionId && canManage,
  })

  const { data: dateSheet, isFetching: isFetchingSheet } = useQuery<DateSheetResponse | null>({
    queryKey: ['date-sheet', classSectionId, examSessionId],
    queryFn: () =>
      fetchApi<DateSheetResponse | null>(
        `/api/academic-upgrades/date-sheets?classSectionId=${classSectionId}&examSessionId=${examSessionId}`
      ),
    enabled: !!classSectionId && !!examSessionId,
  })

  // Sync draft form when an existing sheet is loaded
  useEffect(() => {
    if (!classSectionId || !examSessionId || dateSheet === undefined) return
    if (!dateSheet) {
      setTitle('')
      setSlots([EMPTY_SLOT])
      return
    }
    setTitle(dateSheet.title)
    setSlots(
      dateSheet.slots.map((slot) => ({
        id:                slot.id,
        subjectOfferingId: slot.subjectOfferingId,
        examDate:          slot.examDate.split('T')[0],
        startTime:         slot.startTime,
        endTime:           slot.endTime,
        roomNumber:        slot.roomNumber ?? '',
      }))
    )
  }, [classSectionId, examSessionId, dateSheet])

  // ── Selection handlers ─────────────────────────────────────────────────────

  const handleSectionChange = (value: string) => {
    setClassSectionId(value)
    if (!value) { setTitle(''); setSlots([EMPTY_SLOT]) }
  }

  const handleExamSessionChange = (value: string) => {
    setExamSessionId(value)
    if (!value) { setTitle(''); setSlots([EMPTY_SLOT]) }
  }

  // ── Slot helpers ───────────────────────────────────────────────────────────

  const addSlot = () => setSlots((prev) => [...prev, { ...EMPTY_SLOT }])

  const updateSlot = (index: number, field: keyof DateSheetSlot, value: string) =>
    setSlots((prev) => prev.map((slot, idx) => idx === index ? { ...slot, [field]: value } : slot))

  const removeSlot = (index: number) =>
    setSlots((prev) => prev.filter((_, idx) => idx !== index))

  const resetToNew = () => { setTitle(''); setSlots([EMPTY_SLOT]) }

  // ── Validation ─────────────────────────────────────────────────────────────

  const hasOfferings = offerings.length > 0
  const titleTrimmed = title.trim()
  // WHY: Mirror the server-side Zod schema (title.min(3)) — prevents a round-trip rejection
  const isTitleValid = titleTrimmed.length >= 3
  const isValidForm  =
    isTitleValid &&
    slots.length > 0 &&
    slots.every((slot) => slot.subjectOfferingId && slot.examDate && slot.startTime && slot.endTime)

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidateSheet = () =>
    qc.invalidateQueries({ queryKey: ['date-sheet', classSectionId, examSessionId] })

  // POST — create / replace
  const saveMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/academic-upgrades/date-sheets', {
        method: 'POST',
        body: JSON.stringify({
          classSectionId,
          examSessionId,
          title: titleTrimmed,
          slots: slots.map((slot) => ({
            subjectOfferingId: slot.subjectOfferingId,
            examDate:          slot.examDate,
            startTime:         slot.startTime,
            endTime:           slot.endTime,
            roomNumber:        slot.roomNumber || undefined,
          })),
        }),
      }),
    onSuccess: () => {
      notify.success('Date sheet published successfully')
      invalidateSheet()
    },
    onError: (err: Error) => handleMutationError(err, 'Failed to save date sheet'),
  })

  // PATCH — toggle isPublished
  const togglePublishMutation = useMutation({
    mutationFn: (publish: boolean) =>
      fetchApi('/api/academic-upgrades/date-sheets', {
        method: 'PATCH',
        body: JSON.stringify({ classSectionId, examSessionId, isPublished: publish }),
      }),
    onSuccess: (_data, publish) => {
      notify.success(publish ? 'Date sheet is now visible to students' : 'Date sheet hidden from students')
      invalidateSheet()
    },
    onError: (err: Error) => handleMutationError(err, 'Failed to update visibility'),
  })

  // DELETE — remove entire sheet
  const deleteMutation = useMutation({
    mutationFn: () =>
      fetchApi(
        `/api/academic-upgrades/date-sheets?classSectionId=${classSectionId}&examSessionId=${examSessionId}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      notify.success('Date sheet deleted successfully')
      setShowDeleteDialog(false)
      resetToNew()
      invalidateSheet()
    },
    onError: (err: Error) => {
      handleMutationError(err, 'Failed to delete date sheet')
      setShowDeleteDialog(false)
    },
  })

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (status === 'loading') return null
  if (!session?.user)
    return <AccessDenied title="Exam Date Sheets" message="Please sign in to view exam schedules." />
  if (!canAccess)
    return <AccessDenied title="Exam Date Sheets" message="Teachers and administrators can view exam date sheets here." />

  const isPublished = dateSheet?.isPublished ?? false
  const anyPending  = saveMutation.isPending || togglePublishMutation.isPending || deleteMutation.isPending

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Calendar className="w-6 h-6 text-indigo-600" />
            Exam Date Sheets
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {canManage
              ? 'Create, edit, publish, unpublish, or delete exam schedules for any class section.'
              : 'View published exam date sheets for your assigned sections.'}
          </p>
        </div>
      </div>

      {/* ── Section & Session picker ── */}
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
                {examSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {classSectionId && examSessionId ? (
        <div className="space-y-5">

          {/* ── Published Date Sheet (read-only view + actions) ── */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-base">Published Date Sheet</CardTitle>
                {dateSheet && (
                  <Badge
                    className={
                      isPublished
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }
                  >
                    {isPublished
                      ? <><CheckCircle2 className="w-3 h-3 mr-1 inline" />Visible to Students</>
                      : <><EyeOff className="w-3 h-3 mr-1 inline" />Hidden from Students</>}
                  </Badge>
                )}
              </div>

              {/* ── Admin action strip ── */}
              {canManage && dateSheet && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Publish / Unpublish toggle */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={anyPending}
                    onClick={() => togglePublishMutation.mutate(!isPublished)}
                    className={
                      isPublished
                        ? 'gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50'
                        : 'gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                    }
                  >
                    {togglePublishMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPublished ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </Button>

                  {/* Delete with confirmation */}
                  <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={anyPending}
                        className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
                          <AlertTriangle className="w-5 h-5" />
                          Delete Date Sheet?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{dateSheet.title}</strong> and all its
                          exam slots. Students currently viewing this schedule will no longer see it.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => { e.preventDefault(); deleteMutation.mutate() }}
                          disabled={deleteMutation.isPending}
                          className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
                        >
                          {deleteMutation.isPending
                            ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Deleting…</>
                            : 'Yes, Delete Permanently'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardHeader>

            <CardContent>
              {isFetchingSheet ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading date sheet…
                </div>
              ) : dateSheet ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Title: <span className="font-semibold text-slate-900">{dateSheet.title}</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Subject</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dateSheet.slots.map((slot) => (
                          <TableRow key={slot.id}>
                            <TableCell className="font-medium">{slot.subjectOffering.subject.name}</TableCell>
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
                <p className="text-sm text-slate-500">
                  No date sheet exists for the selected section and exam session.
                  Use the form below to create one.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Draft / Edit form (Admin only) ── */}
          {canManage && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-indigo-500" />
                    {dateSheet ? 'Edit Date Sheet' : 'Create Date Sheet'}
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    {dateSheet
                      ? 'Modify the schedule below and republish to update students.'
                      : 'Fill in the schedule and publish when ready.'}
                  </p>
                </div>
                {/* Reset to blank form for creating a fresh sheet */}
                {dateSheet && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-slate-600 hover:text-indigo-700"
                    onClick={resetToNew}
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    New Date Sheet
                  </Button>
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                {!hasOfferings ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    No subject offerings are configured for this section.
                    Assign subjects in the Academic settings before creating a date sheet.
                  </div>
                ) : (
                  <>
                    {/* Title field */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="sheetTitle">Schedule title</Label>
                        <Input
                          id="sheetTitle"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Class Test — August 2026"
                          className={`mt-2 ${!isTitleValid && titleTrimmed.length > 0 ? 'border-rose-400 focus-visible:ring-rose-400' : ''}`}
                        />
                        {/* WHY inline feedback: prevents the server-side min(3) rejection */}
                        {titleTrimmed.length > 0 && !isTitleValid && (
                          <p className="text-xs text-rose-500 mt-1">
                            Title must be at least 3 characters ({titleTrimmed.length}/3)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Slot rows */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Exam Slots
                      </p>
                      {slots.map((slot, index) => (
                        <div
                          key={`${slot.id ?? ''}-${index}`}
                          className="grid gap-3 grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] items-end p-3 rounded-xl border border-slate-200 bg-slate-50/50"
                        >
                          <div>
                            <Label htmlFor={`subject-${index}`} className="text-xs text-slate-600">Subject</Label>
                            <Select
                              value={slot.subjectOfferingId}
                              onValueChange={(v) => updateSlot(index, 'subjectOfferingId', v)}
                            >
                              <SelectTrigger id={`subject-${index}`} className="mt-1 h-9 text-sm">
                                <SelectValue placeholder="Select subject" />
                              </SelectTrigger>
                              <SelectContent>
                                {offerings.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    {opt.subject.name} ({opt.subject.code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`date-${index}`} className="text-xs text-slate-600">Exam date</Label>
                            <Input
                              id={`date-${index}`}
                              type="date"
                              value={slot.examDate}
                              onChange={(e) => updateSlot(index, 'examDate', e.target.value)}
                              className="mt-1 h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`start-${index}`} className="text-xs text-slate-600">Start</Label>
                            <Input
                              id={`start-${index}`}
                              type="time"
                              value={slot.startTime}
                              onChange={(e) => updateSlot(index, 'startTime', e.target.value)}
                              className="mt-1 h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`end-${index}`} className="text-xs text-slate-600">End</Label>
                            <Input
                              id={`end-${index}`}
                              type="time"
                              value={slot.endTime}
                              onChange={(e) => updateSlot(index, 'endTime', e.target.value)}
                              className="mt-1 h-9 text-sm"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => removeSlot(index)}
                            disabled={slots.length === 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {/* Form actions */}
                    <div className="flex items-center gap-3 pt-1">
                      <Button type="button" variant="secondary" onClick={addSlot} className="gap-2">
                        <Plus className="w-4 h-4" /> Add slot
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveMutation.mutate()}
                        disabled={!isValidForm || !hasOfferings || anyPending}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                      >
                        {saveMutation.isPending
                          ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                          : <><CheckCircle2 className="w-4 h-4" />{dateSheet ? 'Update & Publish' : 'Publish Date Sheet'}</>}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  )
}
