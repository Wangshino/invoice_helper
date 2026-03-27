import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'

export interface ParsedInvoice {
  invoice_number?: string
  invoice_code?: string
  invoice_date?: string
  invoice_type?: string
  seller_name?: string
  seller_tax_id?: string
  buyer_name?: string
  buyer_tax_id?: string
  amount?: number
  tax_amount?: number
  total_amount?: number
}

/**
 * Detect file type by extension and content
 */
export function detectFileType(filePath: string): 'pdf' | 'ofd' | 'xml' {
  const ext = filePath.toLowerCase().split('.').pop()
  if (ext === 'pdf') return 'pdf'
  if (ext === 'ofd') return 'ofd'
  if (ext === 'xml') return 'xml'
  throw new Error(`Unsupported file type: ${ext}`)
}

/**
 * Parse an invoice file based on its type
 */
export async function parseInvoiceFile(filePath: string): Promise<ParsedInvoice> {
  const fileType = detectFileType(filePath)
  const fileBuffer = fs.readFileSync(filePath)

  switch (fileType) {
    case 'ofd':
      return parseOfd(fileBuffer)
    case 'xml':
      return parseXml(fileBuffer)
    case 'pdf':
      return parsePdf(filePath, fileBuffer)
    default:
      throw new Error(`Unsupported file type: ${fileType}`)
  }
}

/**
 * Parse OFD invoice using invoice-ofd2json
 */
async function parseOfd(buffer: Buffer): Promise<ParsedInvoice> {
  try {
    const ofd2json = (await import('invoice-ofd2json')).default || (await import('invoice-ofd2json'))
    const result = await ofd2json(buffer)
    // Map OFD fields to our schema
    return {
      invoice_number: result.InvoiceNumber || result.invoiceNumber,
      invoice_code: result.InvoiceCode || result.invoiceCode,
      invoice_date: result.InvoiceDate || result.invoiceDate,
      invoice_type: result.InvoiceType || result.invoiceType,
      seller_name: result.SellerName || result.sellerName,
      seller_tax_id: result.SellerTaxID || result.sellerTaxID,
      buyer_name: result.BuyerName || result.buyerName,
      buyer_tax_id: result.BuyerTaxID || result.buyerTaxID,
      amount: parseFloat(result.Amount || result.amount || '0'),
      tax_amount: parseFloat(result.TaxAmount || result.taxAmount || '0'),
      total_amount: parseFloat(result.TotalAmount || result.totalAmount || '0')
    }
  } catch (error) {
    console.error('OFD parse error:', error)
    throw new Error(`OFD解析失败: ${(error as Error).message}`)
  }
}

/**
 * Parse XML invoice (全电发票) using fast-xml-parser
 */
async function parseXml(buffer: Buffer): Promise<ParsedInvoice> {
  try {
    const { XMLParser } = await import('fast-xml-parser')
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    })
    const xml = buffer.toString('utf-8')
    const result = parser.parse(xml)

    // Navigate the XML structure - format may vary
    const invoiceData = result.EInvoice?.EInvoiceData ||
      result.EInvoiceData ||
      result.CompositeInvoice?.EInvoiceData ||
      result

    const basic = invoiceData.BasicInformation || {}
    const buyer = invoiceData.BuyerInformation || {}
    const seller = invoiceData.SellerInformation || {}
    const tax = invoiceData.TaxInformation || {}

    return {
      invoice_number: basic.InvoiceNumber || basic['@_InvoiceNumber'],
      invoice_code: basic.InvoiceCode || basic['@_InvoiceCode'],
      invoice_date: basic.IssueDate || basic['@_IssueDate'],
      invoice_type: basic.InvoiceType || '全电发票',
      seller_name: seller.SellerName || seller.Name,
      seller_tax_id: seller.SellerTaxID || seller.TaxID,
      buyer_name: buyer.BuyerName || buyer.Name,
      buyer_tax_id: buyer.BuyerTaxID || buyer.TaxID,
      amount: parseFloat(tax.TotalAmount || tax.Amount || '0'),
      tax_amount: parseFloat(tax.TotalTax || tax.TaxAmount || '0'),
      total_amount: parseFloat(tax.AmountIncludingTax || tax.TotalIncludingTax || '0')
    }
  } catch (error) {
    console.error('XML parse error:', error)
    throw new Error(`XML解析失败: ${(error as Error).message}`)
  }
}

/**
 * Parse PDF invoice using OCR
 * TODO: Integrate Baidu OCR API
 */
async function parsePdf(filePath: string, buffer: Buffer): Promise<ParsedInvoice> {
  // For now, return a placeholder that indicates OCR is needed
  // In production, this will call Baidu OCR VAT Invoice API
  throw new Error('PDF发票解析需要配置百度OCR API Key。请先在设置中配置。')
}

/**
 * Get the storage directory for invoice files
 */
export function getInvoiceStoragePath(): string {
  const dir = join(app.getPath('userData'), 'invoices')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Copy an imported file to internal storage
 */
export function storeInvoiceFile(sourcePath: string, fileName: string): string {
  const storageDir = getInvoiceStoragePath()
  const destPath = join(storageDir, fileName)

  // Avoid overwriting existing files
  if (fs.existsSync(destPath)) {
    const ext = fileName.split('.').pop()
    const baseName = fileName.replace(`.${ext}`, '')
    const timestamp = Date.now()
    const newFileName = `${baseName}_${timestamp}.${ext}`
    const newDestPath = join(storageDir, newFileName)
    fs.copyFileSync(sourcePath, newDestPath)
    return newDestPath
  }

  fs.copyFileSync(sourcePath, destPath)
  return destPath
}
