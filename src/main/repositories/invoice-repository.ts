import { getDb } from '../services/database'
import type { InvoiceRow, CreateInvoiceParams, InvoiceFilters, UpdateInvoiceParams, PaginationParams } from '../../shared/types'

// ============================================================
// Invoice Repository
// ============================================================

export function findAll(filters?: InvoiceFilters): InvoiceRow[]
export function findAll(filters: InvoiceFilters, pagination: PaginationParams): { items: InvoiceRow[]; total: number }
export function findAll(filters?: InvoiceFilters, pagination?: PaginationParams) {
  const db = getDb()
  let whereSql = 'WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status && filters.status !== 'all') {
    whereSql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters?.dateFrom) {
    whereSql += ' AND invoice_date >= ?'
    params.push(filters.dateFrom)
  }
  if (filters?.dateTo) {
    whereSql += ' AND invoice_date <= ?'
    params.push(filters.dateTo)
  }
  if (filters?.source) {
    whereSql += ' AND source = ?'
    params.push(filters.source)
  }
  if (filters?.keyword) {
    whereSql += ' AND (invoice_number LIKE ? OR seller_name LIKE ? OR file_name LIKE ? OR buyer_name LIKE ?)'
    const kw = `%${filters.keyword}%`
    params.push(kw, kw, kw, kw)
  }
  if (filters?.category) {
    whereSql += ' AND category = ?'
    params.push(filters.category)
  }
  if (filters?.amountFrom != null) {
    whereSql += ' AND total_amount >= ?'
    params.push(filters.amountFrom)
  }
  if (filters?.amountTo != null) {
    whereSql += ' AND total_amount <= ?'
    params.push(filters.amountTo)
  }
  if (filters?.buyerName) {
    whereSql += ' AND buyer_name LIKE ?'
    params.push(`%${filters.buyerName}%`)
  }

  if (pagination) {
    const countSql = `SELECT COUNT(*) as total FROM invoices ${whereSql}`
    const { total } = db.prepare(countSql).get(...params) as { total: number }
    const offset = (pagination.page - 1) * pagination.pageSize
    const dataSql = `SELECT * FROM invoices ${whereSql} ORDER BY invoice_date DESC, created_at DESC LIMIT ? OFFSET ?`
    const items = db.prepare(dataSql).all(...params, pagination.pageSize, offset) as InvoiceRow[]
    return { items, total }
  }

  return db.prepare(`SELECT * FROM invoices ${whereSql} ORDER BY invoice_date DESC, created_at DESC`).all(...params) as InvoiceRow[]
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
      amount, tax_amount, total_amount, invoice_content,
      file_path, file_type, file_name, source,
      email_account_id, email_subject, category
    ) VALUES (
      @invoiceNumber, @invoiceCode, @invoiceDate, @invoiceType,
      @sellerName, @sellerTaxId, @buyerName, @buyerTaxId,
      @amount, @taxAmount, @totalAmount, @invoiceContent,
      @filePath, @fileType, @fileName, @source,
      @emailAccountId, @emailSubject, @category
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
    invoiceContent: params.invoiceContent ?? null,
    filePath: params.filePath,
    fileType: params.fileType,
    fileName: params.fileName ?? null,
    source: params.source ?? 'manual',
    emailAccountId: params.emailAccountId ?? null,
    emailSubject: params.emailSubject ?? null,
    category: params.category ?? null
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

/** 更新发票信息 */
export function update(id: number, params: UpdateInvoiceParams): void {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  const fieldMap: Record<string, string> = {
    invoiceNumber: 'invoice_number',
    invoiceCode: 'invoice_code',
    invoiceDate: 'invoice_date',
    invoiceType: 'invoice_type',
    sellerName: 'seller_name',
    sellerTaxId: 'seller_tax_id',
    buyerName: 'buyer_name',
    buyerTaxId: 'buyer_tax_id',
    amount: 'amount',
    taxAmount: 'tax_amount',
    totalAmount: 'total_amount',
    invoiceContent: 'invoice_content',
    category: 'category'
  }

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in params) {
      fields.push(`${column} = ?`)
      values.push((params as Record<string, unknown>)[key] ?? null)
    }
  }

  if (fields.length === 0) return

  values.push(id)
  db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

/** 获取所有去重分类 */
export function getCategories(): string[] {
  try {
    const rows = getDb()
      .prepare('SELECT DISTINCT category FROM invoices WHERE category IS NOT NULL AND category != ? ORDER BY category')
      .all('') as { category: string }[]
    return rows.map((r) => r.category)
  } catch {
    console.warn('[getCategories] category column may not exist yet')
    return []
  }
}

/** 批量更新文件名和路径 */
export function updateFilePathAndName(id: number, filePath: string, fileName: string): void {
  getDb()
    .prepare('UPDATE invoices SET file_path = ?, file_name = ? WHERE id = ?')
    .run(filePath, fileName, id)
}
