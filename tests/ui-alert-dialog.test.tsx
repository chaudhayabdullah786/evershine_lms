import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

describe('AlertDialog', () => {
  it('opens when trigger and action buttons contain icons and text', () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>
            <CheckCircle2 />
            Declare Result
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Declare this result?</AlertDialogTitle>
            <AlertDialogDescription>This publishes the result.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>
              <CheckCircle2 />
              Yes, Declare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Declare Result' }))

    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Yes, Declare' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
  })
})
