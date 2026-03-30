import { create } from 'zustand'
import type { Reimbursement, ReimbursementFilters } from '../../../shared/types'

interface ReimbursementStore {
  reimbursements: Reimbursement[]
  total: number
  filters: ReimbursementFilters
  pagination: { page: number; pageSize: number }
  loading: boolean
  stats: { status: string; count: number; totalAmount: number }[]

  setFilters: (filters: ReimbursementFilters) => void
  setPagination: (p: { page: number; pageSize: number }) => void
  loadList: () => Promise<void>
  loadStats: () => Promise<void>
  invalidate: () => void
}

export const useReimbursementStore = create<ReimbursementStore>((set, get) => ({
  reimbursements: [],
  total: 0,
  filters: {},
  pagination: { page: 1, pageSize: 20 },
  loading: false,
  stats: [],

  setFilters: (filters) => {
    set({ filters, pagination: { ...get().pagination, page: 1 } })
    get().loadList()
  },

  setPagination: (p) => {
    set({ pagination: p })
    get().loadList()
  },

  loadList: async () => {
    set({ loading: true })
    const { filters, pagination } = get()
    const result = await window.api.reimbursements.getAll(filters, pagination)
    if (result.success && result.data) {
      const data = result.data
      if ('items' in data) {
        set({ reimbursements: data.items, total: data.total })
      } else {
        set({ reimbursements: data, total: data.length })
      }
    }
    set({ loading: false })
  },

  loadStats: async () => {
    const result = await window.api.reimbursements.countByStatus()
    if (result.success && result.data) set({ stats: result.data })
  },

  invalidate: () => { get().loadList(); get().loadStats() }
}))
