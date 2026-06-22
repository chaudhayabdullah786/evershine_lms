/**
 * FormAlert — EverShine LMS Inline Alert Component
 *
 * Purpose: Render structured, accessible alert banners *within* forms,
 * dialogs, and page sections — distinct from the toast notification system
 * that sits in the corner of the viewport.
 *
 * Use this when the message belongs contextually next to the element that
 * caused it (e.g. a form submission error that must not be missed).
 *
 * Design contract:
 *   - Animate in from transparent + 6px above via CSS keyframes
 *   - Left accent border + colour-matched background per variant
 *   - Icon badge sourced from Lucide matching each severity
 *   - Dismissible via optional `onDismiss` prop
 *   - `compact` prop reduces padding for tight spaces (table rows, cards)
 *   - ARIA `role="alert"` on error/warning; `role="status"` on success/info
 */

'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react'

// ─── Variant definitions ──────────────────────────────────────────────────────

type Variant = 'error' | 'success' | 'warning' | 'info' | 'loading'

const VARIANT_STYLES: Record<
  Variant,
  {
    root: string
    icon: string
    title: string
    description: string
    dismiss: string
    IconComponent: React.ComponentType<{ className?: string; strokeWidth?: number }>
    role: 'alert' | 'status'
    ariaLive: 'assertive' | 'polite'
  }
> = {
  error: {
    root: 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/50',
    icon: 'bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-400 border-rose-200 dark:border-rose-700',
    title: 'text-rose-800 dark:text-rose-300',
    description: 'text-rose-700 dark:text-rose-400',
    dismiss: 'text-rose-400 hover:text-rose-600 dark:text-rose-500 dark:hover:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40',
    IconComponent: OctagonXIcon,
    role: 'alert',
    ariaLive: 'assertive',
  },
  success: {
    root: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/50',
    icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
    title: 'text-emerald-800 dark:text-emerald-300',
    description: 'text-emerald-700 dark:text-emerald-400',
    dismiss: 'text-emerald-400 hover:text-emerald-600 dark:text-emerald-500 dark:hover:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
    IconComponent: CircleCheckIcon,
    role: 'status',
    ariaLive: 'polite',
  },
  warning: {
    root: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-700/50',
    icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-400 border-amber-200 dark:border-amber-700',
    title: 'text-amber-800 dark:text-amber-300',
    description: 'text-amber-700 dark:text-amber-400',
    dismiss: 'text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40',
    IconComponent: TriangleAlertIcon,
    role: 'alert',
    ariaLive: 'assertive',
  },
  info: {
    root: 'bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800/50',
    icon: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-400 border-sky-200 dark:border-sky-700',
    title: 'text-sky-800 dark:text-sky-300',
    description: 'text-sky-700 dark:text-sky-400',
    dismiss: 'text-sky-400 hover:text-sky-600 dark:text-sky-500 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40',
    IconComponent: InfoIcon,
    role: 'status',
    ariaLive: 'polite',
  },
  loading: {
    root: 'bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-700',
    icon: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    title: 'text-slate-700 dark:text-slate-300',
    description: 'text-slate-600 dark:text-slate-400',
    dismiss: 'text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800',
    IconComponent: Loader2Icon,
    role: 'status',
    ariaLive: 'polite',
  },
}

// ─── Component API ────────────────────────────────────────────────────────────

export interface FormAlertProps {
  /** Variant controls colour, icon, and ARIA semantics */
  variant: Variant
  /** Short title displayed in bold above the description */
  title: string
  /** Optional supporting text — may include plain prose or a list of issues */
  description?: React.ReactNode
  /** When provided, renders a dismiss (×) button and calls this on click */
  onDismiss?: () => void
  /** Reduce vertical padding for constrained contexts */
  compact?: boolean
  /** Additional className appended to the outer container */
  className?: string
  /** When true, component is not rendered (simplifies conditional rendering) */
  hidden?: boolean
}

/**
 * Inline alert banner for contextual feedback inside forms and page sections.
 *
 * @example
 * <FormAlert
 *   variant="error"
 *   title="Submission Failed"
 *   description="Please correct the highlighted fields and try again."
 *   onDismiss={() => setError(null)}
 * />
 */
export function FormAlert({
  variant,
  title,
  description,
  onDismiss,
  compact = false,
  className,
  hidden = false,
}: FormAlertProps) {
  if (hidden) return null

  const styles = VARIANT_STYLES[variant]
  const { IconComponent } = styles
  const isLoading = variant === 'loading'

  return (
    <div
      role={styles.role}
      aria-live={styles.ariaLive}
      aria-atomic="true"
      className={cn(
        // Layout
        'relative flex items-start gap-3',
        // Sizing
        'w-full',
        // Shape & border
        'rounded-xl border',
        // Colours (variant-specific)
        styles.root,
        // Padding
        compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5',
        // Entrance animation — defined in globals.css as `.animate-fade-slide-up`
        'animate-fade-slide-up',
        className
      )}
    >
      {/* Icon badge */}
      <span
        className={cn(
          'flex shrink-0 items-center justify-center',
          'rounded-md border',
          compact ? 'w-6 h-6' : 'w-7 h-7',
          styles.icon
        )}
      >
        <IconComponent
          className={cn(compact ? 'size-3' : 'size-3.5', isLoading && 'animate-spin')}
          strokeWidth={2.5}
        />
      </span>

      {/* Text content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-semibold leading-5 tracking-tight',
            compact ? 'text-[0.75rem]' : 'text-[0.8125rem]',
            styles.title
          )}
        >
          {title}
        </p>
        {description && (
          <div
            className={cn(
              'mt-0.5 leading-relaxed font-normal',
              compact ? 'text-[0.6875rem]' : 'text-xs',
              styles.description
            )}
          >
            {description}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className={cn(
            'ml-auto shrink-0 flex items-center justify-center',
            'rounded-md p-1',
            'transition-colors duration-150',
            styles.dismiss
          )}
        >
          <XIcon className="size-3.5" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

// ─── Convenience single-line variants ────────────────────────────────────────

/** Compact error alert, commonly used at the top of forms */
export function ErrorAlert(props: Omit<FormAlertProps, 'variant'>) {
  return <FormAlert {...props} variant="error" />
}

/** Compact success alert for post-submit confirmation */
export function SuccessAlert(props: Omit<FormAlertProps, 'variant'>) {
  return <FormAlert {...props} variant="success" />
}

/** Cautionary warning alert */
export function WarningAlert(props: Omit<FormAlertProps, 'variant'>) {
  return <FormAlert {...props} variant="warning" />
}

/** Informational / neutral status alert */
export function InfoAlert(props: Omit<FormAlertProps, 'variant'>) {
  return <FormAlert {...props} variant="info" />
}

/** Inline loading indicator used while awaiting async results */
export function LoadingAlert(props: Omit<FormAlertProps, 'variant'>) {
  return <FormAlert {...props} variant="loading" />
}
