import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  role: string
  name?: string
  campusId?: string | null
}

interface AppState {
  user: User | null
  setUser: (user: User | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (isOpen: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: 'lms-storage',
    }
  )
)
