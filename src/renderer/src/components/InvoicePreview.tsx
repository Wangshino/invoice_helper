import { useState, useEffect, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button, Space, Spin, Typography } from 'antd'
import {
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FileImageOutlined,
  CompressOutlined,
} from '@ant-design/icons'
import type { Invoice } from '../../../shared/types'

const { Text } = Typography

// Configure pdfjs worker
// In dev: Vite dev server serves from root
// In production: public files are copied to out/renderer/ alongside index.html
// Using a relative path from index.html works in both cases
pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs'

interface InvoicePreviewProps {
  invoice: Invoice
}

// ========== PDF Preview ==========

function PdfPreview({ invoice }: { invoice: Invoice }): React.ReactElement {
  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [scale, setScale] = useState(1.0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setPdfBase64(null)
    window.api.invoices.readFileAsBase64(invoice.id).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setPdfBase64(res.data)
      } else {
        setError(true)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [invoice.id])

  const fileUrl = useMemo(
    () => (pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : undefined),
    [pdfBase64]
  )

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
  }, [])

  const handleZoomIn = useCallback(() => setScale(s => Math.min(s + 0.25, 3.0)), [])
  const handleZoomOut = useCallback(() => setScale(s => Math.max(s - 0.25, 0.5)), [])
  const handleZoomReset = useCallback(() => setScale(1.0), [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin />
      </div>
    )
  }

  if (error || !fileUrl) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Text type="danger">PDF 加载失败</Text>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>请尝试使用外部程序打开</Text>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        overflow: 'auto',
        maxHeight: 400,
        width: '100%',
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        background: '#e8e8e8',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <Document
          key={invoice.id}
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
              <Spin />
            </div>
          }
          error={
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Text type="danger">PDF 渲染失败</Text>
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            width={Math.floor(500 * scale)}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Page navigation */}
        {numPages > 1 && (
          <Space size="small">
            <Button
              size="small"
              icon={<LeftOutlined />}
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => p - 1)}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {pageNumber} / {numPages}
            </Text>
            <Button
              size="small"
              icon={<RightOutlined />}
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber((p) => p + 1)}
            />
          </Space>
        )}
        {/* Zoom controls */}
        <Space size="small">
          <Button size="small" icon={<ZoomOutOutlined />} onClick={handleZoomOut} disabled={scale <= 0.5} />
          <Text type="secondary" style={{ fontSize: 12, minWidth: 36, textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </Text>
          <Button size="small" icon={<ZoomInOutlined />} onClick={handleZoomIn} disabled={scale >= 3.0} />
          {scale !== 1.0 && (
            <Button size="small" icon={<CompressOutlined />} onClick={handleZoomReset} />
          )}
        </Space>
      </div>
    </div>
  )
}

// ========== OFD Thumbnail ==========

