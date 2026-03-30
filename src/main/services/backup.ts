import AdmZip from 'adm-zip'
import { app } from 'electron'
import { join, basename } from 'path'
import fs from 'fs'
import { closeDatabase, initDatabase } from './database'

const DATA_DIR = () => join(app.getPath('userData'), 'data')
const INVOICES_DIR = () => join(app.getPath('userData'), 'invoices')

/** 创建备份 ZIP，返回 ZIP 文件路径 */
export function createBackup(destPath: string): string {
  const zip = new AdmZip()

  // 添加数据库文件
  const dbPath = join(DATA_DIR(), 'invoice-helper.db')
  if (fs.existsSync(dbPath)) zip.addLocalFile(dbPath, 'data/')

  // 添加 WAL 和 SHM（如果存在）
  for (const ext of ['-wal', '-shm']) {
    const walPath = dbPath + ext
    if (fs.existsSync(walPath)) zip.addLocalFile(walPath, 'data/')
  }

  // 添加发票文件目录
  const invoicesDir = INVOICES_DIR()
  if (fs.existsSync(invoicesDir)) {
    const files = fs.readdirSync(invoicesDir)
    for (const file of files) {
      const filePath = join(invoicesDir, file)
      if (fs.statSync(filePath).isFile()) {
        zip.addLocalFile(filePath, 'invoices/')
      }
    }
  }

  zip.writeZip(destPath)
  return destPath
}

/** 从备份 ZIP 恢复 */
export function restoreBackup(zipPath: string): void {
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()

  // 关闭当前数据库连接（释放 WAL 文件锁）
  closeDatabase()

  try {
    // 确保 data 和 invoices 目录存在
    if (!fs.existsSync(DATA_DIR())) fs.mkdirSync(DATA_DIR(), { recursive: true })
    if (!fs.existsSync(INVOICES_DIR())) fs.mkdirSync(INVOICES_DIR(), { recursive: true })

    // 覆盖 data/ 和 invoices/
    for (const entry of entries) {
      if (entry.isDirectory) continue
      if (entry.entryName.startsWith('data/')) {
        const dest = join(DATA_DIR(), basename(entry.entryName))
        fs.writeFileSync(dest, entry.getData())
      } else if (entry.entryName.startsWith('invoices/')) {
        const dest = join(INVOICES_DIR(), basename(entry.entryName))
        fs.writeFileSync(dest, entry.getData())
      }
    }

    // 重新打开数据库并跑迁移
    initDatabase()
  } catch (e) {
    // 恢复失败也要重新打开数据库
    initDatabase()
    throw e
  }
}
