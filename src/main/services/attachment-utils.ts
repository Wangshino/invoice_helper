/**
 * 附件识别工具 — 邮件附件过滤、magic bytes 检测、zip 解压、优先级排序
 */
import AdmZip from 'adm-zip'

// ============================================================
// 常量
// ============================================================

const INVOICE_EXTENSIONS = ['.pdf', '.ofd', '.xml', '.zip']

const INVOICE_SUBJECT_KEYWORDS = [
  '发票', 'invoice', '电子发票', '全电发票',
  '增值税', '票据', 'e-invoice', '税务',
  '开票', '税控', '凭证'
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BodyStructure = any

// ============================================================
// 类型
// ============================================================

export interface AttachmentInfo {
  partId: string
  filename: string
  size: number
  contentType: string
}

/** 从邮件 HTML 中提取到的下载链接 */
export interface DownloadLink {
  url: string
  format: string // 'pdf' | 'ofd' | 'xml'
  invoiceNumber?: string
}

// ============================================================
// 附件提取
// ============================================================

/** 从 bodyStructure 递归提取所有附件 */
export function findAttachments(bodyStructure: BodyStructure): AttachmentInfo[] {
  const results: AttachmentInfo[] = []

  function walk(node: BodyStructure): void {
    if (!node) return

    if (node.part) {
      const hasFilename = node.filename && node.filename.length > 0
      const isAttachment = node.disposition === 'attachment'
      // 也收集 text/plain (QQ Mail 将 PDF 等标记为 text/plain)
      const hasPotentialType = node.type && (
        node.type.toLowerCase().includes('pdf') ||
        node.type.toLowerCase().includes('xml') ||
        node.type.toLowerCase().includes('octet-stream') ||
        node.type.toLowerCase().includes('text/plain')
      )

      if (hasFilename || isAttachment || hasPotentialType) {
        const filename = node.filename || ''
        const ext = getExtension(filename)
        // 排除 inline 且非发票类型的内容
        const isInlineNonInvoice = node.disposition === 'inline' && ext && !INVOICE_EXTENSIONS.includes(ext)

        if (!isInlineNonInvoice) {
          results.push({
            partId: String(node.part),
            filename: filename || `attachment-${node.part}`,
            size: node.size || 0,
            contentType: node.type || ''
          })
        }
      }
    }

    if (node.childNodes?.length) {
      for (const child of node.childNodes) {
        walk(child)
      }
    }
  }

  walk(bodyStructure)
  return results
}

// ============================================================
// 候选判断
// ============================================================

/** 判断是否为发票候选 (同时检查文件名和 contentType) */
export function isInvoiceCandidate(filename: string, contentType?: string): boolean {
  const ext = getExtension(filename)
  if (INVOICE_EXTENSIONS.includes(ext)) return true

  const lower = filename.toLowerCase()
  if (lower.includes('发票') || lower.includes('invoice') || lower.includes('fp')) return true

  if (contentType) {
    const ct = contentType.toLowerCase()
    if (ct.includes('pdf') || ct.includes('ofd')) return true
    if (ct.includes('xml') && !ct.includes('html')) return true
    if (ct.includes('octet-stream')) return true
    // QQ Mail 将 PDF/图片等标记为 text/plain → 姑且当候选，后续用 magic bytes 过滤
    if (ct.includes('text/plain')) return true
  }

  return false
}

// ============================================================
// Magic bytes 检测
// ============================================================

/** 通过 magic bytes 检测 Buffer 的实际文件类型 */
export function detectBufferType(buffer: Buffer): 'pdf' | 'xml' | 'ofd' | 'zip' | 'image' | 'unknown' {
  if (buffer.length < 4) return 'unknown'

  // PDF: %PDF (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'pdf'
  }

  // ZIP/OFD: PK (50 4B)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
    return 'zip'
  }

  // XML: <?xml or <EInvoice or <Invoice
  const header = buffer.toString('utf8', 0, Math.min(200, buffer.length)).trimStart()
  if (header.startsWith('<?xml') || /^<EInvoice/i.test(header) || /^<Invoice/i.test(header) || /^<CompositeInvoice/i.test(header)) {
    return 'xml'
  }

  // Images — skip these
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image'
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image'

  return 'unknown'
}

/** 检测 Buffer 是否为可解析的发票文件 (排除图片等) */
export function isInvoiceBuffer(buffer: Buffer): boolean {
  const type = detectBufferType(buffer)
  return type === 'pdf' || type === 'xml' || type === 'zip' || type === 'ofd'
}

/** 通过 magic bytes 推断扩展名 */
export function inferExtensionFromBuffer(buffer: Buffer): string {
  const detected = detectBufferType(buffer)
  const map: Record<string, string> = { pdf: '.pdf', xml: '.xml', zip: '.zip', ofd: '.ofd' }
  return map[detected] || ''
}

// ============================================================
// 文件名解析
// ============================================================

/** 从 contentType 推断文件扩展名 */
export function inferExtensionFromContentType(contentType: string): string {
  if (!contentType) return ''
  const ct = contentType.toLowerCase()
  if (ct.includes('pdf')) return '.pdf'
  if (ct.includes('ofd')) return '.ofd'
  if (ct.includes('xml') && !ct.includes('html')) return '.xml'
  if (ct.includes('zip')) return '.zip'
  return ''
}

