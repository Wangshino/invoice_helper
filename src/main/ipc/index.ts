import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as invoiceRepo from '../repositories/invoice-repository'
import * as emailAccountRepo from '../repositories/email-account-repository'
import * as reimbursementRepo from '../repositories/reimbursement-repository'
import * as settingsRepo from '../repositories/settings-repository'
import { findBestCombinations } from '../services/matching'
import { parseAndStore, parseInvoiceFile, detectFileType } from '../services/invoice-parser'
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
  UpdateEmailAccountParams
  ReimbursementRow,
  Reimbursement,
  CreateReimbursementParams,
  UpdateReimbursementParams,
  ReimbursementFilters,
  MatchingResult,
  InvoiceFileType,
  ParsePreview
} from '../../shared/types'
import type { ParsedInvoice, from '../services/invoice-parser'
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
  handler: (...args: unknown[]) => T
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

  /** 解析并导入发票文件: 选择文件 → 解析 → 存储 → 入库 */
  safeHandle<IpcResult<Invoice[]>>('invoices:importAndParse', async (filePaths: unknown) => {
    const paths = filePaths as string[]
    if (!Array.isArray(paths) || paths.length === 0) return ok([])

    const invoices: Invoice[] = []
    for (const sourcePath of paths) {
      const { parsed, filePath, type } = await parseAndStore(sourcePath)
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
        fileType: type,
        fileName: basename(sourcePath),
        source: 'manual'
      })
      const row = invoiceRepo.findById(id)
      if (row) invoices.push(mapInvoice(row))
    }
    return ok(invoices)
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

  safeHandle<IpcResult<boolean>>('emailAccounts:testConnection', async () => {
    // TODO: Phase 4 — IMAP 连接测试
    return ok(true)
  })

  safeHandle<IpcResult<Invoice[]>>('emailAccounts:syncEmails', async () => {
    // TODO: Phase 4 — 邮件同步导入
    return ok([])
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
    return ok(mapReimbursement(row, mapInvoices(invoiceRows))
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
      invoice_date: inv.invoice_date
      seller_name: inv.seller_name
    })

    const results = findBestCombinations(candidates, amount)
    return ok(results as unknown as MatchingResult[])
  })

  // ============ Settings ============

  safeHandle<IpcResult<string | undefined>>('settings:get', (key: unknown) => {
    return ok(settingsRepo.get(String(key))
  })

  safeHandle<IpcResult<void>>('settings:set', (key: unknown, value: unknown) => {
    settingsRepo.set(String(key), String(value))
    return ok(undefined)
  })

  safeHandle<IpcResult<Record<string, string>>('settings:getAll', () => {
    return ok(settingsRepo.getAll())
  })
}
