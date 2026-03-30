import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import * as invoiceRepo from '../repositories/invoice-repository'
import * as emailAccountRepo from '../repositories/email-account-repository'
import * as reimbursementRepo from '../repositories/reimbursement-repository'
import * as settingsRepo from '../repositories/settings-repository'
import * as syncLogRepo from '../repositories/sync-log-repository'
import * as sentEmailRepo from '../repositories/sent-email-repository'
import { findBestCombinations } from '../services/matching'
import { storeInvoiceFile, deleteStoredFile, parseInvoiceFile, detectFileType, buildStandardFileName } from '../services/invoice-parser'
import { testImapConnection, listMailboxes } from '../services/email-imap'
import { syncEmailAccount, getSyncLog, clearSyncLog, setDebugMode } from '../services/email-sync'
import { sendReimbursementEmail, previewReimbursementEmail } from '../services/email-sender'
import { createBackup, restoreBackup } from '../services/backup'
import { logOperation, getRecentLogs, clearAllLogs } from '../services/operation-log'
import { FieldMappers } from '../../shared/types'
import type {
  IpcResult,
  InvoiceRow,
  Invoice,
  InvoiceFilters,
  CreateInvoiceParams,
  UpdateInvoiceParams,
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
  SyncLog,
  SentEmail,
  PaginationParams,
  PaginatedResult,
  OperationLog
} from '../../shared/types'
import { basename, join } from 'path'
import * as fs from 'fs'
import AdmZip from 'adm-zip'

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

  safeHandle<IpcResult<Invoice[] | PaginatedResult<Invoice>>>('invoices:getAll', (filters?: InvoiceFilters, pagination?: PaginationParams) => {
    if (pagination) {
      const result = invoiceRepo.findAll(filters ?? {}, pagination)
      return ok({ items: mapInvoices(result.items), total: result.total, page: pagination.page, pageSize: pagination.pageSize })
    }
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
    logOperation({ action: 'invoice_delete', targetType: 'invoice', targetId: Number(id), detail: { invoiceNumber: row?.invoice_number } })
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

        // 3. 解析成功且无重复 → 存储文件（使用标准文件名）
        const fileType = detectFileType(sourcePath)
        const ext = sourcePath.split('.').pop() || fileType
        const standardName = buildStandardFileName(parsed, ext)
        const filePath = storeInvoiceFile(sourcePath, standardName)

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
          invoiceContent: parsed.invoiceContent,
          filePath,
          fileType,
          fileName: standardName,
          source: 'manual'
        })
        const row = invoiceRepo.findById(id)
        if (row) invoices.push(mapInvoice(row))
      } catch (e) {
        failed.push({ fileName, error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (invoices.length > 0) {
      logOperation({
        action: 'invoice_import',
        targetType: 'invoice',
        detail: { count: invoices.length, fileNames: invoices.map(i => i.fileName).filter(Boolean) }
      })
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

  safeHandle<IpcResult<void>>('invoices:update', (id: unknown, params: UpdateInvoiceParams) => {
    invoiceRepo.update(Number(id), params)
    logOperation({ action: 'invoice_edit', targetType: 'invoice', targetId: Number(id), detail: { changedFields: Object.keys(params) } })
    return ok(undefined)
  })

  safeHandle<IpcResult<string[]>>('invoices:getCategories', () => {
    return ok(invoiceRepo.getCategories())
  })

  safeHandle<IpcResult<string>>('invoices:exportCsv', async (filters?: InvoiceFilters) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return err('No focused window')

    const result = await dialog.showSaveDialog(win, {
      defaultPath: `发票台账_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return ok('')

    const rows = invoiceRepo.findAll(filters)
    const header = '发票号码,发票代码,开票日期,发票类型,发票内容,销方名称,销方税号,购方名称,购方税号,金额,税额,价税合计,分类,状态,来源,文件名\n'
    const csvRows = rows.map(r =>
      [r.invoice_number, r.invoice_code, r.invoice_date, r.invoice_type, r.invoice_content,
       r.seller_name, r.seller_tax_id, r.buyer_name, r.buyer_tax_id,
       r.amount, r.tax_amount, r.total_amount, r.category,
       r.status === 'reimbursed' ? '已报销' : '未报销',
       r.source === 'email' ? '邮件' : '手动', r.file_name
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    fs.writeFileSync(result.filePath, '\ufeff' + header + csvRows, 'utf-8')
    return ok(`已导出 ${rows.length} 条到 ${result.filePath}`)
  })

  safeHandle<IpcResult<string>>('invoices:batchRename', () => {
    const all = invoiceRepo.findAll({})
    let renamed = 0
    const storageDir = join(app.getPath('userData'), 'invoices')

    for (const row of all) {
      if (!row.file_path || !row.invoice_number) continue
      // 生成标准文件名
      const ext = row.file_path.split('.').pop() || 'pdf'
      const content = (row.invoice_content || '未知内容').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)
      const amount = row.total_amount != null ? row.total_amount.toFixed(2) : '0.00'
      const date = row.invoice_date || 'unknown'
      const standardName = `${row.invoice_number}-${content}-${amount}-${date}.${ext}`

      // 如果文件名已经是标准名则跳过
      if (row.file_name === standardName) continue

      const newFilePath = join(storageDir, standardName)
      // 重命名磁盘文件
      if (fs.existsSync(row.file_path) && row.file_path !== newFilePath) {
        fs.renameSync(row.file_path, newFilePath)
        invoiceRepo.updateFilePathAndName(row.id, newFilePath, standardName)
        renamed++
      }
    }
    return ok(`已重命名 ${renamed} 个文件`)
  })

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

  safeHandle<IpcResult<string>>('invoices:readFileAsBase64', (id: unknown) => {
    const row = invoiceRepo.findById(Number(id))
    if (!row) throw new Error('发票不存在')
    const buffer = fs.readFileSync(row.file_path)
    return ok(buffer.toString('base64'))
  })

  safeHandle<IpcResult<string[]>>('invoices:extractOfdImages', (id: unknown) => {
    const row = invoiceRepo.findById(Number(id))
    if (!row) throw new Error('发票不存在')
    try {
      const zip = new AdmZip(row.file_path)
      const entries = zip.getEntries()
      const images: string[] = []

      function detectMime(data: Buffer): string | null {
        const h = data.toString('hex', 0, 4).toLowerCase()
        if (h.startsWith('89504e47')) return 'image/png'
        if (h.startsWith('ffd8')) return 'image/jpeg'
        if (h.startsWith('424d')) return 'image/bmp'
        if (h.startsWith('474946')) return 'image/gif'
        return null
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue
        const name = entry.entryName
        // Standard image extensions
        if (/\.(png|jpg|jpeg|bmp|gif|tif|tiff)$/i.test(name)) {
          const ext = name.split('.').pop()?.toLowerCase() ?? 'png'
          const mime =
            ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'bmp' ? 'image/bmp' :
            ext === 'gif' ? 'image/gif' :
            ext === 'tif' || ext === 'tiff' ? 'image/tiff' :
            'image/png'
          images.push(`data:${mime};base64,${entry.getData().toString('base64')}`)
        }
      }

      // Fallback: check OFD resource directories for image files by magic bytes
      if (images.length === 0) {
        for (const entry of entries) {
          if (entry.isDirectory) continue
          if (/\/Res\//i.test(entry.entryName) && entry.header.size > 100) {
            const data = entry.getData()
            const mime = detectMime(data)
            if (mime) {
              images.push(`data:${mime};base64,${data.toString('base64')}`)
            }
          }
        }
      }

      return ok(images)
    } catch {
      return ok([])
    }
  })

  safeHandle<IpcResult<void>>('invoices:batchDelete', (ids: unknown) => {
    const idList = ids as number[]
    for (const id of idList) {
      const row = invoiceRepo.findById(id)
      if (row?.file_path) deleteStoredFile(row.file_path)
      invoiceRepo.remove(id)
    }
    logOperation({ action: 'invoice_batch_delete', targetType: 'invoice', detail: { count: idList.length, ids: idList } })
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('invoices:batchUpdateCategory', (ids: unknown, category: unknown) => {
    invoiceRepo.batchUpdateCategory(ids as number[], String(category))
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
      const exportName = row.file_name || basename(row.file_path)
      const destPath = join(destDir, exportName)
      fs.copyFileSync(row.file_path, destPath)
      exported++
    }
    return ok(`已导出 ${exported} 个文件到 ${destDir}`)
  })

  // ============ Reimbursements ============

  safeHandle<IpcResult<Reimbursement[] | PaginatedResult<Reimbursement>>>('reimbursements:getAll', (filters?: ReimbursementFilters, pagination?: PaginationParams) => {
    if (pagination) {
      const result = reimbursementRepo.findAll(filters ?? {}, pagination)
      return ok({ items: result.items.map((r) => mapReimbursement(r)), total: result.total, page: pagination.page, pageSize: pagination.pageSize })
    }
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
    logOperation({ action: 'reimbursement_create', targetType: 'reimbursement', targetId: id, detail: { title: params.title } })
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

  safeHandle<IpcResult<void>>('reimbursements:sendEmail', async (
    id: unknown,
    emailTo: unknown,
    options?: { customSubject?: string; customBody?: string }
  ) => {
    const reimbId = Number(id)
    const to = String(emailTo)
    if (!to || !to.includes('@')) throw new Error('请输入有效的收件人邮箱')

    const row = reimbursementRepo.findById(reimbId)
    if (!row) throw new Error('报销单不存在')

    const invoiceRows = reimbursementRepo.findInvoices(reimbId)

    await sendReimbursementEmail({
      reimbursementId: reimbId,
      emailTo: to,
      title: row.title,
      reason: row.reason,
      targetAmount: row.target_amount,
      actualAmount: row.actual_amount,
      date: row.date,
      invoices: invoiceRows,
      customSubject: options?.customSubject,
      customBody: options?.customBody
    })

    // 更新报销单状态: 记录收件人和发送时间
    reimbursementRepo.update(reimbId, {
      status: 'sent',
      emailTo: to,
      emailSentAt: new Date().toISOString()
    })

    logOperation({ action: 'reimbursement_send', targetType: 'reimbursement', targetId: reimbId, detail: { emailTo: to, title: row.title } })

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

    // Map InvoiceCandidate back to full Invoice objects
    const invoiceMap = new Map(unreimbursed.map((inv) => [inv.id, mapInvoice(inv)]))
    const mapped = results.map((r) => ({
      totalAmount: r.totalAmount,
      invoiceCount: r.invoiceCount,
      difference: r.difference,
      isExact: r.isExact,
      invoices: r.invoices.map((c) => invoiceMap.get(c.id)).filter(Boolean)
    }))

    return ok(mapped as unknown as MatchingResult[])
  })

  // ============ Email Preview ============

  safeHandle<IpcResult<{ subject: string; html: string }>>('reimbursements:previewEmail', (
    id: unknown,
    options?: { customSubject?: string; customBody?: string }
  ) => {
    const reimbId = Number(id)
    const row = reimbursementRepo.findById(reimbId)
    if (!row) throw new Error('报销单不存在')

    const invoiceRows = reimbursementRepo.findInvoices(reimbId)

    return ok(previewReimbursementEmail({
      title: row.title,
      reason: row.reason,
      targetAmount: row.target_amount,
      actualAmount: row.actual_amount,
      date: row.date,
      invoices: invoiceRows,
      customSubject: options?.customSubject,
      customBody: options?.customBody
    }))
  })

  // ============ Sent Emails ============

  safeHandle<IpcResult<SentEmail[]>>('sentEmails:getAll', () => {
    return ok(sentEmailRepo.findAll())
  })

  safeHandle<IpcResult<SentEmail[]>>('sentEmails:findByReimbursement', (reimbId: unknown) => {
    return ok(sentEmailRepo.findByReimbursementId(Number(reimbId)))
  })

  safeHandle<IpcResult<void>>('sentEmails:remove', (id: unknown) => {
    sentEmailRepo.remove(Number(id))
    return ok(undefined)
  })

  safeHandle<IpcResult<void>>('sentEmails:clearAll', () => {
    sentEmailRepo.clearAll()
    return ok(undefined)
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

  // ============ Backup & Restore ============

  safeHandle<IpcResult<string>>('backup:create', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return err('No focused window')
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `invoice-helper-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePath) return ok('')
    createBackup(result.filePath)
    logOperation({ action: 'backup_create', targetType: 'system', detail: { filePath: result.filePath } })
    return ok(result.filePath)
  })

  safeHandle<IpcResult<boolean>>('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return err('No focused window')
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    })
    if (result.canceled || !result.filePaths.length) return ok(false)
    restoreBackup(result.filePaths[0])
    logOperation({ action: 'backup_restore', targetType: 'system', detail: { filePath: result.filePaths[0] } })
    return ok(true)
  })

  // ============ App Info ============

  safeHandle<IpcResult<string>>('app:getVersion', () => {
    return ok(app.getVersion())
  })

  ipcMain.on('app:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // ============ Operation Logs ============

  safeHandle<IpcResult<OperationLog[]>>('operation-logs:getRecent', (limit?: unknown) => {
    const rows = getRecentLogs(limit ? Number(limit) : 100)
    return ok(rows.map(r => ({
      id: r.id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: r.created_at
    })))
  })

  safeHandle<IpcResult<void>>('operation-logs:clearAll', () => {
    clearAllLogs()
    return ok(undefined)
  })
}
