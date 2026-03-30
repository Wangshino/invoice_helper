/**
 * PDF 坐标定位解析器 — 主 PDF 解析路径
 *
 * 使用 pdf.js-extract 提取带坐标的文字块，通过区域模板匹配提取发票字段。
 * 当文本为空（扫描件/图片 PDF）时自动降级到 OCR，字段严重缺失时回退到文本正则。
 */

import { PDFExtract } from 'pdf.js-extract'
import type { ParsedInvoice, TextBlock, RegionText } from './types'
import { parseNum } from './utils'
import {
  detectLayout,
  getRegions,
  normalizeBlocks,
  assignBlocksToRegions,
  regionToText,
} from './region-extractor'
import { parsePdfText } from './pdf-text-parser'
import { parsePdfOcr } from './pdf-ocr-parser'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFExtractText = any

// ============================================================
// 辅助函数
// ============================================================

/** 判断解析结果是否关键字段严重缺失 */
function isResultDegraded(result: ParsedInvoice): boolean {
  const criticalFields = [
    result.invoiceNumber,
    result.totalAmount,
    result.buyerName,
    result.sellerName,
  ]
  return criticalFields.filter(v => v !== undefined).length < 2
}

/** 判断提取的文字块是否足够用于坐标解析 */
function hasSufficientText(blocks: TextBlock[]): boolean {
  return blocks.reduce((sum, b) => sum + b.str.length, 0) > 50
}

/** 按行正则匹配：在多行文本中查找第一个匹配 */
function lineMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pat of patterns) {
    for (const line of text.split('\n')) {
      const m = line.match(pat)
      if (m?.[1]?.trim()) return m[1].trim()
    }
  }
  return undefined
}

/** 在多行文本中查找所有金额（必须有 ¥ 前缀或小数点） */
function findAmounts(text: string): number[] {
  const yenMatches = [...text.matchAll(/[¥￥]\s*([\d,]+\.\d{2})/g)]
    .map(m => parseNum(m[1]))
    .filter((v): v is number => v != null)
  if (yenMatches.length > 0) return yenMatches

  return [...text.matchAll(/\b([\d,]+\.\d{2})\b/g)]
    .map(m => parseNum(m[1]))
    .filter((v): v is number => v != null && v > 1)
}

/** 从文本中提取含公司后缀的名称 */
function extractCompanyFromText(text: string): string | undefined {
  const companyRe =
    /(?:有限公[私司]|有限责任公司|股份有限公司|集团|个体工商户|工作室|经营部|商行|商店|餐厅|餐饮店|小馆|饭店|酒店管理|酒店|科技|平台|出行|饮食|餐饮)/
  for (const line of text.split('\n')) {
    const trimmed = cleanCompanyName(line.trim())
    if (companyRe.test(trimmed) && !/名\s*称/.test(trimmed) && trimmed.length > 2) {
      return trimmed
    }
  }
  return undefined
}

/**
 * 清洗公司名称：去掉尾部的发票标签碎片字符
 *
 * PDF 文字块按坐标排列时，"购买方"/"销售方"/"信息" 等标签会被拆成
 * 单个字符（"购"、"买"、"方"、"销"、"售"、"信"、"息"），
 * 按行拼接后可能粘在公司名后面，如 "上海数顶信息科技有限公司 销 售"。
 */
function cleanCompanyName(name: string): string {
  // 发票标签中的常见碎片单字（购买方/销售方/信息/统一社会信用代码 等）
  const labelChars = /[购买销售方信纳税务人识别号代码社会用名称项目规型单价金额税率合总计大写小写¥￥密备注校验码区地址电话开户行及账号收款复核开票人电子支付标识查验登录网请数列行页共第号联抵扣联原件复印效资其用途货劳务规格型号数量价格额]/
  // 反复去掉尾部 空格+标签碎片
  let cleaned = name
  for (let i = 0; i < 10; i++) {
    const prev = cleaned
    cleaned = cleaned.replace(/\s+$/, '')              // 去尾空格
    cleaned = cleaned.replace(new RegExp(labelChars.source + '$'), '') // 去尾标签字
    cleaned = cleaned.replace(/\s+$/, '')
    if (cleaned === prev) break
  }
  return cleaned.trim()
}

// ============================================================
// 主解析入口
// ============================================================

