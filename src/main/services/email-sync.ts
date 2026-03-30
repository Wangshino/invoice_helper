/**
 * 邮件同步编排器 — 核心业务逻辑
 *
 * 流程: IMAP 获取邮件 → 附件过滤 → magic bytes 检测 → 解析 → 去重 → 存储入库
 * 同时支持无附件邮件的 HTML 正文下载链接提取
 */
import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import * as emailAccountRepo from '../repositories/email-account-repository'
import * as invoiceRepo from '../repositories/invoice-repository'
import * as syncLogRepo from '../repositories/sync-log-repository'
import {
  findAttachments,
  isInvoiceCandidate,
  hasInvoiceKeyword,
  extractZipAttachments,
  sortByPriority,
  resolveFilenameWithBuffer,
  isInvoiceBuffer,
  inferExtensionFromBuffer,
  extractInvoiceDownloadLinks
} from './attachment-utils'
import { fetchMessages, downloadAttachment, listMailboxes, fetchEmailHtml } from './email-imap'
import { parseInvoiceFile, storeInvoiceFile, detectFileType, buildStandardFileName } from './invoice-parser'
import type { ImapConfig } from './email-imap'
import type { Invoice, EmailSyncResult } from '../../shared/types'
import { FieldMappers } from '../../shared/types'

// ============================================================
// 同步日志
// ============================================================

let syncLogs: string[] = []
let debugMode = false

function log(msg: string): void {
  const entry = `[${new Date().toISOString().slice(11, 19)}] ${msg}`
  console.log(`[syncEmails] ${msg}`)
  if (debugMode) {
    syncLogs.push(entry)
  }
}

/** 获取同步日志（前端读取用） */
export function getSyncLog(): string {
  return syncLogs.join('\n')
}

/** 清空同步日志 */
export function clearSyncLog(): void {
  syncLogs = []
}

