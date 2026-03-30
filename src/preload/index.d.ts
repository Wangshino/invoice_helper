import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  IpcResult,
  Invoice,
  InvoiceFilters,
  CreateInvoiceParams,
  UpdateInvoiceParams,
  EmailAccount,
  CreateEmailAccountParams,
  UpdateEmailAccountParams,
  Reimbursement,
  CreateReimbursementParams,
  UpdateReimbursementParams,
  ReimbursementFilters,
  MatchingResult,
  ParsePreview,
  ImportSummary,
  EmailSyncResult,
  SyncLog,
  SentEmail,
  PaginatedResult
} from '../shared/types'

interface IpcAPI {
  invoices: {
    getAll: (filters?: InvoiceFilters, pagination?: { page: number; pageSize: number }) => Promise<IpcResult<Invoice[] | PaginatedResult<Invoice>>>
    getById: (id: number) => Promise<IpcResult<Invoice | null>>
    create: (params: CreateInvoiceParams) => Promise<IpcResult<{ id: number }>>
    remove: (id: number) => Promise<IpcResult<void>>
    importFiles: () => Promise<IpcResult<string[]>>
    importAndParse: (filePaths: string[]) => Promise<IpcResult<ImportSummary>>
    parseFile: (filePath: string) => Promise<IpcResult<ParsePreview | null>>
    countByStatus: () => Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>>
    openFile: (id: number) => Promise<IpcResult<void>>
    readFileAsBase64: (id: number) => Promise<IpcResult<string>>
    extractOfdImages: (id: number) => Promise<IpcResult<string[]>>
    batchDelete: (ids: number[]) => Promise<IpcResult<void>>
    batchUpdateCategory: (ids: number[], category: string) => Promise<IpcResult<void>>
    exportFiles: (ids: number[]) => Promise<IpcResult<string>>
    update: (id: number, params: UpdateInvoiceParams) => Promise<IpcResult<void>>
    getCategories: () => Promise<IpcResult<string[]>>
    batchRename: () => Promise<IpcResult<string>>
    exportCsv: (filters?: InvoiceFilters) => Promise<IpcResult<string>>
  }
  emailAccounts: {
    getAll: () => Promise<IpcResult<EmailAccount[]>>
    getById: (id: number) => Promise<IpcResult<EmailAccount | null>>
    create: (params: CreateEmailAccountParams) => Promise<IpcResult<{ id: number }>>
    update: (id: number, data: UpdateEmailAccountParams) => Promise<IpcResult<void>>
    remove: (id: number) => Promise<IpcResult<void>>
    testConnection: (params: CreateEmailAccountParams) => Promise<IpcResult<boolean>>
    testConnectionById: (accountId: number) => Promise<IpcResult<boolean>>
    syncEmails: (accountId: number) => Promise<IpcResult<EmailSyncResult>>
    listFolders: (params: { imapHost: string; imapPort: number; email: string; password: string }) => Promise<IpcResult<string[]>>
    listFoldersById: (accountId: number) => Promise<IpcResult<string[]>>
    resetSync: (id: number) => Promise<IpcResult<void>>
  }
  emailSync: {
    getLog: () => Promise<IpcResult<string>>
    clearLog: () => Promise<IpcResult<void>>
    setDebug: (enabled: boolean) => Promise<IpcResult<void>>
  }
  syncLogs: {
    getAll: (accountId?: number) => Promise<IpcResult<SyncLog[]>>
    getById: (id: number) => Promise<IpcResult<SyncLog | null>>
    remove: (id: number) => Promise<IpcResult<void>>
    clearAll: () => Promise<IpcResult<void>>
    clearByAccount: (accountId: number) => Promise<IpcResult<void>>
  }
  reimbursements: {
    getAll: (filters?: ReimbursementFilters, pagination?: { page: number; pageSize: number }) => Promise<IpcResult<Reimbursement[] | PaginatedResult<Reimbursement>>>
    getById: (id: number) => Promise<IpcResult<Reimbursement | null>>
    create: (params: CreateReimbursementParams) => Promise<IpcResult<{ id: number }>>
    update: (id: number, params: UpdateReimbursementParams) => Promise<IpcResult<void>>
    remove: (id: number) => Promise<IpcResult<void>>
    sendEmail: (id: number, emailTo: string, options?: { customSubject?: string; customBody?: string }) => Promise<IpcResult<void>>
    previewEmail: (id: number, options?: { customSubject?: string; customBody?: string }) => Promise<IpcResult<{ subject: string; html: string }>>
    countByStatus: () => Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>>
  }
  matching: {
    findBestCombinations: (targetAmount: number) => Promise<IpcResult<MatchingResult[]>>
  }
  sentEmails: {
    getAll: () => Promise<IpcResult<SentEmail[]>>
    findByReimbursement: (reimbId: number) => Promise<IpcResult<SentEmail[]>>
    remove: (id: number) => Promise<IpcResult<void>>
    clearAll: () => Promise<IpcResult<void>>
  }
  settings: {
    get: (key: string) => Promise<IpcResult<string | undefined>>
    set: (key: string, value: string) => Promise<IpcResult<void>>
    getAll: () => Promise<IpcResult<Record<string, string>>>
  }
  app: {
    getVersion: () => Promise<IpcResult<string>>
    openExternal: (url: string) => void
  }
  updater: {
    check: () => Promise<IpcResult<void>>
    download: () => Promise<IpcResult<void>>
    install: () => Promise<IpcResult<void>>
    onStatus: (callback: (status: string, info?: string) => void) => () => void
    onProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
