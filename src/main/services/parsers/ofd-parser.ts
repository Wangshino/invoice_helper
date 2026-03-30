/**
 * OFD 解析器 — 使用 invoice-ofd2json
 *
 * 返回的键名 (中文):
 *   发票号码, 发票代码, 开票日期, 电子发票类型,
 *   购买方名称, 购买方统一社会信用代码/纳税人识别号,
 *   销售方名称, 销售方统一社会信用代码/纳税人识别号,
 *   合计金额, 合计税额, 价税合计（小写）
 */

import ofd2json from 'invoice-ofd2json'
import type { ParsedInvoice } from './types'
import { normalizeDate, parseNum } from './utils'

export async function parseOfd(buffer: Buffer): Promise<ParsedInvoice> {
  const fn = ofd2json as unknown as (buf: Buffer) => Promise<Record<string, string>>
  const result = await fn(buffer)

  console.log('[parseOfd] ====== OFD 原始字段 ======')
  console.log(JSON.stringify(result, null, 2))

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
    totalAmount: parseNum(result['价税合计（小写）']),
    invoiceContent: result['项目名称'] || result['商品名称'] || undefined,
  }
}
