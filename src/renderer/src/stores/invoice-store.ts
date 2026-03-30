import { create } from 'zustand'
import type { Invoice, InvoiceFilters } from '../../../shared/types'

interface InvoiceStore {
  invoices: Invoice[]
  total: number
  filters: InvoiceFilters
  pagination: { page: number; pageSize: number }
  loading: boolean
  categories: string[]
  stats: { status: string; count: number; totalAmount: number }[]

  setFilters: (filters: InvoiceFilters) => void
  setPagination: (p: { page: number; pageSize: number }) => void
  loadInvoices: () => Promise<void>
  loadCategories: () => Promise<void>
  loadStats: () => Promise<void>
  invalidate: () => void
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  invoices: [],
  total: 0,
  filters: {},
  pagination: { page: 1, pageSize: 50 },
  loading: false,
  categories: [],
  stats: [],

  setFilters: (filters) => {
    set({ filters, pagination: { ...get().pagination, page: 1 } })
    get().loadInvoices()
  },

  setPagination: (p) => {
    set({ pagination: p })
    get().loadInvoices()
  },

  loadInvoices: async () => {
    set({ loading: true })
    const { filters, pagination } = get()
    const result = await window.api.invoices.getAll(filters, pagination)
    if (result.success && result.data) {
      const data = result.data
      if ('items' in data) {
        set({ invoices: data.items, total: data.total })
      } else {
        set({ invoices: data, total: data.length })
      }
    }
    set({ loading: false })
  },

  loadCategories: async () => {
    const result = await window.api.invoices.getCategories()
    if (result.success && result.data) set({ categories: result.data })
  },

  loadStats: async () => {
    const result = await window.api.invoices.countByStatus()
    if (result.success && result.data) set({ stats: result.data })
  },

  invalidate: () => { get().loadInvoices(); get().loadStats(); get().loadCategories() }
}))
