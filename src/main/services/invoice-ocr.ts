/**
 * Baidu OCR VAT Invoice API integration
 * API Docs: https://cloud.baidu.com/doc/OCR/s/nk3h7xy2t
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

/**
 * Get Baidu OAuth access token
 */
async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
  const response = await fetch(url, { method: 'POST' })
  const data = (await response.json()) as BaiduTokenResponse

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000
  }
  return data.access_token
}

/**
 * Recognize VAT invoice from PDF or image buffer
 */
export async function recognizeInvoice(
  config: OcrConfig,
  fileBuffer: Buffer,
  fileType: 'pdf' | 'image'
): Promise<Record<string, unknown>> {
  const token = await getAccessToken(config.apiKey, config.secretKey)
  const base64 = fileBuffer.toString('base64')

  const body = fileType === 'pdf'
    ? `pdf_file=${encodeURIComponent(base64)}`
    : `image=${encodeURIComponent(base64)}`

  const url = `https://aip.baidubce.com/rest/2.0/ocr/v1/vat_invoice?access_token=${token}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  const result = await response.json()
  if (result.error_code) {
    throw new Error(`百度OCR错误: ${result.error_msg}`)
  }

  return result.words_result || result
}
