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
  MatchingResult
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

    parseFile: (filePath: string): Promise<IpcResult<Invoice | null>> =>
      ipcRenderer.invoke('invoices:parseFile', filePath),

    countByStatus: (): Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>> =>
      ipcRenderer.invoke('invoices:countByStatus')
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

    syncEmails: (accountId: number): Promise<IpcResult<Invoice[]>> =>
      ipcRenderer.invoke('emailAccounts:syncEmails', accountId)
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

    sendEmail: (id: number, emailTo: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke('reimbursements:sendEmail', id, emailTo),

    countByStatus: (): Promise<IpcResult<{ status: string; count: number; totalAmount: number }[]>> =>
      ipcRenderer.invoke('reimbursements:countByStatus')
  },

  // ============ Matching ============
  matching: {
    findBestCombinations: (targetAmount: number): Promise<IpcResult<MatchingResult[]>> =>
      ipcRenderer.invoke('matching:findBestCombinations', targetAmount)
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
