/**
 * Baidu OCR VAT Invoice API integration
 * API Docs: https://cloud.baidu.com/doc/OCR/s/nk3h7xy2t
 *
 * Response fields (words_result):
 *   InvoiceNumber - 发票号码
 *   InvoiceCode   - 发票代码
 *   InvoiceDate   - 开票日期
 *   InvoiceType   - 发票类型 (增值税电子普通发票, 增值税专用发票 等)
 *   SellerName    - 销售方名称
 *   SellerRegisterNumber - 销方纳税人识别号
 *   BuyerName     - 购买方名称
 *   BuyerRegisterNumber  - 购方纳税人识别号
 *   Amount        - 合计金额 (不含税)
 *   TotalAmount   - 价税合计
 *   TotalTax      - 合计税额
 */

export interface OcrConfig {
  apiKey: string
  secretKey: string
}

interface BaiduTokenResponse {
  access_token: string
  expires_in: number
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  const response = await fetch(url, { method: 'POST' })
  const data = (await response.json()) as BaiduTokenResponse

  if (!data.access_token) {
    throw new Error('百度OCR获取access_token失败')
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000
  }
  return data.access_token
}

/** 解析后的 OCR 发票字段 */
export interface OcrInvoiceResult {
  invoice_number: string
  invoice_code: string
  invoice_date: string
  invoice_type: string
  seller_name: string
  seller_tax_id: string
  buyer_name: string
  buyer_tax_id: string
  amount: number
  tax_amount: number
  total_amount: number
}

/** 将百度OCR响应映射为标准字段 */
function mapOcrFields(wordsResult: Record<string, string>): OcrInvoiceResult {
  const get = (key: string): string => wordsResult[key] || ''
  const parseNum = (v: string): number => {
    if (!v) return 0
    return parseFloat(v.replace(/[,，¥￥\s]/g, '')) || 0
  }

  return {
    invoice_number: get('InvoiceNumber'),
    invoice_code: get('InvoiceCode'),
    invoice_date: get('InvoiceDate'),
    invoice_type: get('InvoiceType'),
    seller_name: get('SellerName'),
    seller_tax_id: get('SellerRegisterNumber'),
    buyer_name: get('BuyerName'),
    buyer_tax_id: get('BuyerRegisterNumber'),
    amount: parseNum(get('Amount')),
    tax_amount: parseNum(get('TotalTax')),
    total_amount: parseNum(get('TotalAmount'))
  }
}

/**
 * 识别 PDF 或图片格式的增值税发票
 * @returns 解析后的标准发票字段
 */
export async function recognizeInvoice(
  config: OcrConfig,
  fileBuffer: Buffer,
  fileType: 'pdf' | 'image'
): Promise<OcrInvoiceResult> {
  const token = await getAccessToken(config.apiKey, config.secretKey)
  const base64 = fileBuffer.toString('base64')

  const body =
    fileType === 'pdf' ? `pdf_file=${encodeURIComponent(base64)}` : `image=${encodeURIComponent(base64)}`

  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/vat_invoice?access_token=${token}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  const result = await response.json()
  if (result.error_code) {
    throw new Error(`百度OCR错误 [${result.error_code}]: ${result.error_msg}`)
  }

  // 百度OCR返回 words_result 数组, 通常只有一项
  const wordsResult = result.words_result?.[0] || result.words_result || {}
  if (typeof wordsResult !== 'object' || Object.keys(wordsResult).length === 0) {
    throw new Error('OCR未能识别发票内容')
  }

  return mapOcrFields(wordsResult)
}
