import { ElectronAPI } from '@electron-toolkit/preload'

interface IpcAPI {
  invoices: {
    getAll: (filters?: Record<string, unknown>) => Promise<unknown[]>
    getById: (id: number) => Promise<unknown>
    create: (invoice: Record<string, unknown>) => Promise<unknown>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    remove: (id: number) => Promise<void>
    importFiles: () => Promise<unknown[]>
    parseFile: (filePath: string) => Promise<unknown>
  }
  emailAccounts: {
    getAll: () => Promise<unknown[]>
    create: (account: Record<string, unknown>) => Promise<unknown>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    remove: (id: number) => Promise<void>
    testConnection: (config: Record<string, unknown>) => Promise<boolean>
    syncEmails: (accountId: number) => Promise<unknown[]>
  }
  reimbursements: {
    getAll: (filters?: Record<string, unknown>) => Promise<unknown[]>
    getById: (id: number) => Promise<unknown>
    create: (data: Record<string, unknown>) => Promise<unknown>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    remove: (id: number) => Promise<void>
    sendEmail: (id: number, emailTo: string) => Promise<void>
  }
  matching: {
    findBestCombinations: (targetAmount: number, dateRange?: [string, string]) => Promise<unknown[]>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
