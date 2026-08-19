import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockUsePathname, mockUseSession } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockUseSession: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('next-auth/react', () => ({ useSession: mockUseSession }))

import { FeeOverdueModal } from '../components/student/FeeOverdueModal'

const overduePayload = {
  hasOverdue: true,
  totalOverdue: 3000,
  overdueCount: 1,
  invoices: [{
    id: 'invoice-1',
    challanNumber: 'ESA-001',
    month: 'August 2026',
    studentName: 'Ayesha Khan',
    outstandingAmount: 3000,
  }],
}

function renderReminder() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FeeOverdueModal />
    </QueryClientProvider>
  )
}

describe('FeeOverdueModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseSession.mockReturnValue({ data: { user: { id: 'student-user', role: 'STUDENT' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(overduePayload),
    }))
  })

  it('closes without blocking the page when the close button is pressed', async () => {
    renderReminder()
    await screen.findByText('Fee Overdue Reminder')

    fireEvent.click(screen.getByRole('button', { name: 'Close overdue reminder' }))

    await waitFor(() => expect(screen.queryByText('Fee Overdue Reminder')).toBeNull())
  })

  it('dismisses when the user clicks outside the reminder card', async () => {
    renderReminder()
    await screen.findByText('Fee Overdue Reminder')

    fireEvent.click(document)

    await waitFor(() => expect(screen.queryByText('Fee Overdue Reminder')).toBeNull())
  })
})
