import { getDb } from '../services/database'
import { FieldMappers } from '../../shared/types'
import type { SyncLogRow, SyncLog } from '../../shared/types'

// ============================================================
// Sync Log Repository
// ============================================================

export interface CreateSyncLogParams {
  emailAccountId: number
  scanned: number
  imported: number
  skipped: number
  failed: number
  fullLog: string
}

/** 创建同步日志记录 */
export function create(params: CreateSyncLogParams): number {
  const { lastInsertRowid } = getDb()
    .prepare(
      `INSERT INTO sync_logs (email_account_id, scanned, imported, skipped, failed, full_log)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(params.emailAccountId, params.scanned, params.imported, params.skipped, params.failed, params.fullLog)
  return Number(lastInsertRowid)
}

/** 查询所有同步日志，可选按账户筛选 */
export function findAll(accountId?: number): SyncLog[] {
  const db = getDb()
  let rows: SyncLogRow[]
  if (accountId) {
    rows = db
      .prepare('SELECT * FROM sync_logs WHERE email_account_id = ? ORDER BY synced_at DESC')
      .all(accountId) as SyncLogRow[]
  } else {
    rows = db
      .prepare('SELECT * FROM sync_logs ORDER BY synced_at DESC')
      .all() as SyncLogRow[]
  }
  return FieldMappers.syncLog.toList(rows as unknown as Record<string, unknown>[])
}

/** 查询单条同步日志 */
export function findById(id: number): SyncLog | undefined {
  const row = getDb()
    .prepare('SELECT * FROM sync_logs WHERE id = ?')
    .get(id) as SyncLogRow | undefined
  if (!row) return undefined
  return FieldMappers.syncLog.toCamel(row as unknown as Record<string, unknown>)
}

/** 删除单条同步日志 */
export function remove(id: number): void {
  getDb().prepare('DELETE FROM sync_logs WHERE id = ?').run(id)
}

/** 删除指定账户的所有同步日志 */
export function removeAllForAccount(accountId: number): void {
  getDb().prepare('DELETE FROM sync_logs WHERE email_account_id = ?').run(accountId)
}

/** 清空所有同步日志 */
export function clearAll(): void {
  getDb().exec('DELETE FROM sync_logs')
}