/** 开启/关闭调试模式 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
  if (enabled) syncLogs = []
}

// ============================================================
// 公开接口
// ============================================================

/** 同步指定邮箱账户，返回同步结果 */
export async function syncEmailAccount(accountId: number): Promise<EmailSyncResult> {
  // 1. 读取账户信息
  const account = emailAccountRepo.findById(accountId)
  if (!account) throw new Error(`邮箱账户不存在: ${accountId}`)

  const password = emailAccountRepo.getDecryptedPassword(String(accountId))
  const config: ImapConfig = {
    host: account.imap_host,
    port: account.imap_port,
    user: account.email,
    pass: password
  }
  const folder = account.mail_folder || 'INBOX'
  const limit = account.sync_limit || 200
  const lastUid = account.last_sync_uid

  log(`开始同步: ${account.email}, folder="${folder}", lastUid=${lastUid}, limit=${limit}, debug=${debugMode}`)

  // 1.5 列出可用文件夹（调试）
  try {
    const mailboxes = await listMailboxes(config)
    log(`可用文件夹: ${JSON.stringify(mailboxes)}`)
    if (!mailboxes.includes(folder)) {
      log(`警告: 文件夹 "${folder}" 不在可用列表中!`)
      const match = mailboxes.find(
        (m) => m.toLowerCase() === folder.toLowerCase()
      )
      if (match) {
        log(`找到大小写匹配: "${match}"`)
      }
    }
  } catch (e) {
    log(`列出文件夹失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. 获取邮件
  const messages = await fetchMessages(config, folder, lastUid, limit)
  log(`获取到 ${messages.length} 封邮件`)

  const imported: Invoice[] = []
  const skipped: EmailSyncResult['skipped'] = []
  const failed: EmailSyncResult['failed'] = []
  let totalScanned = 0
  let finalUid = lastUid ?? 0

  // 3. 遍历邮件
  for (const msg of messages) {
    totalScanned++
    log(`--- 邮件 uid=${msg.uid}: "${msg.subject}" (from: ${msg.from})`)

    // 3a. 提取所有附件
    const allAttachments = findAttachments(msg.bodyStructure)
    log(`  bodyStructure 分析: 找到 ${allAttachments.length} 个附件`)

    if (debugMode && allAttachments.length > 0) {
      for (const att of allAttachments) {
        log(`  附件: part=${att.partId}, name="${att.filename}", size=${att.size}, type="${att.contentType}"`)
      }
    }

    // 3b. 过滤出发票候选附件 (通过 filename + contentType)
    const candidates = allAttachments.filter((a) => isInvoiceCandidate(a.filename, a.contentType))
    log(`  发票候选附件: ${candidates.length} 个 (来自 ${allAttachments.length} 个总附件)`)

    if (debugMode && allAttachments.length > 0 && candidates.length === 0) {
      log(`  所有附件文件名: ${allAttachments.map((a) => a.filename).join(', ')}`)
    }

    // 3c. 有附件 → 处理附件
    if (candidates.length > 0) {
      const sorted = sortByPriority(candidates)
      const processedNumbers = new Set<string>()

      for (const att of sorted) {
        log(`  处理附件: "${att.filename}" (${att.contentType}, ${att.size} bytes)`)

        try {
          // 下载附件
          const buffer = await downloadAttachment(config, folder, msg.uid, att.partId)
          log(`  下载完成: ${buffer.length} bytes`)

          // 用 magic bytes 检测实际类型，生成正确的文件名
          const resolvedName = resolveFilenameWithBuffer(att, buffer)
          if (!resolvedName) {
            log(`  跳过: magic bytes 检测为非发票文件 (可能是图片等)`)
            continue
          }
          log(`  文件名解析: "${att.filename}" → "${resolvedName}"`)

          // zip 特殊处理
          const ext = resolvedName.split('.').pop()?.toLowerCase()
          if (ext === 'zip') {
            const innerFiles = extractZipAttachments(buffer)
            log(`  zip 内含 ${innerFiles.length} 个发票文件`)
            for (const inner of innerFiles) {
              await processAttachmentBuffer(
                inner.content,
                inner.filename,
                msg.subject,
                accountId,
                processedNumbers,
                imported,
                skipped,
                failed
              )
            }
          } else {
            await processAttachmentBuffer(
              buffer,
              resolvedName,
              msg.subject,
              accountId,
              processedNumbers,
              imported,
              skipped,
              failed
            )
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e)
          log(`  处理附件 "${att.filename}" 失败: ${errMsg}`)
          failed.push({ fileName: att.filename, error: errMsg })
        }
      }

      finalUid = msg.uid
      emailAccountRepo.updateLastSyncUid(accountId, msg.uid)
      continue
    }

    // 3d. 无附件 → 尝试从 HTML 正文提取下载链接
    if (hasInvoiceKeyword(msg.subject)) {
      log(`  无附件但主题含发票关键词, 尝试从 HTML 正文提取下载链接...`)
      try {
        const html = await fetchEmailHtml(config, folder, msg.uid, msg.bodyStructure)
        if (html) {
          const links = extractInvoiceDownloadLinks(html)
          log(`  提取到 ${links.length} 个下载链接`)

          if (links.length > 0) {
            const processedNumbers = new Set<string>()
            for (const link of links) {
              log(`  下载链接: format=${link.format}, invoiceNumber=${link.invoiceNumber}`)
              try {
                const buffer = await downloadFromUrl(link.url)
                if (!buffer || !isInvoiceBuffer(buffer)) {
                  log(`  下载内容非发票文件, 跳过`)
                  continue
                }
                const ext = inferExtensionFromBuffer(buffer) || `.${link.format}`
                const filename = `email-link-${link.invoiceNumber || Date.now()}${ext}`

                await processAttachmentBuffer(
                  buffer,
                  filename,
                  msg.subject,
                  accountId,
                  processedNumbers,
                  imported,
                  skipped,
                  failed
                )
              } catch (e) {
                const errMsg = e instanceof Error ? e.message : String(e)
                log(`  下载链接失败: ${errMsg}`)
                failed.push({ fileName: `download-link-${link.format}`, error: errMsg })
              }
            }
          }
        } else {
          log(`  无 HTML 正文`)
        }
      } catch (e) {
        log(`  HTML 正文提取失败: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      log(`  跳过: 无发票附件且主题不含关键词`)
    }

    finalUid = msg.uid
    emailAccountRepo.updateLastSyncUid(accountId, msg.uid)
  }

  log(`同步完成: ${imported.length} 导入, ${skipped.length} 跳过, ${failed.length} 失败, ${totalScanned} 扫描`)

  // 4. 写入同步日志到数据库
  try {
    syncLogRepo.create({
      emailAccountId: accountId,
      scanned: totalScanned,
      imported: imported.length,
      skipped: skipped.length,
      failed: failed.length,
      fullLog: getSyncLog()
    })
    log(`同步日志已写入数据库`)
  } catch (e) {
    console.error('[syncEmails] 写入同步日志失败:', e instanceof Error ? e.message : String(e))
  }

  return { imported, skipped, failed, totalScanned, lastSyncUid: finalUid }
}

