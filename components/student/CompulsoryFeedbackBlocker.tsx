'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, ListChecks, MessageSquareText, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'
import { useRouter } from 'next/navigation'

interface FeedbackData {
  openCycle: { id: string; label: string } | null
  submitted: boolean
  isBlocked: boolean
  teachers: Array<{ id: string; firstName: string; lastName: string; subjects: string[] }>
  questions: Array<{ id: string; text: string; category: 'TEACHER' | 'ACADEMIC_STAFF' | 'MANAGEMENT' | 'ACCOUNTS' }>
}

export function CompulsoryFeedbackBlocker() {
  const [data, setData] = useState<FeedbackData | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  // Answers map: keys are `${questionId}_${targetTeacherId || 'NONE'}`
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Suggestions map: keys are category or teacher_${id}
  const [suggestions, setSuggestions] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/student/feedback')
      .then(res => res.json())
      .then((json: FeedbackData) => {
        if (json.isBlocked && json.openCycle) {
          setData(json)
          setIsOpen(true)
        }
      })
      .catch(err => console.error('Error fetching feedback status', err))
  }, [])

  if (!isOpen || !data || !data.openCycle) return null

  // Build wizard steps
  const steps: Array<{
    title: string
    subtitle: string
    category: string
    targetTeacherId?: string
    suggestionKey: string
    questions: any[]
  }> = []

  const teacherQs = data.questions.filter(q => q.category === 'TEACHER')
  if (teacherQs.length > 0) {
    data.teachers.forEach(teacher => {
      steps.push({
        title: `Course Teacher: ${teacher.firstName} ${teacher.lastName}`,
        subtitle: `Subjects: ${teacher.subjects.join(', ')}`,
        category: 'TEACHER',
        targetTeacherId: teacher.id,
        suggestionKey: `teacher_${teacher.id}`,
        questions: teacherQs,
      })
    })
  }

  const academicQs = data.questions.filter(q => q.category === 'ACADEMIC_STAFF')
  if (academicQs.length > 0) {
    steps.push({
      title: 'Academic Staff',
      subtitle: 'Feedback for coordinators, librarians, and academic management',
      category: 'ACADEMIC_STAFF',
      suggestionKey: 'ACADEMIC_STAFF',
      questions: academicQs,
    })
  }

  const managementQs = data.questions.filter(q => q.category === 'MANAGEMENT')
  if (managementQs.length > 0) {
    steps.push({
      title: 'Academy Management',
      subtitle: 'Feedback regarding academy operations, cleanliness, and facilities',
      category: 'MANAGEMENT',
      suggestionKey: 'MANAGEMENT',
      questions: managementQs,
    })
  }

  const accountQs = data.questions.filter(q => q.category === 'ACCOUNTS')
  if (accountQs.length > 0) {
    steps.push({
      title: 'Accounts Office',
      subtitle: 'Feedback regarding fee processing and account staff behavior',
      category: 'ACCOUNTS',
      suggestionKey: 'ACCOUNTS',
      questions: accountQs,
    })
  }

  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1

  const isCurrentStepComplete = currentStep?.questions.every(q => {
    const key = `${q.id}_${currentStep.targetTeacherId || 'NONE'}`
    return !!answers[key]
  })

  const handleSelect = (questionId: string, response: string) => {
    const key = `${questionId}_${currentStep.targetTeacherId || 'NONE'}`
    setAnswers(prev => ({ ...prev, [key]: response }))
  }

  const handleNext = async () => {
    if (!isCurrentStepComplete) {
      notify.error('Please answer all questions before proceeding.')
      return
    }

    if (isLastStep) {
      setIsSubmitting(true)
      const payloadAnswers = Object.entries(answers).map(([key, response]) => {
        const underscoreIdx = key.indexOf('_')
        const qId = key.substring(0, underscoreIdx)
        const tId = key.substring(underscoreIdx + 1)
        return {
          questionId: qId,
          targetTeacherId: tId === 'NONE' ? null : tId,
          response,
        }
      })

      try {
        const res = await fetch('/api/student/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cycleId: data.openCycle!.id,
            answers: payloadAnswers,
            suggestions,
          }),
        })
        const result = await res.json()
        if (res.ok && result.success) {
          notify.success('Feedback submitted successfully. Thank you!')
          setIsOpen(false)
          router.refresh()
        } else {
          throw new Error(result.error || 'Failed to submit feedback')
        }
      } catch (e: any) {
        notify.error(e.message)
      } finally {
        setIsSubmitting(false)
      }
    } else {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  // 4-option Likert scale per requirements: Agree / Neutral / Disagree / N/A
  const LIKERT_OPTIONS = [
    { val: 'AGREE', label: 'Agree', active: 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400 ring-offset-1' },
    { val: 'NEUTRAL', label: 'Neutral', active: 'border-blue-200 bg-blue-50 text-blue-700 ring-2 ring-blue-400 ring-offset-1' },
    { val: 'DISAGREE', label: 'Disagree', active: 'border-red-200 bg-red-50 text-red-700 ring-2 ring-red-400 ring-offset-1' },
    { val: 'STRONGLY_AGREE', label: 'N/A', active: 'border-gray-300 bg-gray-100 text-gray-500 ring-2 ring-gray-400 ring-offset-1' },
  ]

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-slate-900/85 backdrop-blur-lg animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-700 p-6 sm:px-8 text-white flex-shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <MessageSquareText className="w-32 h-32 transform rotate-12" />
          </div>
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur shadow-inner">
              <ListChecks className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black">{data.openCycle.label}</h2>
              <p className="text-blue-100 text-sm font-medium mt-1">
                Compulsory Monthly Feedback — Reviewed by Administration Only
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full bg-gray-100 flex-shrink-0">
          <div
            className="h-full bg-indigo-500 transition-all duration-300 ease-out"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        {currentStep && (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-black uppercase text-indigo-600 tracking-wider mb-1">
                Step {currentStepIndex + 1} of {steps.length}
              </p>
              <h3 className="text-2xl font-black text-gray-900">{currentStep.title}</h3>
              <p className="text-gray-500 text-sm font-medium mt-1">{currentStep.subtitle}</p>
            </div>

            <div className="space-y-5">
              {currentStep.questions.map((q, idx) => {
                const key = `${q.id}_${currentStep.targetTeacherId || 'NONE'}`
                const currentAnswer = answers[key]
                return (
                  <div key={q.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                    <p className="text-[15px] font-bold text-gray-800 mb-4 flex gap-3">
                      <span className="text-indigo-400 font-black">{idx + 1}.</span>
                      {q.text}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {LIKERT_OPTIONS.map(opt => (
                        <button
                          key={opt.val}
                          onClick={() => handleSelect(q.id, opt.val)}
                          className={`px-3 py-2.5 rounded-xl border text-sm font-bold transition-all shadow-sm ${
                            currentAnswer === opt.val
                              ? opt.active
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Per-section suggestions textarea */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-5">
                <label className="text-[13px] font-black text-indigo-700 uppercase tracking-wider block mb-2">
                  💬 Suggestions for Improvement (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder={`Share specific suggestions regarding ${currentStep.title}...`}
                  value={suggestions[currentStep.suggestionKey] || ''}
                  onChange={e =>
                    setSuggestions(prev => ({ ...prev, [currentStep.suggestionKey]: e.target.value }))
                  }
                  className="w-full rounded-xl border border-indigo-200 bg-white text-sm text-gray-700 px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 placeholder:text-gray-400"
                />
                <p className="text-[11px] text-indigo-500 font-medium mt-1.5">
                  🔒 Responses are strictly confidential — reviewed by Admin &amp; Super Admin only.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400 font-bold hidden sm:flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
            Admin-only access — your identity is protected
          </p>
          <Button
            onClick={handleNext}
            disabled={isSubmitting}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 px-8 rounded-xl"
          >
            {isSubmitting ? 'Submitting...' : isLastStep ? 'Submit Feedback' : 'Next Step'}
            {!isLastStep && <ChevronRight className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
