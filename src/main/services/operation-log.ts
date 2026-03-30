import { getDb } from './database'

export interface OperationLogRow {
  id: number
  action: string
  target_type: string | null
  target_id: number | null
  detail: string | null
  created_at: string
}

export function logOperation(params: {
  action: string
  targetType?: string
  targetId?: number
  detail?: Record<string, unknown>
}): void {
  try {
    getDb().prepare(`
      INSERT INTO operation_logs (action, target_type, target_id, detail)
      VALUES (?, ?, ?, ?)
    `).run(
      params.action,
      params.targetType ?? null,
      params.targetId ?? null,
      params.detail ? JSON.stringify(params.detail) : null
    )
  } catch (e) {
    console.warn('[OperationLog] Failed to log:', e)
  }
}

export function getRecentLogs(limit = 100): OperationLogRow[] {
  return getDb().prepare(
    'SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as OperationLogRow[]
}

export function clearAllLogs(): void {
  getDb().prepare('DELETE FROM operation_logs').run()
}
