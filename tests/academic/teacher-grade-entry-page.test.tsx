import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', role: 'TEACHER' } },
    status: 'authenticated',
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    hasFieldErrors = false
    fieldErrors = []
  },
  fetchApi: vi.fn(),
}))

vi.mock('@/lib/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode
    disabled?: boolean
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <select
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      value={value}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}))

import TeacherGradeEntryPage from '@/app/dashboard/teacher/grade-entry/page'

describe('teacher grade-entry page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'teacher-sections') {
        return {
          data: [{ id: 'section-1', className: 'Class 11', sectionName: 'A' }],
        }
      }
      if (queryKey[0] === 'exam-sessions' || queryKey[0] === 'section-students') {
        return { data: [] }
      }
      if (queryKey[0] === 'section-offerings') {
        return { data: undefined }
      }
      return { data: null, error: null }
    })
  })

  it('does not enter a render loop while offerings load after selecting a section', () => {
    render(<TeacherGradeEntryPage />)

    const sectionSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(sectionSelect, { target: { value: 'section-1' } })

    expect((sectionSelect as HTMLSelectElement).value).toBe('section-1')
    expect(screen.queryByText('Page Error')).toBeNull()
  })
})
