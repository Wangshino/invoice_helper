import { getDb } from '../services/database'
import type { InvoiceRow, CreateInvoiceParams, InvoiceFilters } from '../../shared/types'

// ============================================================
// Invoice Repository
// ============================================================

export function findAll(filters?: InvoiceFilters): InvoiceRow[] {
  const db = getDb()
  let sql = 'SELECT * FROM invoices WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status && filters.status !== 'all') {
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
  if (filters?.keyword) {
    sql += ' AND (invoice_number LIKE ? OR seller_name LIKE ? OR file_name LIKE ?)'
    const kw = `%${filters.keyword}%`
    params.push(kw, kw, kw)
  }

  sql += ' ORDER BY invoice_date DESC, created_at DESC'
  return db.prepare(sql).all(...params) as InvoiceRow[]
}

export function findById(id: number): InvoiceRow | undefined {
  return getDb().prepare('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | undefined
}

export function findByInvoiceNumber(invoiceNumber: string): InvoiceRow | undefined {
  return getDb()
    .prepare('SELECT * FROM invoices WHERE invoice_number = ?')
    .get(invoiceNumber) as InvoiceRow | undefined
}

export function create(params: CreateInvoiceParams): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO invoices (
      invoice_number, invoice_code, invoice_date, invoice_type,
      seller_name, seller_tax_id, buyer_name, buyer_tax_id,
      amount, tax_amount, total_amount,
      file_path, file_type, file_name, source,
      email_account_id, email_subject
    ) VALUES (
      @invoiceNumber, @invoiceCode, @invoiceDate, @invoiceType,
      @sellerName, @sellerTaxId, @buyerName, @buyerTaxId,
      @amount, @taxAmount, @totalAmount,
      @filePath, @fileType, @fileName, @source,
      @emailAccountId, @emailSubject
    )
  `)
  const result = stmt.run({
    invoiceNumber: params.invoiceNumber ?? null,
    invoiceCode: params.invoiceCode ?? null,
    invoiceDate: params.invoiceDate ?? null,
    invoiceType: params.invoiceType ?? null,
    sellerName: params.sellerName ?? null,
    sellerTaxId: params.sellerTaxId ?? null,
    buyerName: params.buyerName ?? null,
    buyerTaxId: params.buyerTaxId ?? null,
    amount: params.amount ?? null,
    taxAmount: params.taxAmount ?? null,
    totalAmount: params.totalAmount ?? null,
    filePath: params.filePath,
    fileType: params.fileType,
    fileName: params.fileName ?? null,
    source: params.source ?? 'manual',
    emailAccountId: params.emailAccountId ?? null,
    emailSubject: params.emailSubject ?? null
  })
  return Number(result.lastInsertRowid)
}

export function updateStatus(id: number, status: string, reimbursementId?: number): void {
  const db = getDb()
  if (reimbursementId !== undefined) {
    db.prepare('UPDATE invoices SET status = ?, reimbursement_id = ? WHERE id = ?')
      .run(status, reimbursementId, id)
  } else {
    db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, id)
  }
}

export function unlinkFromReimbursement(reimbursementId: number): void {
  getDb()
    .prepare("UPDATE invoices SET status = 'unreimbursed', reimbursement_id = NULL WHERE reimbursement_id = ?")
    .run(reimbursementId)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM invoices WHERE id = ?').run(id)
}

/** 统计: 按状态汇总 */
export function countByStatus(): { status: string; count: number; totalAmount: number }[] {
  return getDb().prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as totalAmount
    FROM invoices
    GROUP BY status
  `).all() as { status: string; count: number; totalAmount: number }[]
}
