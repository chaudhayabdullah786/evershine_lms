'use client'

import Link from 'next/link'
import { useState } from 'react'
import { notify } from '@/lib/notify'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, AlertCircle, Send, CheckCircle } from 'lucide-react'

import { fetchApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from '@/components/auth/AuthLayout'

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})
type ForgotForm = z.infer<typeof forgotSchema>

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent]             = useState(false)
  const [serverError, setServerError]   = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors }, watch } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  })

  const emailValue = watch('email')

  const onSubmit = async (data: ForgotForm) => {
    setIsSubmitting(true)
    setServerError(null)
    try {
      await fetchApi('/api/auth/forgot-password', {
        method: 'POST',
        body:   JSON.stringify(data),
      })
      setIsSent(true)
      notify.success('Reset email sent', {
        description: 'If your email is registered, you will receive instructions shortly.',
      })
    } catch (error) {
      const message = (error as Error).message || 'Unable to submit request'
      setServerError(message)
      notify.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout pageType="forgot-password">
      {/* ── Server error ── */}
      <AnimatePresence>
        {serverError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
            role="alert"
          >
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 flex items-start gap-2.5 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="font-semibold">Something went wrong</p>
                <p className="text-xs mt-0.5 opacity-80">{serverError}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isSent ? (
          /* ── SUCCESS STATE ── */
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="space-y-5"
            role="status"
            aria-live="polite"
          >
            {/* Success card */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100">
                <CheckCircle className="w-7 h-7 text-emerald-600" aria-hidden />
              </div>
              <div>
                <p className="font-bold text-emerald-900 text-lg">Check your email</p>
                <p className="text-sm text-emerald-700 mt-1.5 leading-relaxed">
                  We&apos;ve sent password reset instructions to:
                </p>
                <p className="font-semibold text-slate-900 mt-2 break-all text-sm">{emailValue}</p>
              </div>
            </div>

            {/* Next steps */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Next steps:</p>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Check your inbox for an email from us</li>
                <li>Click the &quot;Reset Password&quot; link in the email</li>
                <li>Create a new strong password</li>
                <li>Sign in with your new password</li>
              </ol>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Tip: Check your spam or promotional folder if you don&apos;t see the email
            </p>
          </motion.div>
        ) : (
          /* ── FORM STATE ── */
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            noValidate
          >
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@evershineacademy.edu.pk"
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : 'email-hint'}
                  {...register('email')}
                  className={`pl-10 ${errors.email ? 'border-red-400 ring-1 ring-red-400/30' : ''}`}
                />
              </div>
              <AnimatePresence>
                {errors.email ? (
                  <motion.p
                    id="email-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-red-600 flex items-center gap-1.5"
                    role="alert"
                  >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                    {errors.email.message}
                  </motion.p>
                ) : (
                  <p id="email-hint" className="text-xs text-slate-400 leading-relaxed">
                    We&apos;ll send you a link to reset your password. It expires in 1 hour for security.
                  </p>
                )}
              </AnimatePresence>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="w-full h-11 rounded-2xl text-sm font-semibold"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending reset link…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" aria-hidden />
                  Send Reset Link
                </span>
              )}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
