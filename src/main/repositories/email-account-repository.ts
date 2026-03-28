import { getDb } from '../services/database'
import { encrypt, decrypt } from '../services/crypto'
import type { EmailAccountRow, CreateEmailAccountParams } from '../../shared/types'

// ============================================================
// Email Account Repository
// ============================================================

/** 获取所有邮箱账户 (不含密码原文, 仅含加密后的密码) */
export function findAll(): EmailAccountRow[] {
  return getDb()
    .prepare('SELECT * FROM email_accounts ORDER BY created_at')
    .all() as EmailAccountRow[]
}

export function findById(id: number): EmailAccountRow | undefined {
  return getDb()
    .prepare('SELECT * FROM email_accounts WHERE id = ?')
    .get(id) as EmailAccountRow | undefined
}

/** 获取解密后的密码 (用于 IMAP/SMTP 连接) */
export function getDecryptedPassword(id: string): string {
  const row = getDb()
    .prepare('SELECT password FROM email_accounts WHERE id = ?')
    .get(id) as { password: string } | undefined
  if (!row) throw new Error('Email account not found')
  return decrypt(row.password)
}

export function create(params: CreateEmailAccountParams): number {
  const db = getDb()
  const encryptedPassword = encrypt(params.password)
  console.log(`[emailAccountRepo] create: name="${params.name}", email="${params.email}", password length=${params.password?.length ?? 0}`)
  const stmt = db.prepare(`
    INSERT INTO email_accounts (name, email, imap_host, imap_port, smtp_host, smtp_port, password, mail_folder, sync_limit)
    VALUES (@name, @email, @imapHost, @imapPort, @smtpHost, @smtpPort, @password, @mailFolder, @syncLimit)
  `)
  const result = stmt.run({
    name: params.name,
    email: params.email,
    imapHost: params.imapHost,
    imapPort: params.imapPort ?? 993,
    smtpHost: params.smtpHost,
    smtpPort: params.smtpPort ?? 465,
    password: encryptedPassword,
    mailFolder: params.mailFolder ?? 'INBOX',
    syncLimit: params.syncLimit ?? 200
  })
  console.log(`[emailAccountRepo] create: id=${result.lastInsertRowid}`)
  return Number(result.lastInsertRowid)
}

export function update(id: number, data: Partial<CreateEmailAccountParams>): void {
  const db = getDb()
  const fields: string[] = []
  const values: Record<string, unknown> = { id }

  if (data.name !== undefined) { fields.push('name = @name'); values.name = data.name }
  if (data.email !== undefined) { fields.push('email = @email'); values.email = data.email }
  if (data.imapHost !== undefined) { fields.push('imap_host = @imapHost'); values.imapHost = data.imapHost }
  if (data.imapPort !== undefined) { fields.push('imap_port = @imapPort'); values.imapPort = data.imapPort }
  if (data.smtpHost !== undefined) { fields.push('smtp_host = @smtpHost'); values.smtpHost = data.smtpHost }
  if (data.smtpPort !== undefined) { fields.push('smtp_port = @smtpPort'); values.smtpPort = data.smtpPort }
  if (data.password !== undefined) { fields.push('password = @password'); values.password = encrypt(data.password) }
  if (data.mailFolder !== undefined) { fields.push('mail_folder = @mailFolder'); values.mailFolder = data.mailFolder }
  if (data.syncLimit !== undefined) { fields.push('sync_limit = @syncLimit'); values.syncLimit = data.syncLimit }

  if (fields.length === 0) return
  db.prepare(`UPDATE email_accounts SET ${fields.join(', ')} WHERE id = @id`).run(values)
}

export function updateLastSyncUid(id: number, uid: number): void {
  getDb().prepare('UPDATE email_accounts SET last_sync_uid = ? WHERE id = ?').run(uid, id)
}

export function resetLastSyncUid(id: number): void {
  getDb().prepare('UPDATE email_accounts SET last_sync_uid = NULL WHERE id = ?').run(id)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM email_accounts WHERE id = ?').run(id)
}