function OfdThumbnail({ invoice }: { invoice: Invoice }): React.ReactElement {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.invoices.extractOfdImages(invoice.id).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setImages(res.data)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [invoice.id])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin />
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div style={{
        background: '#fafafa',
        borderRadius: 8,
        padding: 32,
        textAlign: 'center'
      }}>
        <FileXmlOutlined style={{ fontSize: 56, color: '#fa8c16', marginBottom: 16 }} />
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 16 }}>OFD 发票文件</Text>
        </div>
        <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 16 }}>
          {invoice.fileName || '未提取到图像资源'}
        </div>
        <div style={{
          background: '#fff',
          borderRadius: 6,
          padding: 16,
          textAlign: 'left',
          fontSize: 13,
          lineHeight: 2
        }}>
          {invoice.invoiceNumber && (
            <div><Text type="secondary">发票号码：</Text><Text>{invoice.invoiceNumber}</Text></div>
          )}
          {invoice.invoiceDate && (
            <div><Text type="secondary">开票日期：</Text><Text>{invoice.invoiceDate}</Text></div>
          )}
          {invoice.sellerName && (
            <div><Text type="secondary">销方名称：</Text><Text>{invoice.sellerName}</Text></div>
          )}
          {invoice.totalAmount != null && (
            <div>
              <Text type="secondary">价税合计：</Text>
              <Text strong style={{ color: '#1890ff' }}>¥{invoice.totalAmount.toFixed(2)}</Text>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        border: '1px solid #e8e8e8',
        borderRadius: 6,
        overflow: 'hidden',
        background: '#fff',
        maxHeight: 400,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <img
          src={images[currentIdx]}
          alt={`OFD页面 ${currentIdx + 1}`}
          style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain' }}
        />
      </div>
      {images.length > 1 && (
        <Space style={{ marginTop: 8 }} size="middle">
          <Button
            size="small"
            icon={<LeftOutlined />}
            disabled={currentIdx <= 0}
            onClick={() => setCurrentIdx((i) => i - 1)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {currentIdx + 1} / {images.length}
          </Text>
          <Button
            size="small"
            icon={<RightOutlined />}
            disabled={currentIdx >= images.length - 1}
            onClick={() => setCurrentIdx((i) => i + 1)}
          />
        </Space>
      )}
      <div style={{ marginTop: 6 }}>
        <Space size={4}>
          <FileImageOutlined style={{ color: '#8c8c8c' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {images.length} 张图片已提取
          </Text>
        </Space>
      </div>
    </div>
  )
}

// ========== XML Preview ==========

/** 简易 XML 格式化 + 语法高亮 */
function formatXml(xml: string): string {
  // 先去掉已有缩进重新格式化
  const PADDING = '  '
  let formatted = ''
  let indent = 0

  // 标准化：移除已有缩进
  const normalized = xml.replace(/>\s+</g, '><').replace(/\n\s*/g, '')

  const tokens = normalized.split(/(<[^>]+>)/g).filter(t => t.length > 0)

  for (const token of tokens) {
    if (token.startsWith('</')) {
      indent = Math.max(0, indent - 1)
      formatted += PADDING.repeat(indent) + token + '\n'
    } else if (token.startsWith('<?')) {
      formatted += token + '\n'
    } else if (token.startsWith('<') && !token.endsWith('/>') && !token.startsWith('<!')) {
      // Check if self-closing via attributes
      if (token.endsWith('/>')) {
        formatted += PADDING.repeat(indent) + token + '\n'
      } else {
        formatted += PADDING.repeat(indent) + token + '\n'
        indent++
      }
    } else if (token.startsWith('<') && token.endsWith('/>')) {
      formatted += PADDING.repeat(indent) + token + '\n'
    } else if (!token.startsWith('<')) {
      // Text content — append to previous line
      if (token.trim()) {
        formatted = formatted.trimEnd() + token.trim() + '\n'
      }
    } else {
      formatted += PADDING.repeat(indent) + token + '\n'
    }
  }

  return formatted
}

/** 对格式化后的 XML 做语法着色 */
function highlightXml(xml: string): React.ReactNode[] {
  const lines = xml.split('\n')
  return lines.map((line, i) => {
    // Match tag patterns
    const parts: React.ReactNode[] = []
    let remaining = line
    let key = 0

    while (remaining.length > 0) {
      // Closing tag
      const closeMatch = remaining.match(/^(<\/)([\w:.-]+)(>)/)
      if (closeMatch) {
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{closeMatch[1]}</span>)
        parts.push(<span key={key++} style={{ color: '#4ec9b0' }}>{closeMatch[2]}</span>)
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{closeMatch[3]}</span>)
        remaining = remaining.slice(closeMatch[0].length)
        continue
      }

      // Self-closing tag
      const selfMatch = remaining.match(/^(<)([\w:.-]+)((?:\s+[^>]*?)?)(\/>)/)
      if (selfMatch) {
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{selfMatch[1]}</span>)
        parts.push(<span key={key++} style={{ color: '#4ec9b0' }}>{selfMatch[2]}</span>)
        if (selfMatch[3]) {
          parts.push(<span key={key++} style={{ color: '#9cdcfe' }}>{selfMatch[3]}</span>)
        }
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{selfMatch[4]}</span>)
        remaining = remaining.slice(selfMatch[0].length)
        continue
      }

      // Opening tag with attributes
      const openMatch = remaining.match(/^(<)([\w:.-]+)((?:\s+[^>]*?)?)(>)/)
      if (openMatch) {
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{openMatch[1]}</span>)
        parts.push(<span key={key++} style={{ color: '#4ec9b0' }}>{openMatch[2]}</span>)
        if (openMatch[3]) {
          // Highlight attributes
          const attrStr = openMatch[3]
          const attrParts = attrStr.split(/(\w+[\w:.-]*=["'][^"']*["'])/g)
          for (const ap of attrParts) {
            if (/^\w+[\w:.-]*=["']/.test(ap)) {
              const eqIdx = ap.indexOf('=')
              parts.push(<span key={key++} style={{ color: '#9cdcfe' }}>{ap.slice(0, eqIdx)}</span>)
              parts.push(<span key={key++} style={{ color: '#569cd6' }}>{'='}</span>)
              parts.push(<span key={key++} style={{ color: '#ce9178' }}>{ap.slice(eqIdx + 1)}</span>)
            } else if (ap) {
              parts.push(<span key={key++} style={{ color: '#9cdcfe' }}>{ap}</span>)
            }
          }
        }
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{openMatch[4]}</span>)
        remaining = remaining.slice(openMatch[0].length)
        continue
      }

      // XML declaration
      const declMatch = remaining.match(/^(<\?xml\s+[^?]*\?>)/)
      if (declMatch) {
        parts.push(<span key={key++} style={{ color: '#569cd6' }}>{declMatch[1]}</span>)
        remaining = remaining.slice(declMatch[0].length)
        continue
      }

      // Text content
      parts.push(<span key={key++} style={{ color: '#d4d4d4' }}>{remaining}</span>)
      break
    }

    return <div key={i}>{parts}</div>
  })
}

