/**
 * notify.ts — EverShine LMS Centralised Notification Utility
 *
 * Single-source-of-truth wrapper around Sonner's `toast` API.
 * Import and call `notify.*` instead of raw `toast.*` throughout the
 * dashboard so all notifications are subject to uniform styling, timing,
 * and accessibility contracts.
 *
 * WHY: Scatter-gun `toast.success()` calls with ad-hoc descriptions make
 * the notification UX impossible to maintain consistently.  This façade
 * enforces structure and enables global behaviour changes from one file.
 */

import { toast } from 'sonner'

// ─── Internal defaults ────────────────────────────────────────────────────────

const BASE_DURATION = 4500   // ms — long enough to read, short enough to not block
const ERROR_DURATION = 7000  // ms — errors need more time to be read
const LOADING_DURATION = Infinity // dismiss manually

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NotifyOptions {
  /** Secondary descriptor shown below the title */
  description?: string
  /** Override default auto-dismiss duration (ms). Use Infinity to persist. */
  duration?: number
  /** Optional action button label + handler */
  action?: {
    label: string
    onClick: () => void
  }
  /** Optional dismiss button label */
  cancel?: {
    label: string
    onClick?: () => void
  }
  /** Sonner toast ID — provide a stable ID to replace an existing notification */
  id?: string | number
}

function getActionOption(option: NotifyOptions['action']) {
  return option?.onClick ? option : undefined
}

function getCancelOption(option: NotifyOptions['cancel']) {
  return option?.onClick ? { label: option.label, onClick: option.onClick } : undefined
}

export interface LoadingNotifyOptions {
  /** Override message shown when promise resolves successfully */
  successMessage?: string
  /** Override message shown when promise rejects */
  errorMessage?: string
  /** Custom description on success */
  successDescription?: string
  /** Custom description on error */
  errorDescription?: string
}

// ─── Core notify facade ──────────────────────────────────────────────────────

export const notify = {
  /**
   * Display a transient success notification.
   * Use for: record saved, action completed, form submitted.
   */
  success(title: string, options: NotifyOptions = {}) {
    return toast.success(title, {
      description: options.description,
      duration: options.duration ?? BASE_DURATION,
      action: getActionOption(options.action),
      cancel: getCancelOption(options.cancel),
      id: options.id,
    })
  },

  /**
   * Display a persistent (longer duration) error notification.
   * Use for: API failures, validation failures, critical system errors.
   */
  error(title: string, options: NotifyOptions = {}) {
    return toast.error(title, {
      description: options.description,
      duration: options.duration ?? ERROR_DURATION,
      action: getActionOption(options.action),
      cancel: getCancelOption(options.cancel),
      id: options.id,
    })
  },

  /**
   * Display a cautionary warning notification.
   * Use for: non-blocking issues, deprecations, potential data-loss operations.
   */
  warning(title: string, options: NotifyOptions = {}) {
    return toast.warning(title, {
      description: options.description,
      duration: options.duration ?? BASE_DURATION,
      action: getActionOption(options.action),
      cancel: getCancelOption(options.cancel),
      id: options.id,
    })
  },

  /**
   * Display a neutral informational notification.
   * Use for: status updates, background operations, announcements.
   */
  info(title: string, options: NotifyOptions = {}) {
    return toast.info(title, {
      description: options.description,
      duration: options.duration ?? BASE_DURATION,
      action: getActionOption(options.action),
      cancel: getCancelOption(options.cancel),
      id: options.id,
    })
  },

  /**
   * Display a persistent loading notification, then automatically transition to
   * success or error once the supplied Promise resolves or rejects.
   *
   * Use for: file uploads, API mutations, report generation.
   *
   * @example
   * await notify.promise(
   *   () => fetch('/api/students', { method: 'POST', body }),
   *   'Saving student record...',
   *   { successMessage: 'Student saved', errorMessage: 'Failed to save student' }
   * )
   */
  promise<T>(
    promiseFn: Promise<T> | (() => Promise<T>),
    loadingMessage: string,
    options: LoadingNotifyOptions = {}
  ) {
    const resolved = typeof promiseFn === 'function' ? promiseFn() : promiseFn
    return toast.promise(resolved, {
      loading: loadingMessage,
      success: options.successMessage ?? 'Done!',
      error: (err: Error) => options.errorMessage ?? err?.message ?? 'Something went wrong',
    })
  },

  /**
   * Show a manual loading indicator.  The returned toast ID must be passed to
   * notify.dismiss() once the operation completes.
   */
  loading(title: string, options: NotifyOptions = {}) {
    return toast.loading(title, {
      description: options.description,
      duration: options.duration ?? LOADING_DURATION,
      id: options.id,
    })
  },

  /**
   * Dismiss a notification by its ID, or dismiss all if no ID provided.
   */
  dismiss(id?: string | number) {
    toast.dismiss(id)
  },
} as const
