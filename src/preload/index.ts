import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Invoice operations
  invoices: {
    getAll: (filters?: Record<string, unknown>) => ipcRenderer.invoke('invoices:getAll', filters),
    getById: (id: number) => ipcRenderer.invoke('invoices:getById', id),
    create: (invoice: Record<string, unknown>) => ipcRenderer.invoke('invoices:create', invoice),
    update: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('invoices:update', id, data),
    remove: (id: number) => ipcRenderer.invoke('invoices:delete', id),
    importFiles: () => ipcRenderer.invoke('invoices:importFiles'),
    parseFile: (filePath: string) => ipcRenderer.invoke('invoices:parseFile', filePath)
  },

  // Email account operations
  emailAccounts: {
    getAll: () => ipcRenderer.invoke('emailAccounts:getAll'),
    create: (account: Record<string, unknown>) => ipcRenderer.invoke('emailAccounts:create', account),
    update: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('emailAccounts:update', id, data),
    remove: (id: number) => ipcRenderer.invoke('emailAccounts:delete', id),
    testConnection: (config: Record<string, unknown>) => ipcRenderer.invoke('emailAccounts:testConnection', config),
    syncEmails: (accountId: number) => ipcRenderer.invoke('emailAccounts:syncEmails', accountId)
  },

  // Reimbursement operations
  reimbursements: {
    getAll: (filters?: Record<string, unknown>) => ipcRenderer.invoke('reimbursements:getAll', filters),
    getById: (id: number) => ipcRenderer.invoke('reimbursements:getById', id),
    create: (data: Record<string, unknown>) => ipcRenderer.invoke('reimbursements:create', data),
    update: (id: number, data: Record<string, unknown>) => ipcRenderer.invoke('reimbursements:update', id, data),
    remove: (id: number) => ipcRenderer.invoke('reimbursements:delete', id),
    sendEmail: (id: number, emailTo: string) => ipcRenderer.invoke('reimbursements:sendEmail', id, emailTo)
  },

  // Matching
  matching: {
    findBestCombinations: (targetAmount: number, dateRange?: [string, string]) =>
      ipcRenderer.invoke('matching:findBestCombinations', targetAmount, dateRange)
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
