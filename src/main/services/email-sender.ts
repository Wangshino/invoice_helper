/**
 * 邮件发送服务 — 使用 nodemailer 通过 SMTP 发送报销单邮件
 *
 * 支持:
 *   - 用户自定义邮件模板 (存储在 settings 表)
 *   - 附件超过 2 个时自动压缩为 ZIP
 *   - 发送成功后记录到 sent_emails 表
 */

import nodemailer from 'nodemailer'
import AdmZip from 'adm-zip'
import fs from 'fs'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import * as emailAccountRepo from '../repositories/email-account-repository'
import * as settingsRepo from '../repositories/settings-repository'
import * as sentEmailRepo from '../repositories/sent-email-repository'
import { renderTemplate, renderInvoiceTable } from '../../shared/template-renderer'
import type { InvoiceRow } from '../../shared/types'
import { DEFAULT_EMAIL_TEMPLATE } from '../../shared/types'
import type { EmailTemplateData } from '../../shared/types'
import { SETTINGS_KEYS } from '../repositories/settings-repository'

// ============================================================
// Transport 创建
// ============================================================

function createTransporter(accountId: number): nodemailer.Transporter {
  const account = emailAccountRepo.findById(accountId)
  if (!account) throw new Error('邮箱账户不存在')

  const password = emailAccountRepo.getDecryptedPassword(String(accountId))

  return nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth: {
      user: account.email,
      pass: password
    }
  })
}

function getDefaultAccount(): { email: string; id: number } | null {
  const accounts = emailAccountRepo.findAll()
  if (accounts.length === 0) return null

  // 优先使用 settings 中配置的默认发件账户
  const preferredId = settingsRepo.get(SETTINGS_KEYS.DEFAULT_SENDER_ACCOUNT_ID)
  if (preferredId) {
    const preferred = accounts.find((a) => String(a.id) === preferredId)
    if (preferred) return { email: preferred.email, id: preferred.id }
  }

  return { email: accounts[0].email, id: accounts[0].id }
}

// ============================================================
// 模板加载
// ============================================================

function loadTemplate(): EmailTemplateData {
  const raw = settingsRepo.get(SETTINGS_KEYS.REIMBURSEMENT_EMAIL_TEMPLATE)
  if (raw) {
    try {
      return JSON.parse(raw) as EmailTemplateData
    } catch {
      // 解析失败则用默认模板
    }
  }
  return DEFAULT_EMAIL_TEMPLATE
}

// ============================================================
// 附件处理
// ============================================================

interface AttachmentResult {
  attachments: nodemailer.SendMailOptions['attachments']
  cleanup?: () => void
}

function prepareAttachments(
  invoices: InvoiceRow[],
  title: string
): AttachmentResult {
  const validFiles: string[] = []
  for (const inv of invoices) {
    if (inv.file_path && fs.existsSync(inv.file_path)) {
      validFiles.push(inv.file_path)
    }
  }

  // ≤2 个附件: 原样附加
  if (validFiles.length <= 2) {
    return {
      attachments: validFiles.map((p) => {
        const inv = invoices.find((v) => v.file_path === p)
        return {
          filename: inv?.file_name || basename(p),
          path: p
        }
      })
    }
  }

  // >2 个附件: 压缩为 ZIP
  const zip = new AdmZip()
  for (const filePath of validFiles) {
    zip.addLocalFile(filePath)
  }
  const safeName = title.replace(/[\\/:*?"<>|]/g, '_')
  const zipPath = join(tmpdir(), `发票附件_${safeName}_${Date.now()}.zip`)
  zip.writeZip(zipPath)

  return {
    attachments: [{ filename: `发票附件_${safeName}.zip`, path: zipPath }],
    cleanup: () => {
      try {
        fs.unlinkSync(zipPath)
      } catch { /* ignore */ }
    }
  }
}

// ============================================================
// 渲染邮件
// ============================================================

function buildRenderedEmail(
  params: {
    title: string
    reason: string
    targetAmount: number
    actualAmount: number | null
    date: string
    invoices: InvoiceRow[]
  },
  customSubject?: string,
  customBody?: string
): { subject: string; html: string } {
  const template = loadTemplate()

  // 如果有自定义覆盖，创建临时模板
  const effectiveTemplate: EmailTemplateData = {
    subjectTemplate: customSubject ?? template.subjectTemplate,
    bodyTemplate: customBody ?? template.bodyTemplate
  }

  const invoiceItems = params.invoices.map((inv) => ({
    invoiceNumber: inv.invoice_number || '-',
    sellerName: inv.seller_name || '-',
    totalAmount: inv.total_amount != null ? `¥${inv.total_amount.toFixed(2)}` : '-',
    invoiceDate: inv.invoice_date || '-'
  }))

  return renderTemplate(effectiveTemplate, {
    title: params.title,
    reason: params.reason,
    targetAmount: `¥${params.targetAmount.toFixed(2)}`,
    actualAmount: params.actualAmount != null ? `¥${params.actualAmount.toFixed(2)}` : '-',
    date: params.date,
    invoiceCount: String(params.invoices.length),
    invoiceTable: renderInvoiceTable(invoiceItems)
  })
}

// ============================================================
// 导出: 预览 (不发送)
// ============================================================

export function previewReimbursementEmail(params: {
  title: string
  reason: string
  targetAmount: number
  actualAmount: number | null
  date: string
  invoices: InvoiceRow[]
  customSubject?: string
  customBody?: string
}): { subject: string; html: string } {
  return buildRenderedEmail(params, params.customSubject, params.customBody)
}

// ============================================================
// 导出: 发送报销单邮件
// ============================================================

export interface SendReimbursementEmailParams {
  reimbursementId: number
  emailTo: string
  title: string
  reason: string
  targetAmount: number
  actualAmount: number | null
  date: string
  invoices: InvoiceRow[]
  customSubject?: string
  customBody?: string
}

export async function sendReimbursementEmail(params: SendReimbursementEmailParams): Promise<void> {
  const { emailTo, invoices } = params

  const defaultAccount = getDefaultAccount()
  if (!defaultAccount) throw new Error('未配置邮箱账户，请先在「邮件设置」中添加账户')

  const transporter = createTransporter(defaultAccount.id)

  // 渲染邮件
  const { subject, html } = buildRenderedEmail(
    params,
    params.customSubject,
    params.customBody
  )

  // 准备附件
  const { attachments, cleanup } = prepareAttachments(invoices, params.title)

  try {
    await transporter.sendMail({
      from: `"发票管理助手" <${defaultAccount.email}>`,
      to: emailTo,
      subject,
      html,
      attachments
    })

    // 记录发送历史
    const validFileCount = invoices.filter(
      (inv) => inv.file_path && fs.existsSync(inv.file_path)
    ).length
    sentEmailRepo.create({
      reimbursementId: params.reimbursementId,
      emailTo,
      subject,
      bodyHtml: html,
      attachmentCount: validFileCount
    })
  } finally {
    transporter.close()
    cleanup?.()
  }
}
