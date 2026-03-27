import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  IpcResult,
  Invoice,
  InvoiceFilters,
  CreateInvoiceParams
  InvoiceFileType
  EmailAccount
  CreateEmailAccountParams
  UpdateEmailAccountParams
  Reimbursement
  CreateReimbursementParams
  UpdateReimbursementParams
  ReimbursementFilters
  MatchingResult
} from '../shared/types'

import type { ParsedInvoice } from '../services/invoice-parser'import type {
  IpcResult,
  Invoice,
  InvoiceFilters,
  CreateInvoiceParams,
  EmailAccount,
  CreateEmailAccountParams,
  UpdateEmailAccountParams,
  Reimbursement,
  CreateReimbursementParams,
  UpdateReimbursementParams,
  ReimbursementFilters,
  MatchingResult
} from '../shared/types'

interface IpcAPI {
  invoices: {
    getAll: (filters?: InvoiceFilters) => Promise<IpcResult<Invoice[]>>
    getById: (id: number) => Promise<IpcResult<Invoice | null>>
    create: (params: CreateInvoiceParams) => Promise<IpcResult<{ id: number }>>
    remove: (id: number) => Promise<IpcResult<void>
    importFiles: () => Promise<IpcResult<string[]>>
    importAndParse: (filePaths: string[]) => Promise<IpcResult<Invoice[]>>
    parseFile: (filePath: string) => Promise<IpcResult<ParsePreview | null>
    countByStatus: () => Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>>
  }
  emailAccounts: {
    getAll: () => Promise<IpcResult<EmailAccount[]>>
    getById: (id: number) => Promise<IpcResult<EmailAccount | null>>
    create: (params: CreateEmailAccountParams) => Promise<IpcResult<{ id: number }>>
    update: (id: number, data: UpdateEmailAccountParams) => Promise<IpcResult<void>>
    remove: (id: number) => Promise<IpcResult<void>>
    testConnection: (params: CreateEmailAccountParams) => Promise<IpcResult<boolean>>
    syncEmails: (accountId: number) => Promise<IpcResult<Invoice[]>>
  }
  reimbursements: {
    getAll: (filters?: ReimbursementFilters) => Promise<IpcResult<Reimbursement[]>>
    getById: (id: number) => Promise<IpcResult<Reimbursement | null>>
    create: (params: CreateReimbursementParams) => Promise<IpcResult<{ id: number }>>
    update: (id: number, params: UpdateReimbursementParams) => Promise<IpcResult<void>>
    remove: (id: number) => Promise<IpcResult<void>>
    sendEmail: (id: number, emailTo: string) => Promise<IpcResult<void>>
    countByStatus: () => Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>>
  }
  matching: {
    findBestCombinations: (targetAmount: number) => Promise<IpcResult<MatchingResult[]>>
  }
  settings: {
    get: (key: string) => Promise<IpcResult<string | undefined>>
    set: (key: string, value: string) => Promise<IpcResult<void>>
    getAll: () => Promise<IpcResult<Record<string, string>>>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
