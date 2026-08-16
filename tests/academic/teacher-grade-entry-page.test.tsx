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

  it('lists the published exam for the selected section and links it to the roster', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'teacher-sections') {
        return { data: [{ id: 'section-1', className: 'Class 11', sectionName: 'A' }] }
      }
      if (queryKey[0] === 'exam-sessions') {
        return {
          data: [{
            id: 'exam-1',
            name: 'SECOND STEP EXAM',
            term: '2026-2027',
            classSectionId: 'section-1',
            classLabel: 'Class 11 — A',
            totalMarks: 60,
          }],
        }
      }
      if (queryKey[0] === 'section-students') {
        return {
          data: [{ id: 'student-1', firstName: 'Test', lastName: 'Student', rollNumber: '001', fatherName: 'Parent' }],
        }
      }
      if (queryKey[0] === 'section-offerings') return { data: undefined }
      return { data: null, error: null }
    })

    render(<TeacherGradeEntryPage />)

    expect(screen.getByText('SECOND STEP EXAM — Class 11 — A')).toBeTruthy()
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'exam-1' } })
    expect((selects[1] as HTMLSelectElement).value).toBe('exam-1')
    expect((selects[2] as HTMLSelectElement).disabled).toBe(false)
  })

  it('renders saved custom fields and exposes draft edit controls', () => {
    useQueryMock.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === 'teacher-sections') {
        return { data: [{ id: 'section-1', className: 'Class 11', sectionName: 'A' }] }
      }
      if (queryKey[0] === 'exam-sessions') {
        return { data: [{ id: 'exam-1', name: '2025-2026', term: 'ACTIVE_YEAR' }] }
      }
      if (queryKey[0] === 'section-students') {
        return {
          data: [{
            id: 'student-1',
            firstName: 'Test',
            lastName: 'Student',
            rollNumber: '001',
            fatherName: 'Parent',
          }],
        }
      }
      if (queryKey[0] === 'section-offerings') return { data: undefined }
      if (queryKey[0] === 'existing-result') {
        return {
          data: {
            id: 'result-1',
            studentId: 'student-1',
            declarationStatus: 'DRAFT',
            customFields: [{ label: 'Ethics', value: '15' }],
            subjectResults: [],
          },
        }
      }
      return { data: null, error: null }
    })

    render(<TeacherGradeEntryPage />)

    expect(screen.getByText('Ethics')).toBeTruthy()
    expect(screen.getByText('15')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Ethics' }))

    expect((screen.getByRole('textbox', { name: 'Edit label for Ethics' }) as HTMLInputElement).value).toBe('Ethics')
    expect((screen.getByRole('textbox', { name: 'Edit value for Ethics' }) as HTMLInputElement).value).toBe('15')
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
