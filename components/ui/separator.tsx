import * as React from "react"

import { cn } from "@/lib/utils"

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
}

export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      className={cn(
        orientation === 'vertical'
          ? 'h-full w-px bg-slate-200' : 'h-px w-full bg-slate-200',
        className
      )}
      {...props}
    />
  )
}
