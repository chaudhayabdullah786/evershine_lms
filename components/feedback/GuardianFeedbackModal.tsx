'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { notify } from '@/lib/notify'
import { ChevronRight, MessageSquareHeart, ShieldCheck, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Question = { id: string; text: string; category: string; orderIndex: number }

type PendingData = {
  required: boolean
  cycle: { id: string; label: string } | null
  submitted: boolean
  questions: Question[]
}

const LIKERT_OPTIONS = [
  { val: 'STRONGLY_AGREE', label: 'Strongly Agree', emoji: '🌟', active: 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400 ring-offset-1' },
  { val: 'AGREE', label: 'Agree', emoji: '👍', active: 'border-blue-200 bg-blue-50 text-blue-700 ring-2 ring-blue-400 ring-offset-1' },
  { val: 'NEUTRAL', label: 'Neutral', emoji: '😐', active: 'border-amber-200 bg-amber-50 text-amber-700 ring-2 ring-amber-400 ring-offset-1' },
  { val: 'DISAGREE', label: 'Disagree', emoji: '👎', active: 'border-red-200 bg-red-50 text-red-700 ring-2 ring-red-400 ring-offset-1' },
]

const CATEGORY_META: Record<string, { title: string; subtitle: string; gradient: string }> = {
  LMS_SERVICES: {
    title: 'LMS & Digital Services',
    subtitle: 'Rate your experience with the student/parent portal, online access, and digital tools.',
    gradient: 'from-violet-600 to-indigo-700',
  },
  ACADEMY_SERVICES: {
    title: 'Academy Services & Facilities',
    subtitle: 'Rate the cleanliness, facilities, admin office, transport, and overall academy experience.',
    gradient: 'from-teal-600 to-emerald-700',
  },
}

/**
 * Non-blocking feedback modal for guardians/parents.
 * Shows once per monthly cycle. Can be dismissed but reappears each session until completed.
 */
export function GuardianFeedbackModal() {
  const { data: session } = useSession()
  const qc = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [suggestions, setSuggestions] = useState<Record<string, string>>({})
  const [dismissed, setDismissed] = useState(false)

  const isGuardian = session?.user?.role === 'PARENT' || session?.user?.role === 'GUARDIAN'

  const { data } = useQuery<PendingData>({
    queryKey: ['guardian-feedback-pending'],
    queryFn: () => fetchApi<PendingData>('/api/guardian-portal/feedback/pending'),
    enabled: isGuardian && !dismissed,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (data?.required && !data.submitted && !dismissed) {
      // Small delay so the portal renders first
      const timer = setTimeout(() => setIsOpen(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [data, dismissed])

  const submit = useMutation({
    mutationFn: (payload: {
      cycleId: string
      answers: { questionId: string; response: string }[]
      suggestions: Record<string, string>
    }) =>
      fetchApi('/api/guardian-portal/feedback/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success('Thank you for your feedback! Your input helps us improve.')
      setIsOpen(false)
      setDismissed(true)
      qc.invalidateQueries({ queryKey: ['guardian-feedback-pending'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (!isGuardian || !isOpen || !data?.required || !data.cycle) return null

  // Group questions by category into wizard steps
  const categories = [...new Set(data.questions.map((q) => q.category))]
  const steps = categories.map((cat) => ({
    category: cat,
    ...(CATEGORY_META[cat] ?? { title: cat, subtitle: '', gradient: 'from-gray-600 to-gray-700' }),
    questions: data.questions.filter((q) => q.category === cat),
  }))

  if (steps.length === 0) return null

  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1
  const allAnswered = currentStep.questions.every((q) => answers[q.id])

  const handleSubmitOrNext = () => {
    if (!allAnswered) {
      notify.error('Please answer all questions before proceeding.')
      return
    }

    if (isLastStep) {
      submit.mutate({
        cycleId: data.cycle!.id,
        answers: Object.entries(answers).map(([questionId, response]) => ({ questionId, response })),
        suggestions,
      })
    } else {
      setCurrentStepIndex((prev) => prev + 1)
    }
  }

  const handleDismiss = () => {
    setIsOpen(false)
    setDismissed(true)
    // WHY: Session-only dismiss — will reappear next login until feedback is submitted
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className={`bg-gradient-to-r ${currentStep.gradient} p-6 sm:px-8 text-white flex-shrink-0 relative overflow-hidden`}>
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            title="Remind me later"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <MessageSquareHeart className="w-32 h-32 transform rotate-12" />
          </div>
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur shadow-inner">
              <Star className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black">{data.cycle.label}</h2>
              <p className="text-white/80 text-sm font-medium mt-1">
                Monthly Service Feedback — Your opinion matters!
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full bg-gray-100 flex-shrink-0">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-black uppercase text-violet-600 tracking-wider mb-1">
              Step {currentStepIndex + 1} of {steps.length}
            </p>
            <h3 className="text-2xl font-black text-gray-900">{currentStep.title}</h3>
            <p className="text-gray-500 text-sm font-medium mt-1">{currentStep.subtitle}</p>
          </div>

          <div className="space-y-5">
            {currentStep.questions.map((q, idx) => (
              <div key={q.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                <p className="text-[15px] font-bold text-gray-800 mb-4 flex gap-3">
                  <span className="text-violet-400 font-black">{idx + 1}.</span>
                  {q.text}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {LIKERT_OPTIONS.map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.val }))}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-bold transition-all shadow-sm ${
                        answers[q.id] === opt.val
                          ? opt.active
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="mr-1">{opt.emoji}</span> {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Per-step suggestions */}
            <div className="bg-violet-50/70 border border-violet-100 rounded-2xl p-5">
              <label className="text-[13px] font-black text-violet-700 uppercase tracking-wider block mb-2">
                💬 Suggestions for Improvement (Optional)
              </label>
              <textarea
                rows={3}
                placeholder={`Share your thoughts on how we can improve ${currentStep.title}...`}
                value={suggestions[currentStep.category] || ''}
                onChange={(e) =>
                  setSuggestions((prev) => ({ ...prev, [currentStep.category]: e.target.value }))
                }
                className="w-full rounded-xl border border-violet-200 bg-white text-sm text-gray-700 px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 placeholder:text-gray-400"
              />
              <p className="text-[11px] text-violet-500 font-medium mt-1.5 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Responses are confidential — reviewed by administration only.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex items-center justify-between gap-4">
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-400 hover:text-gray-600 font-semibold transition-colors"
          >
            Remind me later
          </button>
          <Button
            onClick={handleSubmitOrNext}
            disabled={submit.isPending || !allAnswered}
            className="bg-violet-600 hover:bg-violet-700 text-white font-bold h-12 px-8 rounded-xl"
          >
            {submit.isPending
              ? 'Submitting...'
              : isLastStep
              ? 'Submit Feedback'
              : 'Next Step'}
            {!isLastStep && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
