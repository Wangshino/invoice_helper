import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getDb } from '../services/database'

export function registerIpcHandlers(): void {
  // ============ Invoices ============
  ipcMain.handle('invoices:getAll', (_event, filters?: Record<string, unknown>) => {
    const db = getDb()
    let sql = 'SELECT * FROM invoices WHERE 1=1'
    const params: unknown[] = []

    if (filters?.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }
    if (filters?.dateFrom) {
      sql += ' AND invoice_date >= ?'
      params.push(filters.dateFrom)
    }
    if (filters?.dateTo) {
      sql += ' AND invoice_date <= ?'
      params.push(filters.dateTo)
    }
    if (filters?.source) {
      sql += ' AND source = ?'
      params.push(filters.source)
    }

    sql += ' ORDER BY invoice_date DESC, created_at DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('invoices:getById', (_event, id: number) => {
    const db = getDb()
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id)
  })

  ipcMain.handle('invoices:create', (_event, invoice: Record<string, unknown>) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO invoices (invoice_number, invoice_code, invoice_date, invoice_type,
        seller_name, seller_tax_id, buyer_name, buyer_tax_id,
        amount, tax_amount, total_amount, file_path, file_type, file_name, source)
      VALUES (@invoice_number, @invoice_code, @invoice_date, @invoice_type,
        @seller_name, @seller_tax_id, @buyer_name, @buyer_tax_id,
        @amount, @tax_amount, @total_amount, @file_path, @file_type, @file_name, @source)
    `)
    const result = stmt.run(invoice)
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('invoices:update', (_event, id: number, data: Record<string, unknown>) => {
    const db = getDb()
    const fields = Object.keys(data)
    const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
    const stmt = db.prepare(`UPDATE invoices SET ${setClause} WHERE id = @id`)
    stmt.run({ ...data, id })
  })

  ipcMain.handle('invoices:delete', (_event, id: number) => {
    const db = getDb()
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id)
  })

  ipcMain.handle('invoices:importFiles', async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '发票文件', extensions: ['pdf', 'ofd', 'xml'] }
      ]
    })
    if (result.canceled) return []
    return result.filePaths
  })

  // ============ Email Accounts ============
  ipcMain.handle('emailAccounts:getAll', () => {
    const db = getDb()
    return db.prepare('SELECT id, name, email, imap_host, imap_port, smtp_host, smtp_port, last_sync_uid, created_at FROM email_accounts ORDER BY created_at').all()
  })

  ipcMain.handle('emailAccounts:create', (_event, account: Record<string, unknown>) => {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO email_accounts (name, email, imap_host, imap_port, smtp_host, smtp_port, password)
      VALUES (@name, @email, @imap_host, @imap_port, @smtp_host, @smtp_port, @password)
    `)
    const result = stmt.run(account)
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('emailAccounts:update', (_event, id: number, data: Record<string, unknown>) => {
    const db = getDb()
    const fields = Object.keys(data)
    const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
    const stmt = db.prepare(`UPDATE email_accounts SET ${setClause} WHERE id = @id`)
    stmt.run({ ...data, id })
  })

  ipcMain.handle('emailAccounts:delete', (_event, id: number) => {
    const db = getDb()
    db.prepare('DELETE FROM email_accounts WHERE id = ?').run(id)
  })

  ipcMain.handle('emailAccounts:testConnection', async (_event, _config: Record<string, unknown>) => {
    // TODO: implement IMAP connection test
    return true
  })

  ipcMain.handle('emailAccounts:syncEmails', async (_event, _accountId: number) => {
    // TODO: implement email sync with imapflow
    return []
  })

  // ============ Reimbursements ============
  ipcMain.handle('reimbursements:getAll', (_event, filters?: Record<string, unknown>) => {
    const db = getDb()
    let sql = 'SELECT * FROM reimbursements WHERE 1=1'
    const params: unknown[] = []

    if (filters?.status) {
      sql += ' AND status = ?'
      params.push(filters.status)
    }

    sql += ' ORDER BY date DESC, created_at DESC'
    return db.prepare(sql).all(...params)
  })

  ipcMain.handle('reimbursements:getById', (_event, id: number) => {
    const db = getDb()
    const reimbursement = db.prepare('SELECT * FROM reimbursements WHERE id = ?').get(id)
    if (reimbursement) {
      const invoices = db.prepare(`
        SELECT i.* FROM invoices i
        JOIN reimbursement_invoices ri ON i.id = ri.invoice_id
        WHERE ri.reimbursement_id = ?
      `).all(id)
      return { ...reimbursement, invoices }
    }
    return null
  })

  ipcMain.handle('reimbursements:create', (_event, data: Record<string, unknown>) => {
    const db = getDb()
    const { invoiceIds, ...reimbursementData } = data

    const insertReimbursement = db.prepare(`
      INSERT INTO reimbursements (title, reason, target_amount, actual_amount, date, status)
      VALUES (@title, @reason, @target_amount, @actual_amount, @date, @status)
    `)

    const insertReimbursementInvoice = db.prepare(`
      INSERT OR IGNORE INTO reimbursement_invoices (reimbursement_id, invoice_id) VALUES (?, ?)
    `)

    const updateInvoiceStatus = db.prepare(`
      UPDATE invoices SET status = 'reimbursed', reimbursement_id = ? WHERE id = ?
    `)

    const transaction = db.transaction(() => {
      const result = insertReimbursement.run(reimbursementData)
      const reimbursementId = result.lastInsertRowid

      const ids = (invoiceIds as number[]) || []
      for (const invoiceId of ids) {
        insertReimbursementInvoice.run(reimbursementId, invoiceId)
        updateInvoiceStatus.run(reimbursementId, invoiceId)
      }

      return { id: reimbursementId }
    })

    return transaction()
  })

  ipcMain.handle('reimbursements:update', (_event, id: number, data: Record<string, unknown>) => {
    const db = getDb()
    const fields = Object.keys(data).filter((f) => f !== 'invoiceIds')
    if (fields.length > 0) {
      const setClause = fields.map((f) => `${f} = @${f}`).join(', ')
      const stmt = db.prepare(`UPDATE reimbursements SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`)
      stmt.run({ ...data, id })
    }
  })

  ipcMain.handle('reimbursements:delete', (_event, id: number) => {
    const db = getDb()
    const transaction = db.transaction(() => {
      // Reset invoice statuses
      db.prepare('UPDATE invoices SET status = \'unreimbursed\', reimbursement_id = NULL WHERE reimbursement_id = ?').run(id)
      // Delete associations
      db.prepare('DELETE FROM reimbursement_invoices WHERE reimbursement_id = ?').run(id)
      // Delete reimbursement
      db.prepare('DELETE FROM reimbursements WHERE id = ?').run(id)
    })
    transaction()
  })

  ipcMain.handle('reimbursements:sendEmail', async (_event, _id: number, _emailTo: string) => {
    // TODO: implement email sending with nodemailer
  })

  // ============ Matching ============
  ipcMain.handle('matching:findBestCombinations', (_event, targetAmount: number, _dateRange?: [string, string]) => {
    const db = getDb()
    // Get unreimbursed invoices
    const invoices = db.prepare(
      "SELECT * FROM invoices WHERE status = 'unreimbursed' AND total_amount IS NOT NULL ORDER BY invoice_date DESC"
    ).all() as Array<{ id: number; total_amount: number; [key: string]: unknown }>

    // Filter out invoices larger than target
    const candidates = invoices.filter((inv) => inv.total_amount <= targetAmount)
    if (candidates.length === 0) return []

    // Dynamic programming subset sum
    const target = Math.round(targetAmount * 100) // Convert to cents for integer math
    const amounts = candidates.map((c) => Math.round(c.total_amount * 100))

    // dp[sum] = { combination: indices, count: number of invoices }
    const dp = new Map<number, { indices: number[] }>()
    dp.set(0, { indices: [] })

    for (let i = 0; i < amounts.length; i++) {
      const currentAmount = amounts[i]
      const entries = Array.from(dp.entries()).sort((a, b) => b[0] - a[0])

      for (const [sum, data] of entries) {
        const newSum = sum + currentAmount
        if (newSum > target) continue
        if (!dp.has(newSum) && data.indices.length < 20) {
          dp.set(newSum, { indices: [...data.indices, i] })
        }
      }
    }

    // Find top 3 closest sums
    const sortedSums = Array.from(dp.keys())
      .filter((s) => s > 0)
      .sort((a, b) => b - a)
      .slice(0, 3)

    const results = sortedSums.map((sum) => {
      const { indices } = dp.get(sum)!
      const combination = indices.map((idx) => candidates[idx])
      return {
        totalAmount: sum / 100,
        invoices: combination,
        invoiceCount: combination.length,
        difference: targetAmount - sum / 100,
        isExact: sum === target
      }
    })

    return results
  })
}
