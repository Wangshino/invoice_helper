/**
 * 发票解析管线 — 统一入口
 *
 * 支持三种格式:
 *   OFD: invoice-ofd2json 解析为中文键值对
 *   XML: fast-xml-parser 解析全电发票 XML
 *   PDF: 百度 OCR 增值税发票识别 API
 */

import { app } from 'electron'
import { join, basename } from 'path'
import fs from 'fs'
import ofd2json from 'invoice-ofd2json'
import { XMLParser } from 'fast-xml-parser'
import * as settingsRepo from '../repositories/settings-repository'
import { recognizeInvoice, type OcrInvoiceResult } from './invoice-ocr'
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
  const result: Record<string, string> = await ofd2json(buffer)

  const parseNum = (v: string | undefined): number | undefined => {
    if (!v) return undefined
    const n = parseFloat(v.replace(/[,，¥￥\s]/g, ''))
    return isNaN(n) ? undefined : n
  }

  return {
    invoiceNumber: result['发票号码'] || undefined,
    invoiceCode: result['发票代码'] || undefined,
    invoiceDate: result['开票日期'] || undefined,
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

  // 多种 XML 格式兼容
  const data = result.EInvoice?.EInvoiceData ||
    result.EInvoiceData ||
    result.CompositeInvoice?.EInvoiceData ||
    result

  const basic = data.BasicInformation || {}
  const buyer = data.BuyerInformation || {}
  const seller = data.SellerInformation || {}
  const tax = data.TaxInformation || {}

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

  return {
    invoiceNumber: get(basic, 'InvoiceNumber', 'InvoiceNum', 'Fphm'),
    invoiceCode: get(basic, 'InvoiceCode', 'Fpdm'),
    invoiceDate: get(basic, 'IssueDate', 'InvoiceDate', 'Kprq'),
    invoiceType: get(basic, 'InvoiceType', 'Fpzl'),
    sellerName: get(seller, 'SellerName', 'Name', 'XsfMc'),
    sellerTaxId: get(seller, 'SellerTaxID', 'SellerRegisterNumber', 'TaxID', 'XsfNsrsbh'),
    buyerName: get(buyer, 'BuyerName', 'Name', 'GmfMc'),
    buyerTaxId: get(buyer, 'BuyerTaxID', 'BuyerRegisterNumber', 'TaxID', 'GmfNsrsbh'),
    amount: parseNum(get(tax, 'Amount', 'TotalAmount', 'Hjje')),
    taxAmount: parseNum(get(tax, 'TotalTax', 'TaxAmount', 'Hjse')),
    totalAmount: parseNum(get(tax, 'AmountIncludingTax', 'TotalIncludingTax', 'Jshj'))
  }
}

// ============================================================
// PDF 解析 (百度 OCR)
// ============================================================

async function parsePdf(buffer: Buffer): Promise<ParsedInvoice> {
  const apiKey = settingsRepo.get('baidu_ocr_api_key')
  const secretKey = settingsRepo.get('baidu_ocr_secret_key')

  if (!apiKey || !secretKey) {
    throw new Error('PDF发票解析需要配置百度OCR API Key。请在设置中配置百度OCR密钥。')
  }

  const ocrResult: OcrInvoiceResult = await recognizeInvoice(
    { apiKey, secretKey },
    buffer,
    'pdf'
  )

  return {
    invoiceNumber: ocrResult.invoice_number || undefined,
    invoiceCode: ocrResult.invoice_code || undefined,
    invoiceDate: ocrResult.invoice_date || undefined,
    invoiceType: ocrResult.invoice_type || undefined,
    sellerName: ocrResult.seller_name || undefined,
    sellerTaxId: ocrResult.seller_tax_id || undefined,
    buyerName: ocrResult.buyer_name || undefined,
    buyerTaxId: ocrResult.buyer_tax_id || undefined,
    amount: ocrResult.amount || undefined,
    taxAmount: ocrResult.tax_amount || undefined,
    totalAmount: ocrResult.total_amount || undefined
  }
}

// ============================================================
// 统一解析入口
// ============================================================

/** 解析单个发票文件 */
export async function parseInvoiceFile(filePath: string): Promise<ParsedInvoice> {
  const fileType = detectFileType(filePath)
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

/** 解析并导入: 解析文件 → 存储文件 → 返回结构化结果 */
export async function parseAndStore(sourcePath: string): Promise<ParseResult> {
  const fileType = detectFileType(sourcePath)
  const fileName = basename(sourcePath)
  const filePath = storeInvoiceFile(sourcePath)
  const parsed = await parseInvoiceFile(sourcePath)

  return { parsed, filePath, fileType, fileName }
}
