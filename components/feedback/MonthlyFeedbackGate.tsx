'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LIKERT_LABELS } from '@/lib/validation/feedback'
import { notify } from '@/lib/notify'
import { Loader2 } from 'lucide-react'

type Likert = keyof typeof LIKERT_LABELS

type PendingTeacher = {
  teacherId: string
  teacherName: string
  studentEnrollmentId: string
  classSectionLabel: string
  campusName: string
  batchName: string
  shiftName: string
  subjects: string[]
}

type Question = { id: string; text: string }

export function MonthlyFeedbackGate({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, Likert>>({})
  const [comments, setComments] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['feedback-pending'],
    queryFn: () =>
      fetchApi<{
        required: boolean
        cycle: { id: string; label: string } | null
        pending: PendingTeacher[]
        questions: Question[]
      }>('/api/feedback/student/pending'),
    enabled: session?.user?.role === 'STUDENT',
    refetchOnWindowFocus: true,
  })

  const submit = useMutation({
    mutationFn: (payload: {
      cycleId: string
      teacherId: string
      studentEnrollmentId: string
      comments?: string
      answers: { questionId: string; response: Likert }[]
    }) =>
      fetchApi('/api/feedback/student/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success('Thank you — your feedback was recorded.')
      setAnswers({})
      setComments('')
      qc.invalidateQueries({ queryKey: ['feedback-pending'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (session?.user?.role !== 'STUDENT') return <>{children}</>
  if (isLoading) return <>{children}</>

  const pending = data?.pending ?? []
  const required = data?.required && pending.length > 0
  if (!required || !data?.cycle) return <>{children}</>

  const teacher = pending[0]
  const questions = data.questions ?? []
  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id])
  const remaining = pending.length

  const handleSubmit = () => {
    if (!allAnswered) {
      notify.error('Please select a response for every question before continuing.')
      return
    }
    submit.mutate({
      cycleId: data.cycle!.id,
      teacherId: teacher.teacherId,
      studentEnrollmentId: teacher.studentEnrollmentId,
      comments: comments.trim() || undefined,
      answers: questions.map((q) => ({ questionId: q.id, response: answers[q.id] })),
    })
  }

  return (
    <>
      <Dialog open modal onOpenChange={() => {}}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Monthly teacher feedback — {data.cycle.label}</DialogTitle>
            <DialogDescription>
              Evershaheen Academy collects confidential student feedback each month. Please complete
              feedback for all assigned teachers before using the portal ({remaining} remaining).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-blue-50 p-3 text-sm">
              <p className="font-semibold text-blue-900">{teacher.teacherName}</p>
              <p className="text-blue-800">
                {teacher.campusName} · {teacher.batchName} · {teacher.classSectionLabel} ·{' '}
                {teacher.shiftName} session
              </p>
              <p className="text-blue-700 text-xs mt-1">Subjects: {teacher.subjects.join(', ')}</p>
            </div>

            {questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <Label className="text-sm font-medium leading-snug">{q.text}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(LIKERT_LABELS) as Likert[]).map((key) => (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={answers[q.id] === key ? 'default' : 'outline'}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: key }))}
                    >
                      {LIKERT_LABELS[key]}
                    </Button>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <Label>Suggestions or comments (optional)</Label>
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Share anything else you would like administration to know…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={submit.isPending || !allAnswered} className="w-full">
              {submit.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…
                </>
              ) : remaining > 1 ? (
                'Submit and continue to next teacher'
              ) : (
                'Submit and enter portal'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {children}
    </>
  )
}
