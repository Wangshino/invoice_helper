/**
 * 发票解析管线 — 公共类型定义
 */

import type { InvoiceFileType, ParsedInvoice } from '../../../shared/types'

// Re-export ParsedInvoice from shared (唯一真相源)
export type { ParsedInvoice }

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
