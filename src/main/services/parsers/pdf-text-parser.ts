/**
 * PDF 文本解析器（基于正则，从原 invoice-parser.ts 迁移）
 *
 * 使用 pdf2json 提取纯文本流，再用正则匹配发票字段。
 * 此模块将在 Phase 2 被 pdf-position-parser.ts 替代为主路径，
 * 但保留作为兼容回退。
 */

import PDFParser from 'pdf2json'
import type { ParsedInvoice } from './types'
import { parseNum } from './utils'

/** 按顺序尝试多个正则，返回第一个非空捕获组 */
function tryMatch(patterns: RegExp[], src: string): string | undefined {
  for (const pat of patterns) {
    const m = src.match(pat)
    if (m?.[1]?.trim()) return m[1].trim()
  }
  return undefined
}

export async function parsePdfText(buffer: Buffer): Promise<ParsedInvoice> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParser = new (PDFParser as any)(null, 1)

  const text: string = await new Promise((resolve, reject) => {
    pdfParser.on('pdfParser_dataReady', () => {
      resolve(pdfParser.getRawTextContent())
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfParser.on('pdfParser_dataError', (err: any) => {
      reject(new Error(err?.parserError || 'PDF 解析失败'))
    })
    pdfParser.parseBuffer(buffer)
  })

  pdfParser.destroy()

  console.log('[parsePdfText] ====== 原始提取文本 ======')
  console.log(text)
  console.log('[parsePdfText] ====== 文本结束 ======')

  const log = (label: string, value: unknown): void => {
    console.log(`[parsePdfText] ${label}: ${value ?? '❌ 未匹配'}`)
  }

  // ---- 发票号码 ----
  let invoiceNumber = tryMatch([
    /发票号码[：:\s]*(\d{6,20})/,
    /发票号码[\s\S]{0,20}?(\d{8,20})/,
    /(?:^|\n)\s*号\s*码[：:\s]*(\d{8,20})/m,
  ], text)
  if (!invoiceNumber) {
    const allNums = [...text.matchAll(/(?<!\d)(\d{8,20})(?!\d)/g)].map(m => m[1])
    const candidates = allNums.filter(n => {
      if (/^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(n)) return false
      return true
    })
    invoiceNumber = candidates[0] ?? allNums[0]
  }
  log('发票号码', invoiceNumber)

  // ---- 发票代码 ----
  const invoiceCode = tryMatch([
    /发票代码[：:\s]*(\d{6,12})/,
    /发票代码[\s\S]{0,10}?(\d{6,12})/,
  ], text)
  log('发票代码', invoiceCode)

  // ---- 开票日期 ----
  let rawDate = text.match(/开票日期[：:\s]*(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/)
  if (!rawDate) rawDate = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (!rawDate) rawDate = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  const invoiceDate = rawDate
    ? `${rawDate[1]}-${rawDate[2].padStart(2, '0')}-${rawDate[3].padStart(2, '0')}`
    : undefined
  log('开票日期', invoiceDate)

  // ---- 发票类型 ----
  const invoiceType = tryMatch([
    /(全电发票[（(][^）)]+[）)])/,
    /(增值税电子[普专].*?发票)/,
    /(电子发票[（(].*?[）)])/,
    /(增值税[专普].*?发票)/,
    /([\u4e00-\u9fa5]{2,}电子[普专].*?发票)/,
  ], text)
  log('发票类型', invoiceType)

  // ---- 购买方/销售方 名称 ----
  const companyRe =
    /(?:有限公[私司]|有限责任公司|股份有限公司|集团|个体工商户|工作室|经营部|商行|商店|餐厅|餐饮店|小馆|饭店|酒店管理|酒店|科技|平台|出行|饮食|餐饮)/

  let buyerName: string | undefined
  let sellerName: string | undefined

  const extractName = (src: string): string | undefined =>
    tryMatch([
      /名\s*称[：:]\s*(.+?)(?:\s{2,}|\r?\n)/,
      /名\s*称[：:]\s*\r?\n\s*(.+?)(?:\s{2,}|\r?\n)/,
    ], src)

  const buyerIdx = Math.max(text.indexOf('购买方'), text.indexOf('购方'))
  const sellerIdx = Math.max(text.indexOf('销售方'), text.indexOf('销方'))
  if (buyerIdx !== -1 && sellerIdx !== -1) {
    const firstIdx = Math.min(buyerIdx, sellerIdx)
    const secondIdx = Math.max(buyerIdx, sellerIdx)
    const firstSection = text.substring(firstIdx, secondIdx)
    const secondSection = text.substring(secondIdx, secondIdx + 300)
    const firstIsBuyer = buyerIdx < sellerIdx
    buyerName = extractName(firstIsBuyer ? firstSection : secondSection)
    sellerName = extractName(firstIsBuyer ? secondSection : firstSection)
  }

  if (!buyerName || !sellerName) {
    const nameMatches = [...text.matchAll(/名\s*称[：:]\s*(.+?)(?:\s{2,}|\n|$)/g)]
      .map(m => m[1].trim())
      .filter(v => v.length > 1 && !/^名\s*称/.test(v) && v !== '名称：')
    if (nameMatches.length >= 2) {
      if (!buyerName) buyerName = nameMatches[0]
      if (!sellerName) sellerName = nameMatches[1]
    } else if (nameMatches.length === 1) {
      if (!sellerName) sellerName = nameMatches[0]
    }
  }

  if (!buyerName || !sellerName) {
    const lines = text.split('\n').map(l => l.trim())
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^名\s*称[：:]?\s*$/.test(lines[i]) && lines[i + 1]?.length > 1) {
        const candidate = lines[i + 1]
        if (!buyerName) {
          buyerName = candidate
        } else if (!sellerName) {
          sellerName = candidate
          break
        }
      }
    }
  }

  if (!buyerName || !sellerName) {
    const lines = text.split('\n').map(l => l.trim())
    for (const line of lines) {
      const parts = line.split(/\s{10,}/)
      if (parts.length >= 2 && parts.every(p => companyRe.test(p))) {
        if (!buyerName) buyerName = parts[0].trim()
        if (!sellerName) sellerName = parts[1].trim()
        log('同行双公司匹配', [buyerName, sellerName])
        break
      }
    }
    if (!buyerName || !sellerName) {
      const companyLines = lines.filter(l => companyRe.test(l) && !l.includes('名称') && l.length > 2)
      log('公司后缀匹配行', JSON.stringify(companyLines))
      if (companyLines.length >= 2) {
        if (!buyerName) buyerName = companyLines[0]
        if (!sellerName) sellerName = companyLines[1]
      } else if (companyLines.length === 1 && !sellerName) {
        sellerName = companyLines[0]
      }
    }
  }

  log('购买方名称', buyerName)
  log('销售方名称', sellerName)

  // ---- 购买方/销售方 税号 ----
  let buyerTaxId: string | undefined
  let sellerTaxId: string | undefined

  const taxIdFromLabel = [...text.matchAll(
    /(?:统一社会信用代码|纳税人识别号)[\/\s]*(?:纳税人识别号)?[：:\s]*([A-Za-z0-9]{15,20})/g
  )]
  if (taxIdFromLabel.length >= 2) {
    buyerTaxId = taxIdFromLabel[0][1]
    sellerTaxId = taxIdFromLabel[1][1]
  } else if (taxIdFromLabel.length === 1) {
    buyerTaxId = taxIdFromLabel[0][1]
  }

  if ((!buyerTaxId || !sellerTaxId) && buyerIdx !== -1 && sellerIdx !== -1) {
    const firstIdx = Math.min(buyerIdx, sellerIdx)
    const secondIdx = Math.max(buyerIdx, sellerIdx)
    const firstIsBuyer = buyerIdx < sellerIdx
    const taxRe = /(?:统一社会信用代码|纳税人识别号|税\s*号)[：:\s]*([A-Za-z0-9]{15,20})/
    const firstTax = text.substring(firstIdx, secondIdx).match(taxRe)?.[1]
    const secondTax = text.substring(secondIdx, secondIdx + 300).match(taxRe)?.[1]
    if (!buyerTaxId && firstIsBuyer) buyerTaxId = firstTax
    else if (!sellerTaxId && !firstIsBuyer) sellerTaxId = firstTax
    if (!sellerTaxId && firstIsBuyer) sellerTaxId = secondTax
    else if (!buyerTaxId && !firstIsBuyer) buyerTaxId = secondTax
  }

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

  if (!buyerTaxId || !sellerTaxId) {
    const allTaxIds = [...text.matchAll(/(?:^|\n|\s{3,})([9][A-Za-z0-9]{17})(?:\s{3,}|\n|$)/gm)]
      .map(m => m[1])
    if (allTaxIds.length >= 2) {
      if (!buyerTaxId) buyerTaxId = allTaxIds[0]
      if (!sellerTaxId) sellerTaxId = allTaxIds[1]
    } else if (allTaxIds.length === 1 && !sellerTaxId) {
      sellerTaxId = allTaxIds[0]
    }
  }

  log('购买方税号', buyerTaxId)
  log('销售方税号', sellerTaxId)

  // ---- 金额字段 ----
  const totalAmount = parseNum(tryMatch([
    /价税合计[（(][小写Ⅰ][）)][：:\s]*[¥￥]?\s*([\d,.]+)/,
    /价税合计[：:\s]*(?:[（(]小写[）)])?[¥￥]\s*([\d,.]+)/,
    /价税合计[：:\s]*[¥￥]?\s*([\d,.]+)/,
    /[（(]小写[）)][：:\s]*[¥￥]?\s*([\d,.]+)/,
  ], text))

  const amount = parseNum(tryMatch([
    /合计金额[：:\s]*[¥￥]\s*([\d,.]+)/,
    /金\s*额合计[：:\s]*[¥￥]\s*([\d,.]+)/,
    /合\s*计[^税]*[¥￥]\s*([\d,.]+)/,
  ], text))

  const taxAmount = parseNum(tryMatch([
    /合计税额[：:\s]*[¥￥]\s*([\d,.]+)/,
    /税\s*额合计[：:\s]*[¥￥]\s*([\d,.]+)/,
    /税\s*额[：:\s]*[¥￥]\s*([\d,.]+)/,
  ], text))

  let amountFinal = amount
  let taxAmountFinal = taxAmount
  let totalAmountFinal = totalAmount

  if (totalAmountFinal === undefined || amountFinal === undefined) {
    let allYenNumbers = [...text.matchAll(/[¥￥]\s*([\d,.]+)/g)]
      .map(m => parseNum(m[1]))
      .filter((v): v is number => v !== undefined)

    if (allYenNumbers.length < 3) {
      const tableNums = [...text.matchAll(/\b(\d+[,.]\d{2})\b/g)]
        .map(m => parseNum(m[1]))
        .filter((v): v is number => v !== undefined && v > 1)
      if (tableNums.length > allYenNumbers.length) allYenNumbers = tableNums
    }
    log('全文¥数字列表（回退）', JSON.stringify(allYenNumbers))

    const hejiIdx = text.search(/合\s*计/)
    const totalLabelIdx = text.search(/价税合计/)
    const section = hejiIdx >= 0
      ? text.substring(hejiIdx, totalLabelIdx > hejiIdx ? totalLabelIdx : text.length)
      : ''
    let sectionNums = [...section.matchAll(/[¥￥]\s*([\d,.]+)/g)]
    if (sectionNums.length === 0 && section.length > 0) {
      sectionNums = [...section.matchAll(/\b([\d,]+\.\d{2})\b/g)]
    }

    if (!amountFinal) amountFinal = sectionNums[0] ? parseNum(sectionNums[0][1]) : allYenNumbers[0]
    if (!taxAmountFinal) taxAmountFinal = sectionNums[1] ? parseNum(sectionNums[1][1]) : allYenNumbers[1]
    if (!totalAmountFinal) {
      totalAmountFinal = allYenNumbers.length > 0
        ? Math.max(...allYenNumbers)
        : undefined
    }
  }

  log('金额（不含税）', amountFinal)
  log('税额', taxAmountFinal)
  log('价税合计', totalAmountFinal)

  // ---- 发票内容（项目名称）----
  const contentItems: string[] = []
  const starPattern = /\*(.+?)\*/g
  let contentMatch: RegExpExecArray | null
  while ((contentMatch = starPattern.exec(text)) !== null) {
    const category = contentMatch[1].trim()
    if (category.length > 1 && !/^[\d.]+$/.test(category)) {
      contentItems.push(category)
    }
  }
  const invoiceContent = contentItems.length > 0
    ? [...new Set(contentItems)].join(', ')
    : undefined
  log('发票内容', invoiceContent)

  const result: ParsedInvoice = {
    invoiceNumber,
    invoiceCode,
    invoiceDate,
    invoiceType,
    sellerName,
    sellerTaxId,
    buyerName,
    buyerTaxId,
    amount: amountFinal,
    taxAmount: taxAmountFinal,
    totalAmount: totalAmountFinal,
    invoiceContent,
  }

  console.log('[parsePdfText] ====== 解析结果 ======')
  console.log(JSON.stringify(result, null, 2))

  return result
}