// ============================================================
// 内部函数
// ============================================================

/** 处理单个附件 Buffer: 写临时文件 → 解析 → 去重 → 存储入库 */
async function processAttachmentBuffer(
  buffer: Buffer,
  filename: string,
  emailSubject: string,
  accountId: number,
  processedNumbers: Set<string>,
  imported: Invoice[],
  skipped: EmailSyncResult['skipped'],
  failed: EmailSyncResult['failed']
): Promise<void> {
  const tempPath = bufferToTempFile(buffer, filename)
  try {
    // 解析
    let parsed
    try {
      parsed = await parseInvoiceFile(tempPath)
      log(`    解析结果: invoiceNumber="${parsed.invoiceNumber}", totalAmount=${parsed.totalAmount}, sellerName="${parsed.sellerName}"`)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      log(`    解析失败 "${filename}": ${errMsg}`)
      failed.push({ fileName: filename, error: errMsg })
      return
    }

    // 检查解析完整性
    if (!parsed.invoiceNumber) {
      log(`    跳过: 无发票号码`)
      skipped.push({ fileName: filename, reason: 'no_invoice_number' })
      return
    }
    if (!parsed.totalAmount || !parsed.sellerName) {
      log(`    跳过: 解析不完整 (totalAmount=${parsed.totalAmount}, sellerName="${parsed.sellerName}")`)
      failed.push({
        fileName: filename,
        error: `解析不完整: totalAmount=${parsed.totalAmount}, sellerName=${parsed.sellerName}`
      })
      return
    }

    // 邮件内去重
    if (processedNumbers.has(parsed.invoiceNumber)) {
      log(`    跳过: 邮件内重复 ${parsed.invoiceNumber}`)
      skipped.push({
        fileName: filename,
        invoiceNumber: parsed.invoiceNumber,
        reason: 'same_invoice_in_email'
      })
      return
    }

    // DB 去重
    const existing = invoiceRepo.findByInvoiceNumber(parsed.invoiceNumber)
    if (existing) {
      log(`    跳过: 已入库 ${parsed.invoiceNumber}`)
      skipped.push({
        fileName: filename,
        invoiceNumber: parsed.invoiceNumber,
        reason: 'duplicate'
      })
      return
    }

    // 存储文件 + 入库
    const fileType = detectFileType(tempPath)
    const ext = filename.split('.').pop() || fileType
    const standardName = buildStandardFileName(parsed, ext)
    const filePath = storeInvoiceFile(tempPath, standardName)

    const id = invoiceRepo.create({
      invoiceNumber: parsed.invoiceNumber,
      invoiceCode: parsed.invoiceCode,
      invoiceDate: parsed.invoiceDate,
      invoiceType: parsed.invoiceType,
      sellerName: parsed.sellerName,
      sellerTaxId: parsed.sellerTaxId,
      buyerName: parsed.buyerName,
      buyerTaxId: parsed.buyerTaxId,
      amount: parsed.amount,
      taxAmount: parsed.taxAmount,
      totalAmount: parsed.totalAmount,
      invoiceContent: parsed.invoiceContent,
      filePath,
      fileType,
      fileName: standardName,
      source: 'email',
      emailAccountId: accountId,
      emailSubject
    })

    const row = invoiceRepo.findById(id)
    if (row) {
      imported.push(FieldMappers.invoice.toCamel(row as unknown as Record<string, unknown>))
    }

    processedNumbers.add(parsed.invoiceNumber)
    log(`    导入成功: ${parsed.invoiceNumber} (${filename})`)
  } finally {
    cleanupTempFile(tempPath)
  }
}

/** 从 URL 下载文件到 Buffer */
function downloadFromUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, { timeout: 30000 }, (res) => {
      // 处理重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFromUrl(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

/** Buffer → 临时文件 */
function bufferToTempFile(buffer: Buffer, filename: string): string {
  const tempDir = app.getPath('temp')
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const tempPath = join(tempDir, `invoice-sync-${Date.now()}-${safeName}`)
  fs.writeFileSync(tempPath, buffer)
  return tempPath
}

/** 清理临时文件 */
function cleanupTempFile(path: string): void {
  try {
    if (fs.existsSync(path)) fs.unlinkSync(path)
  } catch {
    /* ignore */
  }
}