/**
 * 结合文件名、contentType 和 buffer 内容，生成最终的文件名
 * 用于 application/octet-stream 和 text/plain 等模糊类型
 * 返回空字符串表示应跳过此附件 (如图片)
 */
export function resolveFilenameWithBuffer(att: AttachmentInfo, buffer: Buffer): string {
  const ext = getExtension(att.filename)
  if (INVOICE_EXTENSIONS.includes(ext)) return att.filename

  // 先尝试 contentType
  const ctExt = inferExtensionFromContentType(att.contentType)
  if (ctExt) return att.filename + ctExt

  // contentType 也不明确 → 用 magic bytes
  const bufExt = inferExtensionFromBuffer(buffer)
  if (bufExt) return att.filename + bufExt

  // 都检测不出 → 跳过
  return ''
}

/** 为附件生成有效的文件名 (不需要 buffer 时使用) */
export function resolveFilename(att: AttachmentInfo): string {
  const ext = getExtension(att.filename)
  if (INVOICE_EXTENSIONS.includes(ext)) return att.filename

  const inferredExt = inferExtensionFromContentType(att.contentType)
  if (inferredExt) return att.filename + inferredExt

  return att.filename
}

// ============================================================
// 邮件主题
// ============================================================

/** 判断邮件主题是否含发票关键词 */
export function hasInvoiceKeyword(subject: string): boolean {
  if (!subject) return false
  const lower = subject.toLowerCase()
  return INVOICE_SUBJECT_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

// ============================================================
// ZIP 处理
// ============================================================

/** 解压 zip，返回内部发票文件列表 */
export function extractZipAttachments(
  zipBuffer: Buffer
): { filename: string; content: Buffer }[] {
  const results: { filename: string; content: Buffer }[] = []
  try {
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries()
    for (const entry of entries) {
      if (entry.isDirectory) continue
      const filename = entry.entryName
      if (isInvoiceCandidate(filename)) {
        results.push({ filename, content: entry.getData() })
      }
    }
  } catch (e) {
    console.warn('[attachment-utils] zip 解压失败:', e)
  }
  return results
}

// ============================================================
// 排序
// ============================================================

/** 按优先级排序附件: PDF > OFD > XML > ZIP */
export function sortByPriority(attachments: AttachmentInfo[]): AttachmentInfo[] {
  const priority: Record<string, number> = { '.pdf': 0, '.ofd': 1, '.xml': 2, '.zip': 3 }
  return [...attachments].sort((a, b) => {
    const extA = getExtension(a.filename) || inferExtensionFromContentType(a.contentType)
    const extB = getExtension(b.filename) || inferExtensionFromContentType(b.contentType)
    const pa = priority[extA] ?? 9
    const pb = priority[extB] ?? 9
    return pa - pb
  })
}

// ============================================================
// HTML 下载链接提取
// ============================================================

/**
 * 从邮件 HTML 中提取发票下载链接
 * 典型模式: 税务平台发送的无附件邮件，HTML 内含下载链接
 *
 * 匹配如:
 *   https://dppt.xxx.chinatax.gov.cn/.../exportDzfpwjEwm?Wjgs=PDF&Fphm=xxx
 *   https://xxx.com/download?format=pdf&invoiceNumber=xxx
 */
export function extractInvoiceDownloadLinks(html: string): DownloadLink[] {
  const results: DownloadLink[] = []

  // 匹配含 Wjgs (文件格式) 和 Fphm (发票号码) 的税务平台链接
  const taxPlatformPattern = /href=["']([^"']*exportDzfpwjEwm[^"']*Wjgs=(\w+)[^"']*(?:Fphm=(\d+))?[^"']*)/gi
  let match: RegExpExecArray | null
  while ((match = taxPlatformPattern.exec(html)) !== null) {
    const url = decodeQuotedPrintable(match[1])
    const format = match[2]?.toLowerCase() || 'pdf'
    const invoiceNumber = match[3]
    if (format === 'pdf' || format === 'ofd' || format === 'xml') {
      results.push({ url, format, invoiceNumber })
    }
  }

  // 去重: 优先 PDF，同一发票号码只保留 PDF 链接
  const seen = new Map<string, DownloadLink>()
  for (const link of results) {
    const key = link.invoiceNumber || link.url
    const existing = seen.get(key)
    if (!existing || (link.format === 'pdf' && existing.format !== 'pdf')) {
      seen.set(key, link)
    }
  }

  // 只返回 PDF 链接 (OFD/XML 作为备用)
  const pdfLinks = [...seen.values()].filter(l => l.format === 'pdf')
  if (pdfLinks.length > 0) return pdfLinks

  return [...seen.values()]
}

/** 简易 quoted-printable 解码 (邮件 HTML 内容常见编码) */
function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=3D/gi, '=')
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

// ============================================================
// 内部工具
// ============================================================

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  if (idx === -1) return ''
  return filename.substring(idx).toLowerCase()
}
