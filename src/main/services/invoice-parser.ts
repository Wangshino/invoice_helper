/**
 * 发票解析管线 — 统一入口 + 策略调度
 *
 * 支持 OFD / XML / PDF 三种格式，通过 detectFileType 自动路由到对应解析器。
 * PDF 解析优先使用坐标定位，文本为空时自动降级到本地 OCR。
 */

import { app } from 'electron'
import { join, basename } from 'path'
import fs from 'fs'
import type { InvoiceFileType } from '../../shared/types'
import { parseOfd } from './parsers/ofd-parser'
import { parseXml } from './parsers/xml-parser'
import { parsePdf } from './parsers/pdf-position-parser'
import type { ParsedInvoice, ParseResult } from './parsers/types'

// Re-export types for external consumers
export type { ParsedInvoice, ParseResult }

// ============================================================
// 文件类型检测
// ============================================================

export function detectFileType(filePath: string): InvoiceFileType {
  const ext = filePath.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'ofd') return 'ofd'
  if (ext === 'xml') return 'xml'
  throw new Error(`不支持的文件类型: .${ext}`)
}

// ============================================================
// 统一解析入口
// ============================================================

/** 解析单个发票文件 */
export async function parseInvoiceFile(filePath: string): Promise<ParsedInvoice> {
  const fileType = detectFileType(filePath)
  console.log(`[parseInvoiceFile] 解析文件: ${filePath}, 类型: ${fileType}`)
  const buffer = fs.readFileSync(filePath)

  switch (fileType) {
    case 'ofd':
      return parseOfd(buffer)
    case 'xml':
      return parseXml(buffer)
    case 'pdf':
      return parsePdf(buffer)
  }
}

// ============================================================
// 标准文件名
// ============================================================

/** 生成标准化文件名: {发票号}-{发票内容}-{金额}-{日期}.{扩展名} */
export function buildStandardFileName(
  parsed: ParsedInvoice,
  ext: string
): string {
  const num = parsed.invoiceNumber || 'unknown'
  const content = (parsed.invoiceContent || '未知内容')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 30)
  const amount = parsed.totalAmount != null
    ? parsed.totalAmount.toFixed(2)
    : '0.00'
  const date = parsed.invoiceDate || 'unknown'
  return `${num}-${content}-${amount}-${date}.${ext}`
}

// ============================================================
// 文件存储
// ============================================================

/** 获取发票文件存储目录 */
export function getInvoiceStoragePath(): string {
  const dir = join(app.getPath('userData'), 'invoices')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 复制导入文件到内部存储, 返回存储路径 */
export function storeInvoiceFile(sourcePath: string, standardName?: string): string {
  const storageDir = getInvoiceStoragePath()
  const targetName = standardName || basename(sourcePath)
  let destPath = join(storageDir, targetName)

  if (fs.existsSync(destPath)) {
    const ext = targetName.split('.').pop()!
    const baseName = targetName.slice(0, -(ext.length + 1))
    destPath = join(storageDir, `${baseName}_${Date.now()}.${ext}`)
  }

  fs.copyFileSync(sourcePath, destPath)
  return destPath
}

/** 删除内部存储的发票文件 */
export function deleteStoredFile(filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (e) {
    console.warn('[deleteStoredFile] 删除文件失败:', filePath, e)
  }
}

/** 解析并导入: 解析文件 → 存储文件 → 返回结构化结果 */
export async function parseAndStore(sourcePath: string): Promise<ParseResult> {
  const fileType = detectFileType(sourcePath)
  const fileName = basename(sourcePath)
  const filePath = storeInvoiceFile(sourcePath)
  const parsed = await parseInvoiceFile(sourcePath)

  return { parsed, filePath, fileType, fileName }
}
