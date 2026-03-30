/**
 * 发票解析管线 — 公共类型定义
 */

import type { InvoiceFileType } from '../../../shared/types'

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
  invoiceContent?: string
}

export interface ParseResult {
  parsed: ParsedInvoice
  filePath: string
  fileType: InvoiceFileType
  fileName: string
}

// ============================================================
// PDF 坐标相关类型
// ============================================================

/** pdf.js-extract 提取的单个文字块 */
export interface TextBlock {
  x: number
  y: number
  str: string
  width: number
  height: number
  fontName?: string
}

/** 发票区域定义（百分比坐标） */
export interface InvoiceRegion {
  name: string
  xMin: number  // 0~100
  xMax: number
  yMin: number  // 0~100
  yMax: number
}

/** 区域提取结果 */
export interface RegionText {
  region: InvoiceRegion
  blocks: TextBlock[]
}

// ============================================================
// 解析器接口
// ============================================================

export interface InvoiceParser {
  parse(buffer: Buffer): Promise<ParsedInvoice>
}
