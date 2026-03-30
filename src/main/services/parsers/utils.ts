/**
 * 发票解析管线 — 公共工具函数
 */

/** 将各种中文日期格式统一为 YYYY-MM-DD */
export function normalizeDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  // "2026年03月22日" 或 "2026年 3月22日"
  const cn = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (cn) return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`
  // ISO "2026-03-22" 或 "2026-03-22T..." → 取日期部分
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  return raw.trim() || undefined
}

/** 解析金额字符串，去除 ¥,逗号等干扰字符 */
export function parseNum(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = parseFloat(v.replace(/[,，¥￥\s]/g, ''))
  return isNaN(n) ? undefined : n
}
