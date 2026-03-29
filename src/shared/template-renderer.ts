/**
 * 模板渲染引擎 — 纯字符串替换，无 Node.js 依赖
 *
 * 主进程和渲染进程共用，用于渲染邮件模板。
 */

import type { EmailTemplateData } from './types'

export interface TemplateVariables {
  title: string
  reason: string
  targetAmount: string
  actualAmount: string
  date: string
  invoiceCount: string
  invoiceTable: string
}

export interface InvoiceItem {
  invoiceNumber: string
  sellerName: string
  totalAmount: string
  invoiceDate: string
}

/** 渲染发票明细表格 HTML */
export function renderInvoiceTable(invoices: InvoiceItem[]): string {
  if (invoices.length === 0) return '<p>无发票</p>'

  const rows = invoices
    .map(
      (inv) => `
      <tr>
        <td style="padding:8px;border:1px solid #e8e8e8;">${inv.invoiceNumber}</td>
        <td style="padding:8px;border:1px solid #e8e8e8;">${inv.sellerName}</td>
        <td style="padding:8px;border:1px solid #e8e8e8;text-align:right;">${inv.totalAmount}</td>
        <td style="padding:8px;border:1px solid #e8e8e8;">${inv.invoiceDate}</td>
      </tr>`
    )
    .join('')

  return `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#fafafa;">
        <th style="padding:8px;border:1px solid #e8e8e8;text-align:left;">发票号码</th>
        <th style="padding:8px;border:1px solid #e8e8e8;text-align:left;">销方名称</th>
        <th style="padding:8px;border:1px solid #e8e8e8;text-align:right;">金额</th>
        <th style="padding:8px;border:1px solid #e8e8e8;text-align:left;">日期</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

/** 渲染模板 — 替换 {{xxx}} 占位符 */
export function renderTemplate(
  template: EmailTemplateData,
  variables: TemplateVariables
): { subject: string; html: string } {
  const replace = (str: string): string =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      return (variables as unknown as Record<string, string>)[key] ?? `{{${key}}}`
    })

  return {
    subject: replace(template.subjectTemplate),
    html: replace(template.bodyTemplate)
  }
}
