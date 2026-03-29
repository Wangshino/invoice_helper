import { getDb } from '../services/database'
import { FieldMappers } from '../../shared/types'
import type { SentEmailRow, SentEmail } from '../../shared/types'

// ============================================================
// Sent Email Repository
// ============================================================

export function create(data: {
  reimbursementId: number
  emailTo: string
  subject: string
  bodyHtml: string
  attachmentCount: number
}): number {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO sent_emails (reimbursement_id, email_to, subject, body_html, attachment_count)
    VALUES (@reimbursementId, @emailTo, @subject, @bodyHtml, @attachmentCount)
  `).run(data)
  return Number(result.lastInsertRowid)
}

export function findAll(): SentEmail[] {
  const rows = getDb()
    .prepare('SELECT * FROM sent_emails ORDER BY sent_at DESC')
    .all() as SentEmailRow[]
  return FieldMappers.sentEmail.toList(rows as unknown as Record<string, unknown>[])
}

export function findByReimbursementId(reimbId: number): SentEmail[] {
  const rows = getDb()
    .prepare('SELECT * FROM sent_emails WHERE reimbursement_id = ? ORDER BY sent_at DESC')
    .all(reimbId) as SentEmailRow[]
  return FieldMappers.sentEmail.toList(rows as unknown as Record<string, unknown>[])
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM sent_emails WHERE id = ?').run(id)
}

export function clearAll(): void {
  getDb().prepare('DELETE FROM sent_emails').run()
}
