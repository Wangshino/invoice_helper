/**
 * XML 解析器 — 全电发票 XML 格式
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

import { XMLParser } from 'fast-xml-parser'
import type { ParsedInvoice } from './types'
import { normalizeDate, parseNum } from './utils'

export async function parseXml(buffer: Buffer): Promise<ParsedInvoice> {
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

  // 提取项目名称（发票内容）
  const buildInvoiceContent = (): string | undefined => {
    const itemData = data.IssuItemInformation
    if (!itemData) return undefined
    const itemArray = Array.isArray(itemData) ? itemData : [itemData]
    const names: string[] = []
    for (const item of itemArray) {
      const name = (item as Record<string, unknown>)?.ItemName
      if (typeof name === 'string' && name.trim()) {
        const starMatch = name.trim().match(/^\*(.+?)\*/)
        if (starMatch) {
          names.push(starMatch[1])
        } else {
          names.push(name.trim())
        }
      }
    }
    return names.length > 0 ? [...new Set(names)].join(', ') : undefined
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
    totalAmount: parseNum(get(basic, 'TotalTax-includedAmount') || get(tax, 'AmountIncludingTax', 'TotalIncludingTax', 'Jshj')),
    invoiceContent: buildInvoiceContent(),
  }
}
