'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Lock, Eye, EyeOff, AlertCircle, Mail } from 'lucide-react'
import { ArcLineBrand } from '@/components/ArcLineBrand'

const loginSchema = z.object({
  email:    z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading]       = useState(false)
  const [formError, setFormError]       = useState<string | null>(null)
  const [callbackUrl, setCallbackUrl]   = useState('/dashboard')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      setCallbackUrl(sp.get('callbackUrl') || '/dashboard')
      const err = sp.get('error')
      if (err) setFormError('Authentication failed. Please check your credentials.')
    } catch {}
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    setFormError(null)
    const result = await signIn('credentials', {
      redirect: false,
      email:    data.email,
      password: data.password,
      callbackUrl,
    })
    setIsLoading(false)
    if (result?.error) {
      setFormError('Invalid credentials. Please check your email and password.')
      notify.error('Sign in failed', { description: 'Invalid email or password.' })
      return
    }
    notify.success('Welcome back!', { description: 'Redirecting to your dashboard…' })
    router.replace(callbackUrl)
  }

  return (
    <AuthLayout pageType="login">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

        {/* ── Error banner ── */}
        <AnimatePresence>
          {formError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              role="alert"
            >
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden />
                <span className="leading-snug">{formError}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Email ── */}
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
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
              className={`pl-10 ${errors.email ? 'border-red-400 ring-1 ring-red-400/30' : ''}`}
            />
          </div>
          <AnimatePresence>
            {errors.email && (
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
            )}
          </AnimatePresence>
        </div>

        {/* ── Password ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              aria-required="true"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
              className={`pl-10 pr-10 ${errors.password ? 'border-red-400 ring-1 ring-red-400/30' : ''}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
            </button>
          </div>
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

        {/* ── Submit ── */}
        <Button
          type="submit"
          size="lg"
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-full h-11 rounded-2xl text-sm font-semibold"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Signing in…
            </span>
          ) : (
            'Sign In to Portal'
          )}
        </Button>

        {/* ── Developer Attribution ── */}
        <div className="text-center pt-1">
          <ArcLineBrand prefix="This system is built by" />
        </div>
      </form>
    </AuthLayout>
  )
}

