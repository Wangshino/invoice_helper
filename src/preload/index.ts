import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
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
  MatchingResult,
  ParsePreview,
  ImportSummary,
  EmailSyncResult,
  SyncLog,
  SentEmail
} from '../shared/types'

const api = {
  // ============ Invoices ============
  invoices: {
    getAll: (filters?: InvoiceFilters): Promise<IpcResult<Invoice[]>> =>
      ipcRenderer.invoke('invoices:getAll', filters),

    getById: (id: number): Promise<IpcResult<Invoice | null>> =>
      ipcRenderer.invoke('invoices:getById', id),

    create: (params: CreateInvoiceParams): Promise<IpcResult<{ id: number }>> =>
      ipcRenderer.invoke('invoices:create', params),

    remove: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('invoices:remove', id),

    importFiles: (): Promise<IpcResult<string[]>> =>
      ipcRenderer.invoke('invoices:importFiles'),

    importAndParse: (filePaths: string[]): Promise<IpcResult<ImportSummary>> =>
      ipcRenderer.invoke('invoices:importAndParse', filePaths),

    parseFile: (filePath: string): Promise<IpcResult<ParsePreview | null>> =>
      ipcRenderer.invoke('invoices:parseFile', filePath),

    countByStatus: (): Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>> =>
      ipcRenderer.invoke('invoices:countByStatus'),

    openFile: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('invoices:openFile', id),

    readFileAsBase64: (id: number): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('invoices:readFileAsBase64', id),

    extractOfdImages: (id: number): Promise<IpcResult<string[]>> =>
      ipcRenderer.invoke('invoices:extractOfdImages', id),

    batchDelete: (ids: number[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('invoices:batchDelete', ids),

    exportFiles: (ids: number[]): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('invoices:exportFiles', ids)
  },

  // ============ Email Accounts ============
  emailAccounts: {
    getAll: (): Promise<IpcResult<EmailAccount[]>> =>
      ipcRenderer.invoke('emailAccounts:getAll'),

    getById: (id: number): Promise<IpcResult<EmailAccount | null>> =>
      ipcRenderer.invoke('emailAccounts:getById', id),

    create: (params: CreateEmailAccountParams): Promise<IpcResult<{ id: number }>> =>
      ipcRenderer.invoke('emailAccounts:create', params),

    update: (id: number, data: UpdateEmailAccountParams): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('emailAccounts:update', id, data),

    remove: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('emailAccounts:remove', id),

    testConnection: (params: CreateEmailAccountParams): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('emailAccounts:testConnection', params),

    syncEmails: (accountId: number): Promise<IpcResult<EmailSyncResult>> =>
      ipcRenderer.invoke('emailAccounts:syncEmails', accountId),

    testConnectionById: (accountId: number): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('emailAccounts:testConnectionById', accountId),

    listFolders: (params: { imapHost: string; imapPort: number; email: string; password: string }): Promise<IpcResult<string[]>> =>
      ipcRenderer.invoke('emailAccounts:listFolders', params),

    listFoldersById: (accountId: number): Promise<IpcResult<string[]>> =>
      ipcRenderer.invoke('emailAccounts:listFoldersById', accountId),

    resetSync: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('emailAccounts:resetSync', id)
  },

  // ============ Email Sync ============
  emailSync: {
    getLog: (): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('emailSync:getLog'),

    clearLog: (): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('emailSync:clearLog'),

    setDebug: (enabled: boolean): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('emailSync:setDebug', enabled)
  },

  // ============ Sync Logs ============
  syncLogs: {
    getAll: (accountId?: number): Promise<IpcResult<SyncLog[]>> =>
      ipcRenderer.invoke('syncLogs:getAll', accountId),

    getById: (id: number): Promise<IpcResult<SyncLog | null>> =>
      ipcRenderer.invoke('syncLogs:getById', id),

    remove: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('syncLogs:remove', id),

    clearAll: (): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('syncLogs:clearAll'),

    clearByAccount: (accountId: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('syncLogs:clearByAccount', accountId)
  },

  // ============ Reimbursements ============
  reimbursements: {
    getAll: (filters?: ReimbursementFilters): Promise<IpcResult<Reimbursement[]>> =>
      ipcRenderer.invoke('reimbursements:getAll', filters),

    getById: (id: number): Promise<IpcResult<Reimbursement | null>> =>
      ipcRenderer.invoke('reimbursements:getById', id),

    create: (params: CreateReimbursementParams): Promise<IpcResult<{ id: number }>> =>
      ipcRenderer.invoke('reimbursements:create', params),

    update: (id: number, params: UpdateReimbursementParams): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('reimbursements:update', id, params),

    remove: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('reimbursements:remove', id),

    sendEmail: (id: number, emailTo: string, options?: { customSubject?: string; customBody?: string }): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('reimbursements:sendEmail', id, emailTo, options),

    previewEmail: (id: number, options?: { customSubject?: string; customBody?: string }): Promise<IpcResult<{ subject: string; html: string }>> =>
      ipcRenderer.invoke('reimbursements:previewEmail', id, options),

    countByStatus: (): Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>> =>
      ipcRenderer.invoke('reimbursements:countByStatus')
  },

  // ============ Matching ============
  matching: {
    findBestCombinations: (targetAmount: number): Promise<IpcResult<MatchingResult[]>> =>
      ipcRenderer.invoke('matching:findBestCombinations', targetAmount)
  },

  // ============ Sent Emails ============
  sentEmails: {
    getAll: (): Promise<IpcResult<SentEmail[]>> =>
      ipcRenderer.invoke('sentEmails:getAll'),

    findByReimbursement: (reimbId: number): Promise<IpcResult<SentEmail[]>> =>
      ipcRenderer.invoke('sentEmails:findByReimbursement', reimbId),

    remove: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('sentEmails:remove', id),

    clearAll: (): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('sentEmails:clearAll')
  },

  // ============ Settings ============
  settings: {
    get: (key: string): Promise<IpcResult<string | undefined>> =>
      ipcRenderer.invoke('settings:get', key),

    set: (key: string, value: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('settings:set', key, value),

    getAll: (): Promise<IpcResult<Record<string, string>>> =>
      ipcRenderer.invoke('settings:getAll')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
