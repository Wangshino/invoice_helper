import { getDb } from '../services/database'

// ============================================================
// Settings Repository (Key-Value Store)
// ============================================================

export function get(key: string): string | undefined {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value
}

export function set(key: string, value: string): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value)
}

export function remove(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function getAll(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// ============================================================
// 常用 Settings Keys
// ============================================================

export const SETTINGS_KEYS = {
  /** 百度 OCR API Key */
  BAIDU_OCR_API_KEY: 'baidu_ocr_api_key',
  /** 百度 OCR Secret Key */
  BAIDU_OCR_SECRET_KEY: 'baidu_ocr_secret_key',
  /** 默认发件邮箱账户 ID */
  DEFAULT_SENDER_ACCOUNT_ID: 'default_sender_account_id',
  /** 报销邮件模板 */
  REIMBURSEMENT_EMAIL_TEMPLATE: 'reimbursement_email_template'
} as const
