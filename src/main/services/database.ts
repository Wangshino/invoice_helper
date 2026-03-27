import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import fs from 'fs'

let db: Database.Database | null = null

// ============================================================
// Schema Migrations
// ============================================================

const MIGRATIONS: Map<number, string> = new Map([
  [
    1,
    `
    CREATE TABLE IF NOT EXISTS email_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL DEFAULT 993,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL DEFAULT 465,
      password TEXT NOT NULL,
      last_sync_uid INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE,
      invoice_code TEXT,
      invoice_date DATE,
      invoice_type TEXT,
      seller_name TEXT,
      seller_tax_id TEXT,
      buyer_name TEXT,
      buyer_tax_id TEXT,
      amount DECIMAL(12,2),
      tax_amount DECIMAL(12,2),
      total_amount DECIMAL(12,2),
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'ofd', 'xml')),
      file_name TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('email', 'manual')),
      email_account_id INTEGER,
      email_subject TEXT,
      status TEXT NOT NULL DEFAULT 'unreimbursed' CHECK (status IN ('reimbursed', 'unreimbursed')),
      reimbursement_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (email_account_id) REFERENCES email_accounts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

    CREATE TABLE IF NOT EXISTS reimbursements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      target_amount DECIMAL(12,2) NOT NULL,
      actual_amount DECIMAL(12,2),
      date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'approved', 'rejected')),
      email_to TEXT,
      email_sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reimbursement_invoices (
      reimbursement_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      PRIMARY KEY (reimbursement_id, invoice_id),
      FOREIGN KEY (reimbursement_id) REFERENCES reimbursements(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `
  ]
  // 后续迁移在此添加:
  // [2, 'ALTER TABLE invoices ADD COLUMN check_code TEXT;'],
])

// ============================================================
// Initialization
// ============================================================

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'invoice-helper.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations()
  console.log('[Database] Initialized at:', dbPath)
}

function runMigrations(): void {
  if (!db) throw new Error('Database not initialized')

  const currentVersion = getCurrentVersion()
  const maxVersion = Math.max(...MIGRATIONS.keys())

  if (currentVersion >= maxVersion) {
    console.log(`[Database] Schema up to date (v${currentVersion})`)
    return
  }

  const migrate = db.transaction(() => {
    for (let v = currentVersion + 1; v <= maxVersion; v++) {
      const sql = MIGRATIONS.get(v)
      if (!sql) continue
      db!.exec(sql)
      db!.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v)
      console.log(`[Database] Migration v${v} applied`)
    }
  })

  migrate()
  console.log(`[Database] Migrated from v${currentVersion} to v${maxVersion}`)
}

function getCurrentVersion(): number {
  if (!db) throw new Error('Database not initialized')

  // 检查 schema_version 表是否存在
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get() as { name: string } | undefined

  if (!table) return 0

  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
  return row.v ?? 0
}

// ============================================================
// Database Access
// ============================================================

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/** 关闭数据库连接 (app quit 时调用) */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[Database] Connection closed')
  }
}
