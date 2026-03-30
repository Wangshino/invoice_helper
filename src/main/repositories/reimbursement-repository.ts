import { getDb } from '../services/database'
import type {
  ReimbursementRow,
  InvoiceRow,
  CreateReimbursementParams,
  UpdateReimbursementParams,
  ReimbursementFilters,
  PaginationParams
} from '../../shared/types'

// ============================================================
// Reimbursement Repository
// ============================================================

export function findAll(filters?: ReimbursementFilters): ReimbursementRow[]
export function findAll(filters: ReimbursementFilters, pagination: PaginationParams): { items: ReimbursementRow[]; total: number }
export function findAll(filters?: ReimbursementFilters, pagination?: PaginationParams) {
  const db = getDb()
  let whereSql = 'WHERE 1=1'
  const params: unknown[] = []

  if (filters?.status && filters.status !== 'all') {
    whereSql += ' AND status = ?'
    params.push(filters.status)
  }
  if (filters?.dateFrom) {
    whereSql += ' AND date >= ?'
    params.push(filters.dateFrom)
  }
  if (filters?.dateTo) {
    whereSql += ' AND date <= ?'
    params.push(filters.dateTo)
  }

  if (pagination) {
    const countSql = `SELECT COUNT(*) as total FROM reimbursements ${whereSql}`
    const { total } = db.prepare(countSql).get(...params) as { total: number }
    const offset = (pagination.page - 1) * pagination.pageSize
    const dataSql = `SELECT * FROM reimbursements ${whereSql} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`
    const items = db.prepare(dataSql).all(...params, pagination.pageSize, offset) as ReimbursementRow[]
    return { items, total }
  }

  return db.prepare(`SELECT * FROM reimbursements ${whereSql} ORDER BY date DESC, created_at DESC`).all(...params) as ReimbursementRow[]
}

export function findById(id: number): ReimbursementRow | undefined {
  return getDb()
    .prepare('SELECT * FROM reimbursements WHERE id = ?')
    .get(id) as ReimbursementRow | undefined
}

/** 获取报销单关联的发票列表 */
export function findInvoices(reimbursementId: number): InvoiceRow[] {
  return getDb().prepare(`
    SELECT i.* FROM invoices i
    JOIN reimbursement_invoices ri ON i.id = ri.invoice_id
    WHERE ri.reimbursement_id = ?
    ORDER BY i.total_amount DESC
  `).all(reimbursementId) as InvoiceRow[]
}

export function create(params: CreateReimbursementParams): number {
  const db = getDb()

  const insertReimbursement = db.prepare(`
    INSERT INTO reimbursements (title, reason, target_amount, actual_amount, date, status)
    VALUES (@title, @reason, @targetAmount, @actualAmount, @date, @status)
  `)

  const insertLink = db.prepare(
    'INSERT OR IGNORE INTO reimbursement_invoices (reimbursement_id, invoice_id) VALUES (?, ?)'
  )

  const updateInvoiceStatus = db.prepare(
    "UPDATE invoices SET status = 'reimbursed', reimbursement_id = ? WHERE id = ?"
  )

  const transaction = db.transaction(() => {
    const result = insertReimbursement.run({
      title: params.title,
      reason: params.reason,
      targetAmount: params.targetAmount,
      actualAmount: params.actualAmount ?? null,
      date: params.date,
      status: params.status ?? 'draft'
    })
    const reimbursementId = Number(result.lastInsertRowid)

    for (const invoiceId of params.invoiceIds ?? []) {
      insertLink.run(reimbursementId, invoiceId)
      updateInvoiceStatus.run(reimbursementId, invoiceId)
    }

    return reimbursementId
  })

  return transaction()
}

export function update(id: number, params: UpdateReimbursementParams): void {
  const db = getDb()
  const fields: string[] = []
  const values: Record<string, unknown> = { id }

  const fieldMap: Record<string, string> = {
    title: 'title',
    reason: 'reason',
    targetAmount: 'target_amount',
    actualAmount: 'actual_amount',
    date: 'date',
    status: 'status',
    emailTo: 'email_to',
    emailSentAt: 'email_sent_at'
  }

  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
    if ((params as Record<string, unknown>)[camelKey] !== undefined) {
      fields.push(`${snakeKey} = @${camelKey}`)
      values[camelKey] = (params as Record<string, unknown>)[camelKey]
    }
  }

  if (fields.length > 0) {
    db.prepare(
      `UPDATE reimbursements SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`
    ).run(values)
  }

  // 如果提供了新的发票列表, 重新关联
  if (params.invoiceIds !== undefined) {
    relinkInvoices(id, params.invoiceIds)
  }
}

/** 重新关联发票: 先解除旧的, 再关联新的 */
function relinkInvoices(reimbursementId: number, invoiceIds: number[]): void {
  const db = getDb()

  const transaction = db.transaction(() => {
    // 解除旧关联, 恢复发票状态
    db.prepare(
      "UPDATE invoices SET status = 'unreimbursed', reimbursement_id = NULL WHERE reimbursement_id = ?"
    ).run(reimbursementId)

    db.prepare('DELETE FROM reimbursement_invoices WHERE reimbursement_id = ?').run(reimbursementId)

    // 建立新关联
    const insertLink = db.prepare(
      'INSERT INTO reimbursement_invoices (reimbursement_id, invoice_id) VALUES (?, ?)'
    )
    const updateStatus = db.prepare(
      "UPDATE invoices SET status = 'reimbursed', reimbursement_id = ? WHERE id = ?"
    )

    for (const invoiceId of invoiceIds) {
      insertLink.run(reimbursementId, invoiceId)
      updateStatus.run(reimbursementId, invoiceId)
    }
  })

  transaction()
}

export function remove(id: number): void {
  const db = getDb()
  const transaction = db.transaction(() => {
    db.prepare(
      "UPDATE invoices SET status = 'unreimbursed', reimbursement_id = NULL WHERE reimbursement_id = ?"
    ).run(id)
    db.prepare('DELETE FROM reimbursement_invoices WHERE reimbursement_id = ?').run(id)
    db.prepare('DELETE FROM reimbursements WHERE id = ?').run(id)
  })
  transaction()
}

/** 统计: 按状态汇总 */
export function countByStatus(): { status: string; count: number; totalAmount: number }[] {
  return getDb().prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(target_amount), 0) as totalAmount
    FROM reimbursements
    GROUP BY status
  `).all() as { status: string; count: number; totalAmount: number }[]
}
