'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, Eye, EyeOff, CheckCircle, Check,
  AlertCircle, ArrowLeft, ShieldCheck,
} from 'lucide-react'

import { fetchApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from '@/components/auth/AuthLayout'

// ─── Schema ───────────────────────────────────────────────────────────────────
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path:    ['confirmPassword'],
    message: 'Passwords do not match',
  })
type ResetForm = z.infer<typeof resetSchema>

// ─── Password strength ───────────────────────────────────────────────────────
const getPasswordStrength = (pw: string) => {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^a-zA-Z0-9]/.test(pw)) s++
  return Math.min(s, 5)
}

const strengthConfig = {
  1: { color: 'bg-red-500',    label: 'Weak',        textColor: 'text-red-600',    width: '20%'  },
  2: { color: 'bg-orange-500', label: 'Fair',        textColor: 'text-orange-600', width: '40%'  },
  3: { color: 'bg-yellow-500', label: 'Good',        textColor: 'text-yellow-600', width: '60%'  },
  4: { color: 'bg-lime-500',   label: 'Strong',      textColor: 'text-lime-600',   width: '80%'  },
  5: { color: 'bg-green-500',  label: 'Very Strong', textColor: 'text-green-600',  width: '100%' },
}

const requirements = [
  { test: (pw: string) => pw.length >= 8,                         label: 'At least 8 characters' },
  { test: (pw: string) => /[A-Z]/.test(pw) && /[a-z]/.test(pw), label: 'Mix of uppercase & lowercase' },
  { test: (pw: string) => /[0-9]/.test(pw),                      label: 'At least one number' },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function ResetPasswordPage() {
  const router = useRouter()
  const [token, setToken]               = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess]       = useState(false)
  const [serverError, setServerError]   = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)

  const { register, handleSubmit, formState: { errors }, watch } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  })

  const passwordValue        = watch('password')
  const confirmPasswordValue = watch('confirmPassword')

  useEffect(() => {
    try {
      const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      if (sp) setToken(sp.get('token') || '')
    } catch {}
  }, [])

  useEffect(() => {
    if (!token) setServerError('Reset token missing. Please use the link sent to your email.')
    else        setServerError(null)
  }, [token])

  useEffect(() => {
    if (passwordValue) setPasswordStrength(getPasswordStrength(passwordValue))
  }, [passwordValue])

  const onSubmit = async (data: ResetForm) => {
    if (!token) return
    setIsSubmitting(true)
    setServerError(null)
    try {
      await fetchApi('/api/auth/reset-password', {
        method: 'POST',
        body:   JSON.stringify({ token, password: data.password }),
      })
      setIsSuccess(true)
      notify.success('Password updated!', { description: 'Redirecting to login…' })
      setTimeout(() => router.push('/login'), 1500)
    } catch (error) {
      const message = (error as Error).message || 'Unable to reset password'
      setServerError(message)
      notify.error('Reset failed', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentStrength = strengthConfig[passwordStrength as keyof typeof strengthConfig] || strengthConfig[1]

  return (
    <AuthLayout pageType="reset-password">
      {/* Server Error */}
      <AnimatePresence>
        {serverError && !isSuccess && (
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
                <p className="font-semibold">Reset failed</p>
                <p className="text-xs mt-0.5 opacity-80">{serverError}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isSuccess ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
            role="status"
            aria-live="polite"
          >
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100">
                <CheckCircle className="w-7 h-7 text-emerald-600" aria-hidden />
              </div>
              <div>
                <p className="font-bold text-emerald-900 text-lg">Password Updated!</p>
                <p className="text-sm text-emerald-700 mt-1.5">Your new password is now active.</p>
              </div>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Next steps:</p>
              <ol className="text-sm text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Redirecting to login page</li>
                <li>Sign in with your new password</li>
                <li>Access your dashboard</li>
              </ol>
            </div>
          </motion.div>
        ) : token ? (
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
            {/* New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-700">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new strong password"
                  autoComplete="new-password"
                  aria-required="true"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : 'password-strength'}
                  {...register('password')}
                  className={`pl-10 pr-10 ${errors.password ? 'border-red-400 ring-1 ring-red-400/30' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                </button>
              </div>

              {/* Strength indicator */}
              <AnimatePresence>
                {passwordValue && (
                  <motion.div
                    id="password-strength"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2.5 pt-1"
                    aria-live="polite"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Password strength</span>
                      <span className={`font-semibold ${currentStrength.textColor}`}>
                        {currentStrength.label}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden" role="progressbar" aria-valuenow={passwordStrength} aria-valuemin={0} aria-valuemax={5}>
                      <motion.div
                        className={`h-full rounded-full ${currentStrength.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: currentStrength.width }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                    <ul className="space-y-1.5">
                      {requirements.map((req) => {
                        const passed = req.test(passwordValue)
                        return (
                          <li
                            key={req.label}
                            className={`flex items-center gap-2 text-xs transition-colors duration-200 ${passed ? 'text-emerald-600' : 'text-slate-400'}`}
                          >
                            <span
                              className={`flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-200 ${
                                passed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                              }`}
                              aria-hidden
                            >
                              {passed && <Check className="w-2.5 h-2.5" />}
                            </span>
                            {req.label}
                          </li>
                        )
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {errors.password && (
                  <motion.p
                    id="password-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-red-600 flex items-center gap-1.5"
                    role="alert"
                  >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                    {errors.password.message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  aria-required="true"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'confirm-error' : confirmPasswordValue && passwordValue === confirmPasswordValue ? 'confirm-match' : undefined}
                  {...register('confirmPassword')}
                  className={`pl-10 pr-10 ${
                    errors.confirmPassword
                      ? 'border-red-400 ring-1 ring-red-400/30'
                      : confirmPasswordValue && passwordValue === confirmPasswordValue
                        ? 'border-emerald-400 ring-1 ring-emerald-400/30'
                        : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                </button>
              </div>
              <AnimatePresence>
                {confirmPasswordValue && passwordValue === confirmPasswordValue && (
                  <motion.p
                    id="confirm-match"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-emerald-600 flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                    Passwords match
                  </motion.p>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {errors.confirmPassword && (
                  <motion.p
                    id="confirm-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-xs text-red-600 flex items-center gap-1.5"
                    role="alert"
                  >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                    {errors.confirmPassword.message}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Submit — uses project secondary (emerald) variant */}
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              className="w-full h-11 rounded-2xl text-sm font-semibold"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Updating Password…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4" aria-hidden />
                  Update Password
                </span>
              )}
            </Button>
          </motion.form>
        ) : (
          /* Invalid token */
          <motion.div
            key="invalid"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
                <AlertCircle className="w-6 h-6 text-amber-600" aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-amber-900">Invalid Reset Link</p>
                <p className="text-sm text-amber-700 mt-1.5 leading-relaxed">
                  The reset link is missing or has expired. Please request a new password reset.
                </p>
              </div>
            </div>
            <Link href="/forgot-password">
              <Button className="w-full h-11 rounded-2xl" variant="outline">
                Request New Link
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back to login */}
      {!isSuccess && token && (
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700 transition-colors w-full py-2.5 rounded-xl hover:bg-blue-50"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Back to Sign In
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
