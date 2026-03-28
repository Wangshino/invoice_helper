import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as invoiceRepo from '../repositories/invoice-repository'
import * as emailAccountRepo from '../repositories/email-account-repository'
import * as reimbursementRepo from '../repositories/reimbursement-repository'
import * as settingsRepo from '../repositories/settings-repository'
import * as syncLogRepo from '../repositories/sync-log-repository'
import { findBestCombinations } from '../services/matching'
import { storeInvoiceFile, deleteStoredFile, parseInvoiceFile, detectFileType } from '../services/invoice-parser'
import { testImapConnection, listMailboxes } from '../services/email-imap'
import { syncEmailAccount, getSyncLog, clearSyncLog, setDebugMode } from '../services/email-sync'
import { FieldMappers } from '../../shared/types'
import type {
  IpcResult,
  InvoiceRow,
  Invoice,
  InvoiceFilters,
  CreateInvoiceParams,
  EmailAccountRow,
  EmailAccount,
  CreateEmailAccountParams,
  UpdateEmailAccountParams,
  ReimbursementRow,
  Reimbursement,
  CreateReimbursementParams,
  UpdateReimbursementParams,
  ReimbursementFilters,
  MatchingResult,
  ParsePreview,
  ImportSummary,
  EmailSyncResult,
  SyncLog
} from '../../shared/types'
import { basename } from 'path'

// ============================================================
// Helpers
// ============================================================

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data }
}

function err(message: string): IpcResult<never> {
  return { success: false, error: message }
}

