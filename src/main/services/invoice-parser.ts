/**
 * 发票解析管线 — 统一入口
 *
 * 支持三种格式:
 *   OFD: invoice-ofd2json 解析为中文键值对
 *   XML: fast-xml-parser 解析全电发票 XML
 *   PDF: pdf2json 本地文本提取 + 正则匹配
 */

import { app } from 'electron'
import { join, basename } from 'path'
import fs from 'fs'
import ofd2json from 'invoice-ofd2json'
import { XMLParser } from 'fast-xml-parser'
import PDFParser from 'pdf2json'
import type { InvoiceFileType } from '../../shared/types'

// ============================================================
// 解析结果类型
// ============================================================

export interface ParsedInvoice {
  invoiceNumber?: string
  invoiceCode?: string
  invoiceDate?: string
  invoiceType?: string
  sellerName?: string
  sellerTaxId?: string
  buyerName?: string
  buyerTaxId?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
}

export interface ParseResult {
  parsed: ParsedInvoice
  filePath: string
  fileType: InvoiceFileType
  fileName: string
}

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
// 日期格式归一化
// ============================================================

/** 将各种中文日期格式统一为 YYYY-MM-DD */
function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  // "2026年03月22日" 或 "2026年 3月22日"
  const cn = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (cn) return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`
  // ISO "2026-03-22" 或 "2026-03-22T..." → 取日期部分
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  return raw.trim() || undefined
}

// ============================================================
// OFD 解析
// ============================================================

/**
 * OFD 解析 — 使用 invoice-ofd2json
 *
 * 返回的键名 (中文):
 *   发票号码, 发票代码, 开票日期, 电子发票类型,
 *   购买方名称, 购买方统一社会信用代码/纳税人识别号,
 *   销售方名称, 销售方统一社会信用代码/纳税人识别号,
 *   合计金额, 合计税额, 价税合计（小写）
 */
async function parseOfd(buffer: Buffer): Promise<ParsedInvoice> {
  const fn = ofd2json as unknown as (buf: Buffer) => Promise<Record<string, string>>
  const result = await fn(buffer)

  console.log('[parseOfd] ====== OFD 原始字段 ======')
  console.log(JSON.stringify(result, null, 2))

  const parseNum = (v: string | undefined): number | undefined => {
    if (!v) return undefined
    const n = parseFloat(v.replace(/[,，¥￥\s]/g, ''))
    return isNaN(n) ? undefined : n
  }

  return {
    invoiceNumber: result['发票号码'] || undefined,
    invoiceCode: result['发票代码'] || undefined,
    invoiceDate: normalizeDate(result['开票日期'] || result['开票时间'] || result['IssueDate']),
    invoiceType: result['电子发票类型'] || result['特殊发票类型'] || undefined,
    sellerName: result['销售方名称'] || undefined,
    sellerTaxId: result['销售方统一社会信用代码/纳税人识别号'] || undefined,
    buyerName: result['购买方名称'] || undefined,
    buyerTaxId: result['购买方统一社会信用代码/纳税人识别号'] || undefined,
    amount: parseNum(result['合计金额']),
    taxAmount: parseNum(result['合计税额']),
    totalAmount: parseNum(result['价税合计（小写）'])
  }
}

// ============================================================
// XML 解析 (全电发票)
// ============================================================

/**
 * XML 解析 — 全电发票 XML 格式
 *
 * 典型结构:
 * <EInvoice>
 *   <EInvoiceData>
 *     <BasicInformation> ... </BasicInformation>
 *     <BuyerInformation> ... </BuyerInformation>
 *     <SellerInformation> ... </SellerInformation>
 *     <TaxInformation> ... </TaxInformation>
 *   </EInvoiceData>
 * </EInvoice>
 */
async function parseXml(buffer: Buffer): Promise<ParsedInvoice> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  })
  const xml = buffer.toString('utf-8')
  const result = parser.parse(xml)

  console.log('[parseXml] ====== XML 顶层键 ======')
  console.log(Object.keys(result))
  console.log('[parseXml] XML 前 2000 字符:')
  console.log(xml.substring(0, 2000))

  // 多种 XML 格式兼容
  const invoice = result.EInvoice || result.CompositeInvoice || result
  const data = invoice.EInvoiceData ||
    result.EInvoiceData ||
    result

  const header = invoice.Header || {}
  const basic = data.BasicInformation || {}
  const buyer = data.BuyerInformation || {}
  const seller = data.SellerInformation || {}
  const tax = data.TaxInformation || {}
  const label = (header.InherentLabel || {}) as Record<string, unknown>

  // 字段可能来自属性或元素值
  const get = (obj: Record<string, unknown>, ...keys: string[]): string | undefined => {
    for (const key of keys) {
      const v = obj[key] || obj[`@_${key}`]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
    return undefined
  }

  const parseNum = (v: string | undefined): number | undefined => {
    if (!v) return undefined
    const n = parseFloat(v.replace(/[,，¥￥\s]/g, ''))
    return isNaN(n) ? undefined : n
  }

  // 从 InherentLabel 构造发票类型: "电子发票（普通发票）"
  const buildInvoiceType = (): string | undefined => {
    const existing = get(basic, 'InvoiceType', 'Fpzl')
    if (existing) return existing
    const eiType = (label.EInvoiceType as Record<string, unknown>)?.LabelName
    const vatType = (label.GeneralOrSpecialVAT as Record<string, unknown>)?.LabelName
    if (typeof eiType === 'string' && typeof vatType === 'string') {
      return `${eiType}（${vatType}）`
    }
    if (typeof eiType === 'string') return eiType
    return undefined
  }

  return {
    invoiceNumber: get(header, 'EIid') || get(basic, 'InvoiceNumber', 'InvoiceNum', 'Fphm'),
    invoiceCode: get(basic, 'InvoiceCode', 'Fpdm'),
    invoiceDate: normalizeDate(
      get(basic, 'RequestTime', 'IssueDate', 'InvoiceDate', 'Kprq')
    ),
    invoiceType: buildInvoiceType(),
    sellerName: get(seller, 'SellerName', 'Name', 'XsfMc'),
    sellerTaxId: get(seller, 'SellerIdNum', 'SellerTaxID', 'SellerRegisterNumber', 'TaxID', 'XsfNsrsbh'),
    buyerName: get(buyer, 'BuyerName', 'Name', 'GmfMc'),
    buyerTaxId: get(buyer, 'BuyerIdNum', 'BuyerTaxID', 'BuyerRegisterNumber', 'TaxID', 'GmfNsrsbh'),
    amount: parseNum(get(basic, 'TotalAmWithoutTax') || get(tax, 'Amount', 'TotalAmount', 'Hjje')),
    taxAmount: parseNum(get(basic, 'TotalTaxAm') || get(tax, 'TotalTax', 'TaxAmount', 'Hjse')),
    totalAmount: parseNum(get(basic, 'TotalTax-includedAmount') || get(tax, 'AmountIncludingTax', 'TotalIncludingTax', 'Jshj'))
  }
}

// ============================================================
// PDF 解析 (本地文本提取)
// ============================================================

/**
 * PDF 解析 — 使用 pdf2json 提取文本 + 正则匹配发票字段
 *
 * pdf2json 是纯 JS 实现，不依赖 canvas/DOM API，适合 Electron 主进程。
 * 中国增值税电子发票 PDF 通常是数字化生成的，包含可提取的文本流。
 */
async function parsePdf(buffer: Buffer): Promise<ParsedInvoice> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParser = new (PDFParser as any)(null, 1)

  const text: string = await new Promise((resolve, reject) => {
    pdfParser.on('pdfParser_dataReady', () => {
      resolve(pdfParser.getRawTextContent())
    })
    pdfParser.on('pdfParser_dataError', (err: any) => {
      reject(new Error(err?.parserError || 'PDF 解析失败'))
    })
    pdfParser.parseBuffer(buffer)
  })

  pdfParser.destroy()

  console.log('[parsePdf] ====== 原始提取文本 ======')
  console.log(text)
  console.log('[parsePdf] ====== 文本结束 ======')

  const parseNum = (v: string | undefined): number | undefined => {
    if (!v) return undefined
    const n = parseFloat(v.replace(/[,，¥￥\s]/g, ''))
    return isNaN(n) ? undefined : n
  }

  const log = (label: string, value: unknown): void => {
    console.log(`[parsePdf] ${label}: ${value ?? '❌ 未匹配'}`)
  }

  // ---- 发票号码 ----
  // 策略1: 同行 (发票号码：26412000000006008521)
  // 策略2: 全文搜索唯一 18-20 位纯数字串（排除日期格式）
  let invoiceNumber = text.match(/发票号码[：:\s]*(\d{10,20})/)?.[1]
  if (!invoiceNumber) {
    // 查找所有 18-20 位数字串
    const allLongNums = [...text.matchAll(/(\d{18,20})/g)].map(m => m[1])
    // 排除看起来像日期的 (2025xxxxxx 或 20xxxx)
    const candidates = allLongNums.filter(n => !/^20[0-2]\d/.test(n))
    invoiceNumber = candidates[0] || allLongNums[0]
  }
  log('发票号码', invoiceNumber)

  // ---- 发票代码 ----
  const invoiceCode = text.match(/发票代码[：:\s]*(\d{10,12})/)?.[1]
  log('发票代码', invoiceCode)

  // ---- 开票日期 ----
  // 策略1: 标签后同行
  // 策略2: 全文搜索 "YYYY年MM月DD日" 格式（任意位置）
  let rawDate = text.match(
    /开票日期[：:\s]*(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})/
  )
  if (!rawDate) {
    // 全文搜索中文日期格式
    rawDate = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  }
  if (!rawDate) {
    // 尝试 ISO 格式
    rawDate = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  }
  const invoiceDate = rawDate
    ? `${rawDate[1]}-${rawDate[2].padStart(2, '0')}-${rawDate[3].padStart(2, '0')}`
    : undefined
  log('开票日期', invoiceDate)

  // ---- 发票类型 ----
  const invoiceType = text.match(
    /(电子发票[（(].*?[）)]|增值税[电电]*普通发票|增值税专用发票|全电发票)/
  )?.[1]
  log('发票类型', invoiceType)

  // ---- 购买方/销售方 名称 ----
  // 策略1: 标签同行 "名称:上海数顶信息科技有限公司"
  // 策略2: 全文搜索带公司后缀的独立行 (pdf2json 按列提取时值会在远处)
  // 策略3: 同一行内有大量空格分隔的两个公司名
  const companySuffix = /有限公[私司]*|个体工商户|工作室|经营部|商行|商店|餐厅|餐饮店|小馆|饭店|酒店|饺子王|出行|科技|平台|饮食|餐饮/
  let buyerName: string | undefined
  let sellerName: string | undefined

  // 策略1: 从 "名称:" 标签后提取
  const nameMatches = [...text.matchAll(/名\s*称[：:]\s*(.+?)(?:\s{2,}|\n|$)/g)]
    .map(m => m[1].trim())
    .filter(v => v.length > 1 && !/^名\s*称/.test(v) && v !== '名称：')
  if (nameMatches.length >= 2) {
    buyerName = nameMatches[0]
    sellerName = nameMatches[1]
  } else if (nameMatches.length === 1) {
    sellerName = nameMatches[0]
  }

  // 策略2+3: 如果名称提取失败或不完整，用公司后缀匹配
  if (!buyerName || !sellerName) {
    // 先检查是否有单行包含两个公司名（大量空格分隔）
    const doubleCompanyLine = text.split('\n')
      .find(line => {
        const parts = line.split(/\s{10,}/)  // 10个以上空格分隔
        return parts.length >= 2 && parts.every(p => companySuffix.test(p))
      })

    if (doubleCompanyLine && !buyerName) {
      const parts = doubleCompanyLine.split(/\s{10,}/)
      buyerName = parts[0].trim()
      sellerName = sellerName || parts[1].trim()
      log('同行双公司匹配', [buyerName, sellerName])
    } else {
      // 策略2: 独立的公司行
      const companyLines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 2 && companySuffix.test(l) && !l.includes('名称'))
      log('公司后缀匹配行', JSON.stringify(companyLines))
      if (companyLines.length >= 2 && !buyerName) {
        buyerName = companyLines[0]
        sellerName = sellerName || companyLines[1]
      } else if (companyLines.length >= 1 && !sellerName) {
        sellerName = sellerName || companyLines[0]
      }
    }
  }

  // ---- 购买方/销售方 税号 ----
  // 策略1: 标签后同行
  // 策略2: 同一行内有大量空格分隔的两个税号
  // 策略3: 全文搜索独立行的 18 位统一社会信用代码
  let buyerTaxId: string | undefined
  let sellerTaxId: string | undefined
  const taxIdFromLabel = [...text.matchAll(
    /统一社会信用代码[\/\s]*纳税人识别号[：:\s]*([A-Za-z0-9]{15,20})/g
  )]
  if (taxIdFromLabel.length >= 2) {
    buyerTaxId = taxIdFromLabel[0][1]
    sellerTaxId = taxIdFromLabel[1][1]
  } else if (taxIdFromLabel.length === 1) {
    sellerTaxId = taxIdFromLabel[0][1]
  }

  // 策略2: 查找一行内有大量空格分隔的两个税号
  if (!buyerTaxId || !sellerTaxId) {
    const doubleTaxIdLine = text.split('\n').find(line => {
      const parts = line.split(/\s{10,}/)
      return parts.length >= 2 && parts.every(p => /^[A-Za-z0-9]{15,20}$/.test(p.trim()))
    })
    if (doubleTaxIdLine) {
      const parts = doubleTaxIdLine.split(/\s{10,}/)
      if (!buyerTaxId) buyerTaxId = parts[0].trim()
      if (!sellerTaxId) sellerTaxId = parts[1].trim()
      log('同行双税号匹配', [buyerTaxId, sellerTaxId])
    }
  }

  // 兜底: 全文搜索独立行的 18 位代码（以9开头的统一社会信用代码）
  if (!buyerTaxId || !sellerTaxId) {
    const allTaxIds = [...text.matchAll(/(?:^|\n|\s{3,})([9][A-Za-z0-9]{17})(?:\s{3,}|\n|$)/gm)]
      .map(m => m[1])
    if (allTaxIds.length >= 2 && !buyerTaxId) {
      buyerTaxId = allTaxIds[0]
      sellerTaxId = sellerTaxId || allTaxIds[1]
    } else if (allTaxIds.length >= 1 && !sellerTaxId) {
      sellerTaxId = sellerTaxId || allTaxIds[0]
    }
  }

  log('购买方名称', buyerName)
  log('购买方税号', buyerTaxId)
  log('销售方名称', sellerName)
  log('销售方税号', sellerTaxId)

  // ---- 收集全文所有 ¥+数字 以及独立数字 ----
  // pdf2json 可能把 ¥ 和数字分开，所以同时匹配两种情况
  let allYenNumbers = [...text.matchAll(/[¥￥]\s*([\d,.]+)/g)]
    .map(m => parseNum(m[1]))
    .filter((v): v is number => v !== undefined)

  // 如果 ¥ 匹配太少，尝试找独立数字（¥可能在上一行）
  if (allYenNumbers.length < 3) {
    // 查找表格中的数字（小数点格式）
    const tableNums = [...text.matchAll(/\b(\d+[,.]\d{2})\b/g)]
      .map(m => parseNum(m[1]))
      .filter((v): v is number => v !== undefined && v > 1)
    allYenNumbers = tableNums.length > allYenNumbers.length ? tableNums : allYenNumbers
  }
  log('全文¥数字列表', JSON.stringify(allYenNumbers))

  // ---- 金额: 优先从 "合计" 区块提取, 否则取全文第1、2个 ----
  const hejiIdx = text.search(/合\s*计/)
  const totalLabelIdx = text.search(/价税合计/)
  const section = hejiIdx >= 0
    ? text.substring(hejiIdx, totalLabelIdx > hejiIdx ? totalLabelIdx : text.length)
    : ''
  let sectionYen = [...section.matchAll(/[¥￥]\s*([\d,.]+)/g)]

  // 如果合计区域没有 ¥ 数字，尝试匹配表格中的小数数字
  if (sectionYen.length === 0 && section.length > 0) {
    sectionYen = [...section.matchAll(/\b([\d,]+\.\d{2})\b/g)]
  }

  const amount = sectionYen[0] ? parseNum(sectionYen[0][1]) : allYenNumbers[0]
  const taxAmount = sectionYen[1] ? parseNum(sectionYen[1][1]) : allYenNumbers[1]
  log('金额', amount)
  log('税额', taxAmount)

  // ---- 价税合计: 全文最后一个 ¥+数字 ----
  const totalAmount = allYenNumbers.length > 0
    ? allYenNumbers[allYenNumbers.length - 1]
    : undefined
  log('价税合计', totalAmount)

  const result = {
    invoiceNumber,
    invoiceCode,
    invoiceDate,
    invoiceType,
    sellerName,
    sellerTaxId,
    buyerName,
    buyerTaxId,
    amount,
    taxAmount,
    totalAmount
  }

  console.log('[parsePdf] ====== 解析结果 ======')
  console.log(JSON.stringify(result, null, 2))

  return result
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
export function storeInvoiceFile(sourcePath: string): string {
  const storageDir = getInvoiceStoragePath()
  const originalName = basename(sourcePath)
  let destPath = join(storageDir, originalName)

  if (fs.existsSync(destPath)) {
    const ext = originalName.split('.').pop()!
    const baseName = originalName.slice(0, -(ext.length + 1))
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
