/**
 * 区域模板 + 坐标匹配引擎
 *
 * 将 PDF 文字块按坐标归入预定义的发票区域模板，
 * 再在区域内做标签邻近查找提取字段值。
 */

import type { TextBlock, InvoiceRegion, RegionText } from './types'

// ============================================================
// 发票区域模板（百分比坐标，基于实际内容范围）
// ============================================================

/** 传统增值税发票（纸质票/电子票）布局 — 购方在左上，销方在左下 */
const VAT_INVOICE_REGIONS: InvoiceRegion[] = [
  { name: 'header',  xMin: 0,  xMax: 100, yMin: 0,  yMax: 15 },
  { name: 'buyer',   xMin: 0,  xMax: 50,  yMin: 10, yMax: 35 },
  { name: 'seller',  xMin: 0,  xMax: 50,  yMin: 70, yMax: 95 },
  { name: 'detail',  xMin: 0,  xMax: 100, yMin: 35, yMax: 65 },
  { name: 'total',   xMin: 0,  xMax: 100, yMin: 65, yMax: 80 },
]

/** 全电发票（数电票）布局 — 购方销方左右并排 */
const ELECTRONIC_INVOICE_REGIONS: InvoiceRegion[] = [
  { name: 'header',  xMin: 0,  xMax: 100, yMin: 0,  yMax: 12 },
  { name: 'buyer',   xMin: 0,  xMax: 50,  yMin: 10, yMax: 35 },
  { name: 'seller',  xMin: 50, xMax: 100, yMin: 10, yMax: 35 },
  { name: 'detail',  xMin: 0,  xMax: 100, yMin: 35, yMax: 60 },
  { name: 'total',   xMin: 0,  xMax: 100, yMin: 60, yMax: 78 },
]

/** 通用票据布局（宽松边界） */
const GENERIC_REGIONS: InvoiceRegion[] = [
  { name: 'header',  xMin: 0,  xMax: 100, yMin: 0,  yMax: 18 },
  { name: 'buyer',   xMin: 0,  xMax: 55,  yMin: 12, yMax: 40 },
  { name: 'seller',  xMin: 0,  xMax: 55,  yMin: 68, yMax: 95 },
  { name: 'detail',  xMin: 0,  xMax: 100, yMin: 38, yMax: 65 },
  { name: 'total',   xMin: 0,  xMax: 100, yMin: 65, yMax: 82 },
]

// ============================================================
// 区域模板选择
// ============================================================

export type InvoiceLayout = 'vat' | 'electronic' | 'generic'

/** 根据文字块内容自动检测发票类型 */
export function detectLayout(blocks: TextBlock[]): InvoiceLayout {
  const fullText = blocks.map(b => b.str).join(' ')
  if (/全电发票|数电票|电子发票[（(]|[\u4e00-\u9fa5]{2,}电子[普专].*?发票/.test(fullText)) return 'electronic'
  if (/增值税[专普].*?发票/.test(fullText)) return 'vat'
  return 'generic'
}

/** 获取区域模板 */
export function getRegions(layout: InvoiceLayout): InvoiceRegion[] {
  switch (layout) {
    case 'vat': return VAT_INVOICE_REGIONS
    case 'electronic': return ELECTRONIC_INVOICE_REGIONS
    case 'generic': return GENERIC_REGIONS
  }
}

// ============================================================
// 坐标归一化 + 区域匹配
// ============================================================

/**
 * 将文字块坐标归一化为 0~100 百分比
 * 使用实际内容的边界范围归一化，而非页面尺寸。
 */
export function normalizeBlocks(blocks: TextBlock[], _pageWidth: number, _pageHeight: number): TextBlock[] {
  if (blocks.length === 0) return blocks

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const b of blocks) {
    if (b.x < minX) minX = b.x
    if (b.x + b.width > maxX) maxX = b.x + b.width
    if (b.y < minY) minY = b.y
    if (b.y + b.height > maxY) maxY = b.y + b.height
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1

  return blocks.map(b => ({
    ...b,
    x: ((b.x - minX) / rangeX) * 100,
    y: ((b.y - minY) / rangeY) * 100,
    width: (b.width / rangeX) * 100,
    height: (b.height / rangeY) * 100,
  }))
}

/** 将文字块按坐标归入区域（区域边界留 5% 缓冲） */
export function assignBlocksToRegions(blocks: TextBlock[], regions: InvoiceRegion[]): RegionText[] {
  const BUFFER = 5
  return regions.map(region => {
    const matched = blocks.filter(b => {
      const bx = b.x + b.width / 2
      const by = b.y + b.height / 2
      return bx >= (region.xMin - BUFFER) &&
             bx <= (region.xMax + BUFFER) &&
             by >= (region.yMin - BUFFER) &&
             by <= (region.yMax + BUFFER)
    })
    matched.sort((a, b) => a.y - b.y || a.x - b.x)
    return { region, blocks: matched }
  })
}

// ============================================================
// 文字块 → 文本转换（按行拼接）
// ============================================================

/**
 * 将区域内的文字块按行合并为文本
 *
 * 将 y 坐标相近的文字块视为同一行，每行内按 x 排序，
 * 行与行之间用换行符连接。这样可以让正则表达式按行匹配。
 */
export function regionToText(regionText: RegionText): string {
  const { blocks } = regionText
  if (blocks.length === 0) return ''

  const ROW_THRESHOLD = 3 // y 差值 < 3% 视为同一行
  const rows: TextBlock[][] = []
  let currentRow: TextBlock[] = [blocks[0]]

  for (let i = 1; i < blocks.length; i++) {
    if (Math.abs(blocks[i].y - currentRow[0].y) < ROW_THRESHOLD) {
      currentRow.push(blocks[i])
    } else {
      // 行内按 x 排序
      currentRow.sort((a, b) => a.x - b.x)
      rows.push(currentRow)
      currentRow = [blocks[i]]
    }
  }
  currentRow.sort((a, b) => a.x - b.x)
  rows.push(currentRow)

  return rows.map(row => row.map(b => b.str).join(' ')).join('\n')
}
