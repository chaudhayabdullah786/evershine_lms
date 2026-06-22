import * as React from 'react'

import { cn } from '@/lib/utils'

type CheckboxProps = React.ComponentProps<'input'> & {
  onCheckedChange?: (checked: boolean) => void
}

function Checkbox({ className, onCheckedChange, onChange, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'h-4 w-4 rounded border border-slate-300 text-blue-600 transition duration-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      onChange={(event) => {
        onChange?.(event)
        onCheckedChange?.(event.currentTarget.checked)
      }}
      {...props}
    />
  )
}

export { Checkbox }
