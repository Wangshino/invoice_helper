import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import fs from 'fs'

let db: Database.Database | null = null

const SCHEMA = `
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
  file_type TEXT NOT NULL,
  file_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  email_account_id INTEGER,
  email_subject TEXT,
  status TEXT NOT NULL DEFAULT 'unreimbursed',
  reimbursement_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email_account_id) REFERENCES email_accounts(id)
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
  status TEXT NOT NULL DEFAULT 'draft',
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
`

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
  db.exec(SCHEMA)
  console.log('Database initialized at:', dbPath)
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}
