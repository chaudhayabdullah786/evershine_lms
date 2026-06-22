import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { role: 'STUDENT' } },
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: any[]) => mockUseQuery(...args),
  useMutation: (...args: any[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/lib/api-client', () => ({
  fetchApi: vi.fn(),
  fetchPaginatedApi: vi.fn(),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <button type="button" data-testid={`teacher-option-${value}`}>{children}</button>,
}))

import QueriesPage from '@/app/dashboard/queries/page'

describe('QueriesPage teacher list handling', () => {
  beforeEach(() => {
    mockUseQuery.mockImplementation((options: any) => {
      if (options.queryKey[0] === 'student-queries') {
        return { data: { data: [] }, isLoading: false }
      }

      if (options.queryKey[0] === 'teachers-list') {
        return {
          data: [
            { userId: 'teacher-1', firstName: 'Alice', lastName: 'Teacher', specialization: 'Math' },
          ],
          isLoading: false,
        }
      }

      return { data: undefined, isLoading: false }
    })

    mockUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    })
  })

  it('renders teacher choices from the fetched teacher list', () => {
    render(<QueriesPage />)

    expect(screen.getByTestId('teacher-option-teacher-1').textContent).toContain('Alice Teacher (Math)')
  })
})
