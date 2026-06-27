'use client'

import { useEffect, useState } from 'react'
import { Check, ClipboardList, ShieldAlert, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'
import { useRouter } from 'next/navigation'

const AGREEMENT_RULES = [
  'Fee once deposited is neither refundable nor adjustable in any case.',
  'Session timings are subject to the availability of the teachers and can be amended if required.',
  'Parents must attend the office regularly within mentioned time to discuss the progress of the student.',
  'AWC will be applied to late and absentees. Moreover pay your academy dues within mentioned dates.',
  'Misconduct of any type will be culpable.',
  'Any damage caused by the student will be charged accordingly.',
  'Institution is relieved of responsibility (legal, etc.) in case of any injury, damage or loss, which is beyond its control.',
  'Use of mobile phones and wearing jewelry is strictly prohibited in the campus premises.',
  'Institution will not, in any case, be responsible for any loss suffered by a student.',
  'It is mandatory for every student to attend the ESA EVENTS.',
  'Registration is mandatory for every student every year.',
  'Decisions of the administration will be final, in any case.',
  'I acknowledge that my enrollment will remain active for the complete academic session unless an official withdrawal application is submitted and approved. If I wish to leave the institute, I must submit the application at least 14 calendar days before the end of the intended final month and clear all outstanding dues.'
]

export function RulesAgreementBlocker() {
  const [rulesAccepted, setRulesAccepted] = useState<boolean | null>(null)
  const [checkedRules, setCheckedRules] = useState<Record<number, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/student/rules-agreement')
      .then(res => res.json())
      .then((json: { rulesAccepted: boolean }) => {
        setRulesAccepted(json.rulesAccepted)
      })
      .catch(err => {
        console.error('Error fetching rules agreement status', err)
        // Default to accepted on error to avoid trapping users in case of network issue
        setRulesAccepted(true)
      })
  }, [])

  if (rulesAccepted === null || rulesAccepted === true) return null

  const handleToggleRule = (index: number) => {
    setCheckedRules(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const allChecked = AGREEMENT_RULES.every((_, i) => checkedRules[i])

  const handleAccept = async () => {
    if (!allChecked) {
      notify.error('Please check and accept all the rules and regulations to proceed.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/student/rules-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const result = await res.json()
      if (res.ok && result.success) {
        notify.success('Rules and Regulations accepted successfully. Welcome to your portal!')
        setRulesAccepted(true)
        router.refresh()
      } else {
        throw new Error(result.error || 'Failed to submit agreement')
      }
    } catch (e: any) {
      notify.error(e.message || 'An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCheckAll = () => {
    const next: Record<number, boolean> = {}
    AGREEMENT_RULES.forEach((_, i) => {
      next[i] = true
    })
    setCheckedRules(next)
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:px-8 text-white flex-shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <ClipboardList className="w-32 h-32 transform rotate-12" />
          </div>
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/30 shadow-inner">
              <Award className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100">Portal Terms &amp; Rules Agreement</h2>
              <p className="text-slate-400 text-sm font-medium mt-1">
                Evershine Academy Portal First-Time Registration &amp; Policy Verification
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 text-sm text-slate-600 font-medium">
            👋 Welcome to your Evershine Academy student portal! Before accessing your dashboard for the first time, you must review and agree to the institution's official rules and regulations below. Please read and mark each checkbox to acknowledge.
          </div>

          <div className="space-y-3">
            {AGREEMENT_RULES.map((rule, index) => {
              const isChecked = !!checkedRules[index]
              const isLastRule = index === AGREEMENT_RULES.length - 1
              return (
                <div
                  key={index}
                  onClick={() => handleToggleRule(index)}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-indigo-50/50 border-indigo-200 text-indigo-950 shadow-sm'
                      : isLastRule
                      ? 'bg-amber-500/5 border-amber-300/60 text-slate-800 hover:bg-amber-500/10'
                      : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100/75'
                  }`}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border transition-all ${
                    isChecked
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : isLastRule
                      ? 'border-amber-400 bg-white'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <div className="flex-1 text-xs sm:text-sm font-semibold leading-relaxed">
                    <span className="text-indigo-600/80 mr-1.5 font-bold">#{index + 1}</span>
                    {isLastRule ? (
                      <span className="text-amber-950 font-bold underline decoration-amber-500/40">
                        {rule}
                      </span>
                    ) : rule}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckAll}
              className="text-xs font-bold border-slate-300 hover:bg-slate-100 text-slate-700 h-9"
            >
              Check All Rules
            </Button>
            <p className="text-[11px] text-slate-400 font-bold hidden sm:flex items-center">
              <ShieldAlert className="w-3.5 h-3.5 mr-1 text-slate-400" />
              Legally binding agreement
            </p>
          </div>
          <Button
            onClick={handleAccept}
            disabled={isSubmitting || !allChecked}
            className={`w-full sm:w-auto font-bold h-11 px-8 rounded-xl transition-all ${
              allChecked 
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed border-none'
            }`}
          >
            {isSubmitting ? 'Submitting...' : 'I Accept and Agree to the Rules'}
          </Button>
        </div>
      </div>
    </div>
  )
}
