import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  IpcResult,
  Invoice,
  InvoiceFilters,
  CreateInvoiceParams,
  InvoiceFileType,
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
  SentEmail
} from '../shared/types'

interface IpcAPI {
  invoices: {
    getAll: (filters?: InvoiceFilters) => Promise<IpcResult<Invoice[]>>
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
    exportFiles: (ids: number[]) => Promise<IpcResult<string>>
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
  reimbursements: {
    getAll: (filters?: ReimbursementFilters) => Promise<IpcResult<Reimbursement[]>>
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
  settings: {
    get: (key: string) => Promise<IpcResult<string | undefined>>
    set: (key: string, value: string) => Promise<IpcResult<void>>
    getAll: () => Promise<IpcResult<Record<string, string>>>
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
  sentEmails: {
    getAll: () => Promise<IpcResult<SentEmail[]>>
    findByReimbursement: (reimbId: number) => Promise<IpcResult<SentEmail[]>>
    remove: (id: number) => Promise<IpcResult<void>>
    clearAll: () => Promise<IpcResult<void>>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