export async function parsePdf(buffer: Buffer): Promise<ParsedInvoice> {
  console.log('[parsePdf] ====== 坐标定位解析开始 ======')

  // Step 1: 提取文字块
  const pdfExtract = new PDFExtract()
  let extractResult
  try {
    extractResult = await pdfExtract.extractBuffer(buffer)
  } catch (err) {
    console.warn('[parsePdf] pdf.js-extract 提取失败，降级到文本正则:', err)
    return parsePdfText(buffer)
  }

  // Step 2: 收集文字块
  const allBlocks: TextBlock[] = []
  let maxWidth = 0
  let maxHeight = 0

  for (const page of extractResult.pages) {
    const pw = page.width || 595
    const ph = page.height || 842
    if (pw > maxWidth) maxWidth = pw
    if (ph > maxHeight) maxHeight = ph

    for (const item of (page.content || []) as PDFExtractText[]) {
      if (item.str && item.str.trim()) {
        allBlocks.push({
          x: item.x,
          y: item.y,
          width: item.width || 0,
          height: item.height || 12,
          str: item.str.trim(),
        })
      }
    }
  }

  console.log(`[parsePdf] 提取文字块数量: ${allBlocks.length}, 页面尺寸: ${maxWidth}x${maxHeight}`)

  // Step 3: 文字过少 → OCR
  if (!hasSufficientText(allBlocks)) {
    console.warn('[parsePdf] 提取文字过少（可能是扫描件），降级到 OCR')
    try {
      return await parsePdfOcr(buffer)
    } catch (ocrErr) {
      console.warn('[parsePdf] OCR 也失败，回退到文本正则:', ocrErr)
      return parsePdfText(buffer)
    }
  }

  // Step 4: 坐标归一化 + 区域匹配
  const normalizedBlocks = normalizeBlocks(allBlocks, maxWidth, maxHeight)
  const layout = detectLayout(normalizedBlocks)
  console.log(`[parsePdf] 检测到发票布局类型: ${layout}`)

  const regions = getRegions(layout)
  const regionTexts = assignBlocksToRegions(normalizedBlocks, regions)

  // 打印各区域文字
  for (const rt of regionTexts) {
    const text = regionToText(rt)
    console.log(`[parsePdf] 区域 "${rt.region.name}":`)
    console.log(text.substring(0, 300))
    console.log('---')
  }

  // Step 5: 从各区域提取字段
  const getRegion = (name: string) => regionTexts.find(rt => rt.region.name === name)!
  const result = extractFromRegions(getRegion)

  // Step 6: 结果严重缺失 → 回退文本正则
  if (isResultDegraded(result)) {
    console.warn('[parsePdf] 坐标解析结果严重缺失，回退到文本正则')
    return parsePdfText(buffer)
  }

  console.log('[parsePdf] ====== 坐标解析结果 ======')
  console.log(JSON.stringify(result, null, 2))
  return result
}

// ============================================================
// 区域文本 → 字段提取
// ============================================================