function XmlThumbnail({ invoice }: { invoice: Invoice }): React.ReactElement {
  const [xmlContent, setXmlContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.invoices.readFileAsBase64(invoice.id).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        try {
          // 正确解码 UTF-8：atob 返回 Latin1，需要通过 Uint8Array + TextDecoder 还原
          const binary = atob(res.data)
          const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
          const text = new TextDecoder('utf-8').decode(bytes)
          setXmlContent(text)
        } catch {
          setXmlContent('')
        }
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [invoice.id])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin />
      </div>
    )
  }

  const formatted = xmlContent ? formatXml(xmlContent) : ''
  const highlighted = formatted ? highlightXml(formatted) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Header */}
      <div style={{
        background: '#f6ffed',
        border: '1px solid #b7eb8f',
        borderRadius: '6px 6px 0 0',
        padding: '8px 16px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <FileXmlOutlined style={{ color: '#52c41a', fontSize: 18 }} />
        <Text strong style={{ fontSize: 13 }}>XML 发票文件</Text>
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {invoice.fileName || ''}
        </Text>
      </div>
      {/* Content */}
      <div style={{
        border: '1px solid #d9d9d9',
        borderTop: 'none',
        borderRadius: '0 0 6px 6px',
        width: '100%',
        background: '#1e1e1e',
        maxHeight: 400,
        overflow: 'auto',
        padding: 12,
        fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
        fontSize: 11,
        lineHeight: 1.5,
      }}>
        {highlighted}
      </div>
      {/* Footer info */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Space size={4}>
          <ZoomInOutlined style={{ color: '#8c8c8c' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {xmlContent.length > 0 ? `${(xmlContent.length / 1024).toFixed(1)} KB` : '空文件'}
          </Text>
        </Space>
      </div>
    </div>
  )
}

// ========== Main Component ==========

export default function InvoicePreview({ invoice }: InvoicePreviewProps): React.ReactElement {
  const { fileType } = invoice

  if (fileType === 'pdf') {
    return (
      <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <Space>
            <FilePdfOutlined style={{ color: '#f5222d' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {invoice.fileName || 'PDF 文件'}
            </Text>
          </Space>
        </div>
        <PdfPreview invoice={invoice} />
      </div>
    )
  }

  if (fileType === 'ofd') {
    return <OfdThumbnail invoice={invoice} />
  }

  if (fileType === 'xml') {
    return <XmlThumbnail invoice={invoice} />
  }

  return (
    <div style={{ textAlign: 'center', padding: 40, color: '#bfbfbf' }}>
      无法预览此文件类型
    </div>
  )
}
