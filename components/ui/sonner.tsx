"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

/**
 * Toaster — EverShine LMS Professional Notification Host
 *
 * Drop-in replacement for the default Sonner Toaster.  Provides:
 *   • Semantically-coloured icon badges per notification type
 *   • Consistent border radii, shadows and typography via CSS custom props
 *   • Theme-aware rendering (light / dark / system)
 *   • Accessible ARIA live regions via Sonner internals
 *
 * Mount once in app/layout.tsx.  Never mount more than one Toaster.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-right"
      richColors
      closeButton
      visibleToasts={5}
      gap={8}
      toastOptions={{
        duration: 4500,
        classNames: {
          // Base toast shell — all variants start here
          toast: [
            "group/toast",
            "flex items-start gap-3",
            "w-[360px] max-w-[calc(100vw-2rem)]",
            "rounded-xl border px-4 py-3.5",
            "shadow-lg shadow-black/[0.06]",
            "backdrop-blur-md",
            "text-sm font-medium",
            "transition-all duration-300",
          ].join(" "),

          // Toast title — prominent weight
          title: "font-semibold text-[0.8125rem] leading-5 tracking-tight",

          // Toast description — muted, lighter weight
          description: "text-[0.75rem] leading-4 mt-0.5 opacity-75 font-normal",

          // Action button
          actionButton: [
            "ml-auto shrink-0",
            "text-[0.7rem] font-bold uppercase tracking-wider",
            "px-2.5 py-1 rounded-md",
            "bg-current/10 hover:bg-current/20",
            "transition-colors duration-150",
            "cursor-pointer",
          ].join(" "),

          // Dismiss (cancel) text button
          cancelButton: [
            "ml-1 shrink-0",
            "text-[0.7rem] font-medium opacity-60 hover:opacity-100",
            "transition-opacity duration-150",
            "cursor-pointer",
          ].join(" "),

          // Auto-dismiss progress bar
          loader: "h-0.5 bg-current opacity-30",

          // Close (×) button
          closeButton: [
            "!top-3 !right-3",
            "opacity-0 group-hover/toast:opacity-60 hover:!opacity-100",
            "!bg-current/10 hover:!bg-current/20",
            "!border-0 !shadow-none",
            "transition-opacity duration-200",
          ].join(" "),
        },
      }}
      icons={{
        success: (
          <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <CircleCheckIcon className="size-3" strokeWidth={2.5} />
          </span>
        ),
        info: (
          <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400">
            <InfoIcon className="size-3" strokeWidth={2.5} />
          </span>
        ),
        warning: (
          <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <TriangleAlertIcon className="size-3" strokeWidth={2.5} />
          </span>
        ),
        error: (
          <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400">
            <OctagonXIcon className="size-3" strokeWidth={2.5} />
          </span>
        ),
        loading: (
          <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
            <Loader2Icon className="size-3 animate-spin" />
          </span>
        ),
      }}
      style={
        {
          // Override Sonner's default CSS variables with our design tokens
          "--normal-bg":       "hsl(var(--popover))",
          "--normal-text":     "hsl(var(--popover-foreground))",
          "--normal-border":   "hsl(var(--border))",
          "--success-bg":      "hsl(142.1 70.6% 97%)",
          "--success-text":    "hsl(142.1 76.2% 22%)",
          "--success-border":  "hsl(142.1 76.2% 86%)",
          "--error-bg":        "hsl(0 86% 97%)",
          "--error-text":      "hsl(0 72.2% 28%)",
          "--error-border":    "hsl(0 72.2% 88%)",
          "--warning-bg":      "hsl(43 96% 96%)",
          "--warning-text":    "hsl(32 95% 25%)",
          "--warning-border":  "hsl(43 96% 82%)",
          "--info-bg":         "hsl(204 94% 96%)",
          "--info-text":       "hsl(204 80% 22%)",
          "--info-border":     "hsl(204 94% 84%)",
          "--border-radius":   "0.75rem",
          "--font-size":       "0.8125rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