function extractFromRegions(getRegion: (name: string) => RegionText): ParsedInvoice {
  const headerText = regionToText(getRegion('header'))
  const buyerText = regionToText(getRegion('buyer'))
  const sellerText = regionToText(getRegion('seller'))
  const detailText = regionToText(getRegion('detail'))
  const totalText = regionToText(getRegion('total'))
  const allText = [headerText, buyerText, sellerText, detailText, totalText].join('\n')

  // ---- 发票号码 ----
  // 策略1: "发票号码：" 后跟数字
  let invoiceNumber = lineMatch(headerText, [
    /发票号码[：:\s]*(\d{6,20})/,
    /号码[：:\s]*(\d{8,20})/,
  ])

  // 策略2: 标签和数字可能不在同一个文字块（PDF 坐标排列），扫描同行
  if (!invoiceNumber) {
    for (const line of headerText.split('\n')) {
      if (/发票号码|号码/.test(line)) {
        const nums = [...line.matchAll(/(\d{8,20})/g)].map(m => m[1])
        if (nums.length > 0) { invoiceNumber = nums[nums.length - 1]; break }
      }
    }
  }

  // 策略3: 全文查找 18-20 位发票号码（排除日期格式）
  if (!invoiceNumber) {
    const all = [...allText.matchAll(/(?<!\d)(\d{18,20})(?!\d)/g)].map(m => m[1])
    const filtered = all.filter(n => !/^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/.test(n))
    if (filtered.length > 0) invoiceNumber = filtered[0]
  }

  // ---- 发票代码 ----
  const invoiceCode = lineMatch(headerText, [
    /发票代码[：:\s]*(\d{6,12})/,
  ])

  // ---- 开票日期 ----
  let invoiceDate: string | undefined
  const datePatterns = [
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ]
  for (const pat of datePatterns) {
    const m = headerText.match(pat) || allText.match(pat)
    if (m?.[1] && m?.[2] && m?.[3]) {
      invoiceDate = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      break
    }
  }

  // ---- 发票类型 ----
  const invoiceType = lineMatch(allText, [
    /(全电发票[（(][^）)]+[）)])/,
    /(增值税电子[普专].*?发票)/,
    /(电子发票[（(].*?[）)])/,
    /(增值税[专普].*?发票)/,
    /([\u4e00-\u9fa5]{2,}电子[普专].*?发票)/,
  ])

  // ---- 购买方名称 ----
  let buyerName = lineMatch(buyerText, [
    /名\s*称[：:\s]+(.+?)(?:\s{2,}|\n|$)/,
  ])
  if (buyerName) buyerName = cleanCompanyName(buyerName)
  if (!buyerName) buyerName = extractCompanyFromText(buyerText)
  if (!buyerName) buyerName = extractCompanyFromText(headerText)

  // ---- 购买方税号 ----
  let buyerTaxId = lineMatch(buyerText, [
    /(?:统一社会信用代码|纳税人识别号)[\/\s]*(?:纳税人识别号)?[：:\s]*([A-Za-z0-9]{15,20})/,
  ])
  if (!buyerTaxId) {
    const ids = [...buyerText.matchAll(/([9][A-Za-z0-9]{17})/g)].map(m => m[1])
    if (ids.length > 0) buyerTaxId = ids[0]
  }

  // ---- 销售方名称 ----
  let sellerName = lineMatch(sellerText, [
    /名\s*称[：:\s]+(.+?)(?:\s{2,}|\n|$)/,
  ])
  if (sellerName) sellerName = cleanCompanyName(sellerName)
  if (!sellerName) sellerName = extractCompanyFromText(sellerText)
  // 回退: buyer 区域可能包含销方信息（左右并排），找第二个 "名称："
  if (!sellerName) {
    const nameMatches = [...buyerText.matchAll(/名\s*称[：:\s]+(.+?)(?:\s{2,}|\n|$)/g)]
      .map(m => cleanCompanyName(m[1].trim()))
      .filter(v => v.length > 1)
    if (nameMatches.length >= 2) sellerName = nameMatches[1]
  }

  // ---- 销售方税号 ----
  let sellerTaxId = lineMatch(sellerText, [
    /(?:统一社会信用代码|纳税人识别号)[\/\s]*(?:纳税人识别号)?[：:\s]*([A-Za-z0-9]{15,20})/,
  ])
  if (!sellerTaxId) {
    const ids = [...sellerText.matchAll(/([9][A-Za-z0-9]{17})/g)].map(m => m[1])
    if (ids.length > 0) sellerTaxId = ids[0]
  }
  // 回退: 从 buyer 区域找第二个税号
  if (!sellerTaxId) {
    const allIds = [...buyerText.matchAll(/([A-Za-z0-9]{15,20})/g)].map(m => m[1])
    if (allIds.length >= 2) sellerTaxId = allIds[1]
  }

  // ---- 发票内容（项目名称）----
  // 匹配 *类别*项目 的格式，如 "*餐饮服务*餐费"、"*现代服务*技术服务费"
  const contentItems: string[] = []
  const starPattern = /\*(.+?)\*/g
  let contentMatch: RegExpExecArray | null
  while ((contentMatch = starPattern.exec(detailText)) !== null) {
    const category = contentMatch[1].trim()
    if (category.length > 1 && !/^[\d.]+$/.test(category)) {
      contentItems.push(category)
    }
  }
  const invoiceContent = contentItems.length > 0
    ? [...new Set(contentItems)].join(', ')
    : undefined

  // ---- 金额 ----
  // 价税合计（含税总价）
  let totalAmount = parseNum(lineMatch(totalText, [
    /价税合计[（(]小写[）)][：:\s]*[¥￥]?\s*([\d,.]+)/,
    /价税合计[：:\s]*[¥￥]?\s*([\d,.]+)/,
    /[（(]小写[）)][：:\s]*[¥￥]?\s*([\d,.]+)/,
  ]))
  if (totalAmount == null) {
    const amounts = findAmounts(totalText)
    if (amounts.length > 0) totalAmount = Math.max(...amounts)
  }

  // 合计金额（不含税）+ 合计税额
  let amount = parseNum(lineMatch(detailText, [
    /合计金额[：:\s]*[¥￥]?\s*([\d,.]+)/,
    /金\s*额合计[：:\s]*[¥￥]?\s*([\d,.]+)/,
  ]))
  let taxAmount = parseNum(lineMatch(detailText, [
    /合计税额[：:\s]*[¥￥]?\s*([\d,.]+)/,
    /税\s*额合计[：:\s]*[¥￥]?\s*([\d,.]+)/,
  ]))

  // 回退: 从 total + detail 区域提取金额
  if (totalAmount == null || amount == null) {
    const combinedText = detailText + '\n' + totalText
    const allAmounts = findAmounts(combinedText).sort((a, b) => b - a)

    if (totalAmount == null && allAmounts.length > 0) totalAmount = allAmounts[0]
    if (amount == null && allAmounts.length >= 2) {
      amount = allAmounts[allAmounts.length > 2 ? allAmounts.length - 2 : 1]
    }
    if (taxAmount == null && allAmounts.length >= 2) {
      taxAmount = allAmounts[allAmounts.length - 1]
    }
  }

  return {
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
    totalAmount,
    invoiceContent,
  }
}
