/**
 * PDF OCR 解析器 — 扫描件/图片 PDF 兜底方案
 *
 * 使用 tesseract.js 进行本地离线 OCR，复用区域模板的坐标匹配逻辑。
 * PDF 转图片通过 Electron BrowserWindow 渲染实现（无需 native canvas 依赖）。
 */

import { BrowserWindow } from 'electron'
import Tesseract from 'tesseract.js'
import type { ParsedInvoice, TextBlock } from './types'
import { parseNum, normalizeDate } from './utils'
import {
  detectLayout,
  getRegions,
  assignBlocksToRegions,
  regionToText,
} from './region-extractor'
import type { RegionText } from './types'

/**
 * 将 PDF 渲染为图片（通过 Electron BrowserWindow）
 * 返回 PNG 格式的 Buffer
 */
async function pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  // 将 PDF 转为 base64 data URL
  const base64 = pdfBuffer.toString('base64')
  const dataUrl = `data:application/pdf;base64,${base64}`

  const win = new BrowserWindow({
    width: 800,
    height: 1200,
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  try {
    // 加载 PDF（Electron 内置 PDF 查看器会自动渲染）
    await win.loadURL(dataUrl)
    // 等待 PDF 渲染完成
    await new Promise(resolve => setTimeout(resolve, 2000))

    const image = await win.webContents.capturePage()
    const pngBuffer = image.toPNG()
    return Buffer.from(pngBuffer)
  } finally {
    win.destroy()
  }
}

/**
 * 使用 tesseract.js 对图片进行 OCR
 * 返回带坐标的文字块列表（坐标已归一化为百分比）
 */
async function ocrImage(imageBuffer: Buffer): Promise<TextBlock[]> {
  console.log('[pdf-ocr] 开始 OCR 识别...')

  const result = await Tesseract.recognize(imageBuffer, 'chi_sim+eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        console.log(`[pdf-ocr] OCR 进度: ${Math.round((m.progress || 0) * 100)}%`)
      }
    }
  })

  const page = result.data
  const blocks: TextBlock[] = []

  // 从所有 bbox 中计算页面尺寸
  let maxX = 0
  let maxY = 0
  if (page.blocks) {
    for (const block of page.blocks) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          for (const word of line.words || []) {
            if (word.bbox.x1 > maxX) maxX = word.bbox.x1
            if (word.bbox.y1 > maxY) maxY = word.bbox.y1
          }
        }
      }
    }
  }

  if (maxX === 0 || maxY === 0) {
    console.warn('[pdf-ocr] 未识别到有效的文字块')
    return []
  }

  // 构建归一化的文字块列表
  if (page.blocks) {
    for (const block of page.blocks) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          for (const word of line.words || []) {
            if (word.text && word.text.trim()) {
              blocks.push({
                x: (word.bbox.x0 / maxX) * 100,
                y: (word.bbox.y0 / maxY) * 100,
                width: ((word.bbox.x1 - word.bbox.x0) / maxX) * 100,
                height: ((word.bbox.y1 - word.bbox.y0) / maxY) * 100,
                str: word.text.trim(),
              })
            }
          }
        }
      }
    }
  }

  console.log(`[pdf-ocr] OCR 完成，提取文字块: ${blocks.length}`)
  return blocks
}

/**
 * OCR 解析主入口
 *
 * 流程:
 * 1. PDF → 图片（Electron BrowserWindow 渲染）
 * 2. 图片 → OCR 文字块（tesseract.js）
 * 3. 文字块 → 区域匹配 → 字段提取
 */
export async function parsePdfOcr(pdfBuffer: Buffer): Promise<ParsedInvoice> {
  console.log('[parsePdfOcr] ====== OCR 解析开始 ======')

  // Step 1: PDF 转图片
  const imageBuffer = await pdfToImage(pdfBuffer)

  // Step 2: OCR 识别
  const blocks = await ocrImage(imageBuffer)

  if (blocks.length === 0) {
    console.warn('[parsePdfOcr] OCR 未识别到文字')
    return {}
  }

  // Step 3: 坐标已经是归一化的百分比（OCR 返回的坐标已处理）
  const layout = detectLayout(blocks)
  console.log(`[parsePdfOcr] 检测到发票布局类型: ${layout}`)

  const regions = getRegions(layout)
  const regionTexts = assignBlocksToRegions(blocks, regions)

  // 打印各区域文字（调试用）
  for (const rt of regionTexts) {
    const text = rt.blocks.map(b => b.str).join(' | ')
    console.log(`[parsePdfOcr] 区域 "${rt.region.name}": ${text.substring(0, 200)}`)
  }

  // Step 4: 提取字段（复用坐标定位逻辑）
  const getRegion = (name: string): RegionText =>
    regionTexts.find(rt => rt.region.name === name)!

  return extractFromRegionsOcr(getRegion)
}

