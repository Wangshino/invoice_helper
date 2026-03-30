/**
 * 共享类型定义 — 主进程与渲染进程共用
 *
 * 命名规则:
 * - 数据库行类型: `XxxRow` (直接映射数据库列, snake_case)
 * - 业务实体类型: `Xxx` (camelCase, 渲染进程使用)
 * - 创建参数类型: `CreateXxxParams`
 * - 更新参数类型: `UpdateXxxParams`
 * - 筛选条件类型: `XxxFilters`
 */

// ============================================================
// 通用
// ============================================================

/** IPC 调用的统一返回结构 */
export interface IpcResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** 分页参数 */
export interface PaginationParams {
  page: number
  pageSize: number
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ============================================================
// 邮箱账户
// ============================================================

export type EmailProvider = 'custom' | 'qq' | '163' | '126' | 'gmail' | 'outlook' | 'sina'

/** 邮箱账户 — 数据库行 (snake_case) */
export interface EmailAccountRow {
  id: number
  name: string
  email: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  password: string
  mail_folder: string
  sync_limit: number
  last_sync_uid: number | null
  created_at: string
}

/** 邮箱账户 — 渲染进程实体 (camelCase, 不含密码) */
export interface EmailAccount {
  id: number
  name: string
  email: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  mailFolder: string
  syncLimit: number
  lastSyncUid: number | null
  createdAt: string
}

/** 创建邮箱账户参数 */
export interface CreateEmailAccountParams {
  name: string
  email: string
  imapHost: string
  imapPort?: number
  smtpHost: string
  smtpPort?: number
  password: string
  mailFolder?: string
  syncLimit?: number
}

/** 更新邮箱账户参数 */
export interface UpdateEmailAccountParams {
  name?: string
  imapHost?: string
  imapPort?: number
  smtpHost?: string
  smtpPort?: number
  password?: string
  mailFolder?: string
  syncLimit?: number
}

/** 邮箱预设配置 */
export interface EmailProviderPreset {
  name: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
}

// ============================================================
// 发票
// ============================================================

export type InvoiceFileType = 'pdf' | 'ofd' | 'xml'
export type InvoiceSource = 'email' | 'manual'
export type InvoiceStatus = 'reimbursed' | 'unreimbursed'

/** 发票 — 数据库行 (snake_case) */
export interface InvoiceRow {
  id: number
  invoice_number: string | null
  invoice_code: string | null
  invoice_date: string | null
  invoice_type: string | null
  seller_name: string | null
  seller_tax_id: string | null
  buyer_name: string | null
  buyer_tax_id: string | null
  amount: number | null
  tax_amount: number | null
  total_amount: number | null
  invoice_content: string | null
  file_path: string
  file_type: InvoiceFileType
  file_name: string | null
  source: InvoiceSource
  email_account_id: number | null
  email_subject: string | null
  status: InvoiceStatus
  reimbursement_id: number | null
  created_at: string
  category: string | null
}

/** 发票 — 渲染进程实体 (camelCase) */
export interface Invoice {
  id: number
  invoiceNumber: string | null
  invoiceCode: string | null
  invoiceDate: string | null
  invoiceType: string | null
  sellerName: string | null
  sellerTaxId: string | null
  buyerName: string | null
  buyerTaxId: string | null
  amount: number | null
  taxAmount: number | null
  totalAmount: number | null
  invoiceContent: string | null
  filePath: string
  fileType: InvoiceFileType
  fileName: string | null
  source: InvoiceSource
  emailAccountId: number | null
  emailSubject: string | null
  status: InvoiceStatus
  reimbursementId: number | null
  createdAt: string
  category: string | null
}

/** 创建发票参数 */
export interface CreateInvoiceParams {
  invoiceNumber?: string
  invoiceCode?: string
  invoiceDate?: string
  invoiceType?: string
  sellerName?: string
  sellerTaxId?: string
  buyerName?: string
  buyerTaxId?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
  invoiceContent?: string
  filePath: string
  fileType: InvoiceFileType
  fileName?: string
  source?: InvoiceSource
  emailAccountId?: number
  emailSubject?: string
  category?: string
}

/** 发票筛选条件 */
export interface InvoiceFilters {
  status?: InvoiceStatus | 'all'
  dateFrom?: string
  dateTo?: string
  source?: InvoiceSource
  keyword?: string
  category?: string
  amountFrom?: number
  amountTo?: number
  buyerName?: string
}

/** 更新发票参数 */
export interface UpdateInvoiceParams {
  invoiceNumber?: string
  invoiceCode?: string
  invoiceDate?: string
  invoiceType?: string
  sellerName?: string
  sellerTaxId?: string
  buyerName?: string
  buyerTaxId?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
  invoiceContent?: string
  category?: string
}

// ============================================================
// 报销单
// ============================================================

export type ReimbursementStatus = 'draft' | 'sent' | 'approved' | 'rejected'

/** 报销单 — 数据库行 (snake_case) */
export interface ReimbursementRow {
  id: number
  title: string
  reason: string
  target_amount: number
  actual_amount: number | null
  date: string
  status: ReimbursementStatus
  email_to: string | null
  email_sent_at: string | null
  created_at: string
  updated_at: string
}

/** 报销单 — 渲染进程实体 (camelCase, 含关联发票) */
export interface Reimbursement {
  id: number
  title: string
  reason: string
  targetAmount: number
  actualAmount: number | null
  date: string
  status: ReimbursementStatus
  emailTo: string | null
  emailSentAt: string | null
  createdAt: string
  updatedAt: string
  invoices?: Invoice[]
}

/** 创建报销单参数 */
export interface CreateReimbursementParams {
  title: string
  reason: string
  targetAmount: number
  actualAmount?: number
  date: string
  status?: ReimbursementStatus
  invoiceIds?: number[]
}

/** 更新报销单参数 */
export interface UpdateReimbursementParams {
  title?: string
  reason?: string
  targetAmount?: number
  actualAmount?: number
  date?: string
  status?: ReimbursementStatus
  emailTo?: string
  emailSentAt?: string
  invoiceIds?: number[]
}

/** 报销单筛选条件 */
export interface ReimbursementFilters {
  status?: ReimbursementStatus | 'all'
  dateFrom?: string
  dateTo?: string
}

// ============================================================
// 匹配结果
// ============================================================

export interface MatchingResult {
  totalAmount: number
  invoices: Invoice[]
  invoiceCount: number
  difference: number
  isExact: boolean
}

// ============================================================
// 导入结果
// ============================================================

export interface ImportSummary {
  invoices: Invoice[]
  skipped: { fileName: string; invoiceNumber: string }[]
  failed: { fileName: string; error: string }[]
}

// ============================================================
// 邮件同步结果
// ============================================================

export interface EmailSyncResult {
  imported: Invoice[]
  skipped: Array<{ fileName: string; invoiceNumber?: string; reason: string }>
  failed: Array<{ fileName: string; error: string }>
  totalScanned: number
  lastSyncUid: number
}

// ============================================================
// 同步日志
// ============================================================

/** 同步日志 — 数据库行 (snake_case) */
export interface SyncLogRow {
  id: number
  email_account_id: number
  scanned: number
  imported: number
  skipped: number
  failed: number
  full_log: string | null
  synced_at: string
}

/** 同步日志 — 渲染进程实体 (camelCase) */
export interface SyncLog {
  id: number
  emailAccountId: number
  scanned: number
  imported: number
  skipped: number
  failed: number
  fullLog: string | null
  syncedAt: string
}

// ============================================================
// 解析预览 (不入库)
// ============================================================

export interface ParsePreview {
  parsed: ParsedInvoice
  fileType: InvoiceFileType
  fileName: string
}

/** 发票解析中间结果 */
export interface ParsedInvoice {
  invoiceNumber?: string
  invoiceCode?: string
  invoiceDate?: string
  invoiceType?: string
  sellerName?: string
  sellerTaxId?: string
  buyerName?: string
  buyerTaxId?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
  invoiceContent?: string
}

// ============================================================
// 邮件模板
// ============================================================

export interface EmailTemplateData {
  subjectTemplate: string
  bodyTemplate: string
}

export const DEFAULT_EMAIL_TEMPLATE: EmailTemplateData = {
  subjectTemplate: '报销单: {{title}} ({{invoiceCount}} 张发票)',
  bodyTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 0 auto;">
  <h2 style="color: #1890ff; border-bottom: 2px solid #1890ff; padding-bottom: 8px;">
    报销单: {{title}}
  </h2>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;">
    <tr><td style="padding:8px;font-weight:bold;width:120px;">报销事由</td><td style="padding:8px;">{{reason}}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">报销日期</td><td style="padding:8px;">{{date}}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">目标金额</td><td style="padding:8px;">{{targetAmount}}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">实际金额</td><td style="padding:8px;color:#52c41a;font-weight:bold;">{{actualAmount}}</td></tr>
    <tr><td style="padding:8px;font-weight:bold;">发票数量</td><td style="padding:8px;">{{invoiceCount}} 张</td></tr>
  </table>
  <h3 style="color:#333;">发票明细</h3>
  {{invoiceTable}}
  <p style="color:#999;margin-top:24px;font-size:12px;">此邮件由发票管理助手自动发送</p>
</div>`
}

// ============================================================
// 发送历史
// ============================================================

export interface SentEmailRow {
  id: number
  reimbursement_id: number
  email_to: string
  subject: string
  body_html: string
  attachment_count: number
  sent_at: string
}

export interface SentEmail {
  id: number
  reimbursementId: number
  emailTo: string
  subject: string
  bodyHtml: string
  attachmentCount: number
  sentAt: string
}

// ============================================================
// 操作日志
// ============================================================

/** 操作日志 — 数据库行 (snake_case) */
export interface OperationLogRow {
  id: number
  action: string
  target_type: string | null
  target_id: number | null
  detail: string | null
  created_at: string
}

/** 操作日志 — 渲染进程实体 (camelCase) */
export interface OperationLog {
  id: number
  action: string
  targetType: string | null
  targetId: number | null
  detail: string | null
  createdAt: string
}

// ============================================================
// 字段映射工具
// ============================================================

/** snake_case → camelCase 字段映射表 */
const INVOICE_FIELD_MAP: Record<string, string> = {
  invoice_number: 'invoiceNumber',
  invoice_code: 'invoiceCode',
  invoice_date: 'invoiceDate',
  invoice_type: 'invoiceType',
  seller_name: 'sellerName',
  seller_tax_id: 'sellerTaxId',
  buyer_name: 'buyerName',
  buyer_tax_id: 'buyerTaxId',
  tax_amount: 'taxAmount',
  total_amount: 'totalAmount',
  invoice_content: 'invoiceContent',
  file_path: 'filePath',
  file_type: 'fileType',
  file_name: 'fileName',
  email_account_id: 'emailAccountId',
  email_subject: 'emailSubject',
  reimbursement_id: 'reimbursementId',
  created_at: 'createdAt'
}

const EMAIL_ACCOUNT_FIELD_MAP: Record<string, string> = {
  imap_host: 'imapHost',
  imap_port: 'imapPort',
  smtp_host: 'smtpHost',
  smtp_port: 'smtpPort',
  mail_folder: 'mailFolder',
  sync_limit: 'syncLimit',
  last_sync_uid: 'lastSyncUid',
  created_at: 'createdAt'
}

const SYNC_LOG_FIELD_MAP: Record<string, string> = {
  email_account_id: 'emailAccountId',
  full_log: 'fullLog',
  synced_at: 'syncedAt'
}

const REIMBURSEMENT_FIELD_MAP: Record<string, string> = {
  target_amount: 'targetAmount',
  actual_amount: 'actualAmount',
  email_to: 'emailTo',
  email_sent_at: 'emailSentAt',
  created_at: 'createdAt',
  updated_at: 'updatedAt'
}

const SENT_EMAIL_FIELD_MAP: Record<string, string> = {
  reimbursement_id: 'reimbursementId',
  email_to: 'emailTo',
  body_html: 'bodyHtml',
  attachment_count: 'attachmentCount',
  sent_at: 'sentAt'
}

/** 通用: 将 snake_case 对象转换为 camelCase */
function toCamel<T>(row: Record<string, unknown>, fieldMap: Record<string, string>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[fieldMap[key] || key] = value
  }
  return result as T
}

/** 批量转换 */
function mapRows<T>(rows: Record<string, unknown>[], fieldMap: Record<string, string>): T[] {
  return rows.map((row) => toCamel<T>(row, fieldMap))
}

/** camelCase → snake_case 反向映射 */
function toSnakeCase(obj: Record<string, unknown>, fieldMap: Record<string, string>): Record<string, unknown> {
  const reverseMap = Object.fromEntries(Object.entries(fieldMap).map(([k, v]) => [v, k]))
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[reverseMap[key] || key] = value
  }
  return result
}

export const FieldMappers = {
  invoice: {
    toCamel: (row: Record<string, unknown>) => toCamel<Invoice>(row, INVOICE_FIELD_MAP),
    toList: (rows: Record<string, unknown>[]) => mapRows<Invoice>(rows, INVOICE_FIELD_MAP),
    toSnake: (obj: Record<string, unknown>) => toSnakeCase(obj, INVOICE_FIELD_MAP)
  },
  emailAccount: {
    toCamel: (row: Record<string, unknown>) => toCamel<EmailAccount>(row, EMAIL_ACCOUNT_FIELD_MAP),
    toList: (rows: Record<string, unknown>[]) => mapRows<EmailAccount>(rows, EMAIL_ACCOUNT_FIELD_MAP)
  },
  reimbursement: {
    toCamel: (row: Record<string, unknown>) => toCamel<Reimbursement>(row, REIMBURSEMENT_FIELD_MAP),
    toList: (rows: Record<string, unknown>[]) => mapRows<Reimbursement>(rows, REIMBURSEMENT_FIELD_MAP)
  },
  syncLog: {
    toCamel: (row: Record<string, unknown>) => toCamel<SyncLog>(row, SYNC_LOG_FIELD_MAP),
    toList: (rows: Record<string, unknown>[]) => mapRows<SyncLog>(rows, SYNC_LOG_FIELD_MAP)
  },
  sentEmail: {
    toCamel: (row: Record<string, unknown>) => toCamel<SentEmail>(row, SENT_EMAIL_FIELD_MAP),
    toList: (rows: Record<string, unknown>[]) => mapRows<SentEmail>(rows, SENT_EMAIL_FIELD_MAP)
  }
}