/** 安全执行 IPC handler, 捕获异常 */
function safeHandle<T>(
  channel: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => T | Promise<T>
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const result = handler(...args)
      return result instanceof Promise ? await result : result
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[IPC ${channel}] Error:`, message)
      return err(message)
    }
  })
}

/** 转换发票行 (snake_case → camelCase) */
function mapInvoice(row: InvoiceRow): Invoice {
  return FieldMappers.invoice.toCamel(row as unknown as Record<string, unknown>)
}

function mapInvoices(rows: InvoiceRow[]): Invoice[] {
  return FieldMappers.invoice.toList(rows as unknown as Record<string, unknown>[])
}

/** 转换邮箱账户行 (去掉 password 字段) */
function mapEmailAccount(row: EmailAccountRow): EmailAccount {
  const { password: _, ...rest } = row
  return FieldMappers.emailAccount.toCamel(rest as unknown as Record<string, unknown>) as EmailAccount
}

function mapEmailAccounts(rows: EmailAccountRow[]): EmailAccount[] {
  return rows.map(mapEmailAccount)
}

/** 转换报销单行 */
function mapReimbursement(row: ReimbursementRow, invoices?: Invoice[]): Reimbursement {
  const mapped = FieldMappers.reimbursement.toCamel(
    row as unknown as Record<string, unknown>
  ) as Reimbursement
  if (invoices) mapped.invoices = invoices
  return mapped
}

// ============================================================
// Register All IPC Handlers
// ============================================================
export function registerIpcHandlers(): void {
  // ============ Invoices ============

  safeHandle<IpcResult<Invoice[]>>('invoices:getAll', (filters?: InvoiceFilters) => {
    const rows = invoiceRepo.findAll(filters)
    return ok(mapInvoices(rows))
  })

  safeHandle<IpcResult<Invoice | null>>('invoices:getById', (id: unknown) => {
    const row = invoiceRepo.findById(Number(id))
    return row ? ok(mapInvoice(row)) : ok(null)
  })

  safeHandle<IpcResult<{ id: number }>>('invoices:create', (params: CreateInvoiceParams) => {
    const id = invoiceRepo.create(params)
    return ok({ id })
  })

  safeHandle<IpcResult<void>>('invoices:remove', (id: unknown) => {
    const row = invoiceRepo.findById(Number(id))
    if (row?.file_path) {
      deleteStoredFile(row.file_path)
    }
    invoiceRepo.remove(Number(id))
    return ok(undefined)
  })

  safeHandle<IpcResult<string[]>>('invoices:importFiles', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return err('No focused window')
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '发票文件', extensions: ['pdf', 'ofd', 'xml'] }]
    })
    return result.canceled ? ok([]) : ok(result.filePaths)
  })

  /** 解析并导入发票文件: 解析 → 去重 → 存储 → 入库 */
  safeHandle<IpcResult<ImportSummary>>('invoices:importAndParse', async (filePaths: unknown) => {
    const paths = filePaths as string[]
    if (!Array.isArray(paths) || paths.length === 0) return ok({ invoices: [], skipped: [], failed: [] })

    const invoices: Invoice[] = []
    const skipped: { fileName: string; invoiceNumber: string }[] = []
    const failed: { fileName: string; error: string }[] = []

    for (const sourcePath of paths) {
      const fileName = basename(sourcePath)
      try {
        // 1. 先解析
        const parsed = await parseInvoiceFile(sourcePath)

        // 2. 按发票号码去重
        if (parsed.invoiceNumber) {
          const existing = invoiceRepo.findByInvoiceNumber(parsed.invoiceNumber)
          if (existing) {
            skipped.push({ fileName, invoiceNumber: parsed.invoiceNumber })
            continue
          }
        }

        // 3. 解析成功且无重复 → 存储文件
        const fileType = detectFileType(sourcePath)
        const filePath = storeInvoiceFile(sourcePath)

        // 4. 入库
        const id = invoiceRepo.create({
          invoiceNumber: parsed.invoiceNumber,
          invoiceCode: parsed.invoiceCode,
          invoiceDate: parsed.invoiceDate,
          invoiceType: parsed.invoiceType,
          sellerName: parsed.sellerName,
          sellerTaxId: parsed.sellerTaxId,
          buyerName: parsed.buyerName,
          buyerTaxId: parsed.buyerTaxId,
          amount: parsed.amount,
          taxAmount: parsed.taxAmount,
          totalAmount: parsed.totalAmount,
          filePath,
          fileType,
          fileName,
          source: 'manual'
        })
        const row = invoiceRepo.findById(id)
        if (row) invoices.push(mapInvoice(row))
      } catch (e) {
        failed.push({ fileName, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return ok({ invoices, skipped, failed })
  })

  /** 解析单个文件预览, 不入库 */
  safeHandle<IpcResult<ParsePreview>>('invoices:parseFile', async (filePath: unknown) => {
    const path = String(filePath)
    const fileType = detectFileType(path)
    const parsed = await parseInvoiceFile(path)
    return ok({ parsed, fileType, fileName: basename(path) })
  })

  safeHandle<IpcResult<{ status: string; count: number; totalAmount: number }[]>>(
    'invoices:countByStatus',
    () => {
      return ok(invoiceRepo.countByStatus())
    }
  )

  // ============ Email Accounts ============

  safeHandle<IpcResult<EmailAccount[]>>('emailAccounts:getAll', () => {
    const rows = emailAccountRepo.findAll()
    return ok(mapEmailAccounts(rows))
  })

  safeHandle<IpcResult<EmailAccount | null>>('emailAccounts:getById', (id: unknown) => {
    const row = emailAccountRepo.findById(Number(id))
    return row ? ok(mapEmailAccount(row)) : ok(null)
  })

  safeHandle<IpcResult<{ id: number }>>('emailAccounts:create', (params: CreateEmailAccountParams) => {
    const id = emailAccountRepo.create(params)
    return ok({ id })
  })

  safeHandle<IpcResult<void>>('emailAccounts:update', (id: unknown, data: UpdateEmailAccountParams) => {
    emailAccountRepo.update(Number(id), data)
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('emailAccounts:remove', (id: unknown) => {
    emailAccountRepo.remove(Number(id))
    return ok(undefined)
  })

  safeHandle<IpcResult<boolean>>('emailAccounts:testConnection', async (params: CreateEmailAccountParams) => {
    await testImapConnection({
      host: params.imapHost,
      port: params.imapPort ?? 993,
      user: params.email,
      pass: params.password
    })
    return ok(true)
  })

  safeHandle<IpcResult<EmailSyncResult>>('emailAccounts:syncEmails', async (accountId: unknown) => {
    const result = await syncEmailAccount(Number(accountId))
    return ok(result)
  })

  safeHandle<IpcResult<boolean>>('emailAccounts:testConnectionById', async (accountId: unknown) => {
    const account = emailAccountRepo.findById(Number(accountId))
    if (!account) throw new Error('账户不存在')
    const password = emailAccountRepo.getDecryptedPassword(String(accountId))
    await testImapConnection({
      host: account.imap_host,
      port: account.imap_port,
      user: account.email,
      pass: password
    })
    return ok(true)
  })

  safeHandle<IpcResult<string[]>>('emailAccounts:listFolders', async (params: { imapHost: string; imapPort: number; email: string; password: string }) => {
    const folders = await listMailboxes({
      host: params.imapHost,
      port: params.imapPort,
      user: params.email,
      pass: params.password
    })
    return ok(folders)
  })

  safeHandle<IpcResult<string[]>>('emailAccounts:listFoldersById', async (accountId: unknown) => {
    const account = emailAccountRepo.findById(Number(accountId))
    if (!account) throw new Error('账户不存在')
    const password = emailAccountRepo.getDecryptedPassword(String(accountId))
    const folders = await listMailboxes({
      host: account.imap_host,
      port: account.imap_port,
      user: account.email,
      pass: password
    })
    return ok(folders)
  })

  safeHandle<IpcResult<void>>('emailAccounts:resetSync', (id: unknown) => {
    emailAccountRepo.resetLastSyncUid(Number(id))
    return ok(undefined)
  })

  // ============ Email Sync Debug ============

  safeHandle<IpcResult<string>>('emailSync:getLog', () => {
    return ok(getSyncLog())
  })

  safeHandle<IpcResult<void>>('emailSync:clearLog', () => {
    clearSyncLog()
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('emailSync:setDebug', (enabled: unknown) => {
    setDebugMode(Boolean(enabled))
    return ok(undefined)
  })

  // ============ Sync Logs ============

  safeHandle<IpcResult<SyncLog[]>>('syncLogs:getAll', (accountId?: unknown) => {
    return ok(syncLogRepo.findAll(accountId ? Number(accountId) : undefined))
  })

  safeHandle<IpcResult<SyncLog | null>>('syncLogs:getById', (id: unknown) => {
    const log = syncLogRepo.findById(Number(id))
    return ok(log ?? null)
  })

  safeHandle<IpcResult<void>>('syncLogs:remove', (id: unknown) => {
    syncLogRepo.remove(Number(id))
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('syncLogs:clearAll', () => {
    syncLogRepo.clearAll()
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('syncLogs:clearByAccount', (accountId: unknown) => {
    syncLogRepo.removeAllForAccount(Number(accountId))
    return ok(undefined)
  })

  // ============ Invoice File Operations ============

  safeHandle<IpcResult<void>>('invoices:openFile', async (id: unknown) => {
    const row = invoiceRepo.findById(Number(id))
    if (!row) throw new Error('发票不存在')
    await shell.openPath(row.file_path)
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('invoices:batchDelete', (ids: unknown) => {
    const idList = ids as number[]
    for (const id of idList) {
      const row = invoiceRepo.findById(id)
      if (row?.file_path) deleteStoredFile(row.file_path)
      invoiceRepo.remove(id)
    }
    return ok(undefined)
  })

  safeHandle<IpcResult<string>>('invoices:exportFiles', async (ids: unknown) => {
    const idList = ids as number[]
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return err('No focused window')

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return ok('')

    const fs = await import('fs')
    const { join, basename } = await import('path')
    const destDir = result.filePaths[0]
    let exported = 0

    for (const id of idList) {
      const row = invoiceRepo.findById(id)
      if (!row?.file_path) continue
      const destPath = join(destDir, basename(row.file_path))
      fs.copyFileSync(row.file_path, destPath)
      exported++
    }
    return ok(`已导出 ${exported} 个文件到 ${destDir}`)
  })

  // ============ Reimbursements ============

  safeHandle<IpcResult<Reimbursement[]>>('reimbursements:getAll', (filters?: ReimbursementFilters) => {
    const rows = reimbursementRepo.findAll(filters)
    return ok(rows.map((r) => mapReimbursement(r)))
  })

  safeHandle<IpcResult<Reimbursement | null>>('reimbursements:getById', (id: unknown) => {
    const row = reimbursementRepo.findById(Number(id))
    if (!row) return ok(null)
    const invoiceRows = reimbursementRepo.findInvoices(Number(id))
    return ok(mapReimbursement(row, mapInvoices(invoiceRows)))
  })

  safeHandle<IpcResult<{ id: number }>>('reimbursements:create', (params: CreateReimbursementParams) => {
    const id = reimbursementRepo.create(params)
    return ok({ id })
  })

  safeHandle<IpcResult<void>>('reimbursements:update', (id: unknown, params: UpdateReimbursementParams) => {
    reimbursementRepo.update(Number(id), params)
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('reimbursements:remove', (id: unknown) => {
    reimbursementRepo.remove(Number(id))
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('reimbursements:sendEmail', async () => {
    // TODO: Phase 6 — 发送报销邮件
    return ok(undefined)
  })

  safeHandle<IpcResult<{ status: string; count: number; totalAmount: number }[]>>(
    'reimbursements:countByStatus',
    () => {
      return ok(reimbursementRepo.countByStatus())
    }
  )

  // ============ Matching ============

  safeHandle<IpcResult<MatchingResult[]>>('matching:findBestCombinations', (targetAmount: unknown) => {
    const amount = Number(targetAmount)
    if (isNaN(amount) || amount <= 0) return ok([])

    const unreimbursed = invoiceRepo.findAll({ status: 'unreimbursed' })
    const candidates = unreimbursed.map((inv) => ({
      id: inv.id,
      total_amount: inv.total_amount ?? 0,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      seller_name: inv.seller_name
    }))

    const results = findBestCombinations(candidates, amount)
    return ok(results as unknown as MatchingResult[])
  })

  // ============ Settings ============

  safeHandle<IpcResult<string | undefined>>('settings:get', (key: unknown) => {
    return ok(settingsRepo.get(String(key)))
  })

  safeHandle<IpcResult<void>>('settings:set', (key: unknown, value: unknown) => {
    settingsRepo.set(String(key), String(value))
    return ok(undefined)
  })

  safeHandle<IpcResult<Record<string, string>>>('settings:getAll', () => {
    return ok(settingsRepo.getAll())
  })
}