/** OCR 模式的字段提取（宽松匹配，OCR 文字可能有误差） */
function extractFromRegionsOcr(getRegion: (name: string) => RegionText): ParsedInvoice {
  const header = getRegion('header')
  const buyer = getRegion('buyer')
  const seller = getRegion('seller')
  const detail = getRegion('detail')
  const total = getRegion('total')

  // OCR 文字块可能被拆得更碎，用全文拼接后正则匹配
  const headerText = header.blocks.map(b => b.str).join(' ')
  const buyerText = buyer.blocks.map(b => b.str).join(' ')
  const sellerText = seller.blocks.map(b => b.str).join(' ')
  const totalText = total.blocks.map(b => b.str).join(' ')

  // ---- 发票号码 ----
  const invoiceNumber = headerText.match(/发票号码[：:\s]*(\d{6,20})/)?.[1]
    ?? headerText.match(/号码[：:\s]*(\d{8,20})/)?.[1]
    ?? headerText.match(/(?<!\d)(\d{8,20})(?!\d)/)?.[1]

  // ---- 发票代码 ----
  const invoiceCode = headerText.match(/发票代码[：:\s]*(\d{6,12})/)?.[1]

  // ---- 开票日期 ----
  const invoiceDate = normalizeDate(
    headerText.match(/开票日期[：:\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)?.[0]
      || headerText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)?.[0]
      || headerText.match(/(\d{4}-\d{2}-\d{2})/)?.[1]
  )

  // ---- 发票类型 ----
  const invoiceType = headerText.match(/(全电发票[（(][^）)]+[）)])/)?.[1]
    || headerText.match(/(增值税[专普].*?发票)/)?.[1]
    || headerText.match(/([\u4e00-\u9fa5]{2,}电子[普专].*?发票)/)?.[1]
    || headerText.match(/(电子发票[（(].*?[）)])/)?.[1]

  // ---- 购买方 ----
  const buyerName = buyerText.match(/名\s*称[：:]\s*(.+?)(?:\s{2,}|$)/)?.[1]?.trim()
    || (() => {
      const rt: RegionText = buyer
      const lines = regionToText(rt).split('\n')
      for (const line of lines) {
        if (/名\s*称/.test(line)) {
          const m = line.match(/名\s*称[：:\s]+(.+)/)
          if (m?.[1]?.trim()) return m[1].trim()
        }
      }
      return undefined
    })()

  const buyerTaxId = buyerText.match(/(?:统一社会信用代码|纳税人识别号)[：:\s]*([A-Za-z0-9]{15,20})/)?.[1]
    ?? buyerText.match(/([9][A-Za-z0-9]{17})/)?.[1]

  // ---- 销售方 ----
  const sellerName = sellerText.match(/名\s*称[：:]\s*(.+?)(?:\s{2,}|$)/)?.[1]?.trim()
    || (() => {
      const rt: RegionText = seller
      const lines = regionToText(rt).split('\n')
      for (const line of lines) {
        if (/名\s*称/.test(line)) {
          const m = line.match(/名\s*称[：:\s]+(.+)/)
          if (m?.[1]?.trim()) return m[1].trim()
        }
      }
      return undefined
    })()

  const sellerTaxId = sellerText.match(/(?:统一社会信用代码|纳税人识别号)[：:\s]*([A-Za-z0-9]{15,20})/)?.[1]
    ?? sellerText.match(/([9][A-Za-z0-9]{17})/)?.[1]

  // ---- 金额 ----
  const totalAmount = parseNum(
    totalText.match(/价税合计[：:\s]*[¥￥]?\s*([\d,.]+)/)?.[1]
    || totalText.match(/[（(]小写[）)][：:\s]*[¥￥]?\s*([\d,.]+)/)?.[1]
  )

  const allAmounts = (totalText + ' ' + header.blocks.map(b => b.str).join(' '))
    .match(/[\d,]+\.\d{2}/g)?.map(s => parseNum(s)).filter((v): v is number => v != null && v > 1) ?? []

  // ---- 发票内容（项目名称）----
  const detailText = detail.blocks.map(b => b.str).join(' ')
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

  const amount = parseNum(totalText.match(/合计金额[：:\s]*[¥￥]?\s*([\d,.]+)/)?.[1])
    ?? allAmounts[allAmounts.length > 1 ? allAmounts.length - 2 : 0]

  const taxAmount = parseNum(totalText.match(/(?:合计)?税额[：:\s]*[¥￥]?\s*([\d,.]+)/)?.[1])
    ?? allAmounts[allAmounts.length > 1 ? allAmounts.length - 1 : undefined as unknown as number]

  const result: ParsedInvoice = {
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

  console.log('[parsePdfOcr] ====== OCR 解析结果 ======')
  console.log(JSON.stringify(result, null, 2))

  return result
}
