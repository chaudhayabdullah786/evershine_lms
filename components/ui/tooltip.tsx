'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// WHY: Lightweight tooltip implementation using native HTML/CSS positioning.
// Avoids pulling in a heavy Radix Tooltip dependency for simple informational hints.
// Uses CSS group-hover + focus-within for accessibility without JS state management.

interface TooltipProviderProps {
  children: React.ReactNode
  /** Delay in ms before showing tooltip (reserved for future use) */
  delayDuration?: number
}

function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>
}

interface TooltipProps {
  children: React.ReactNode
}

function Tooltip({ children }: TooltipProps) {
  return <div className="relative inline-flex group">{children}</div>
}

interface TooltipTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
}

const TooltipTrigger = React.forwardRef<HTMLDivElement, TooltipTriggerProps>(
  ({ className, asChild, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="tooltip-trigger"
        className={cn('inline-flex cursor-pointer', className)}
        tabIndex={0}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TooltipTrigger.displayName = 'TooltipTrigger'

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
}

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, side = 'top', children, ...props }, ref) => {
    const sideClasses: Record<string, string> = {
      top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
      bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
      left: 'right-full top-1/2 -translate-y-1/2 mr-2',
      right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    }

    return (
      <div
        ref={ref}
        role="tooltip"
        data-slot="tooltip-content"
        className={cn(
          'absolute z-50 pointer-events-none',
          'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
          'group-focus-within:opacity-100 group-focus-within:scale-100',
          'transition-all duration-150 ease-out',
          'rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-md',
          'whitespace-normal',
          sideClasses[side] ?? sideClasses.top,
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TooltipContent.displayName = 'TooltipContent'

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
