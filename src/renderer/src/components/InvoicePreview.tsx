import { useState, useEffect, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button, Space, Spin, Typography } from 'antd'
import {
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  FileImageOutlined
} from '@ant-design/icons'
import type { Invoice } from '../../../shared/types'

const { Text } = Typography

// Configure pdfjs worker — serve from renderer public dir
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

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

  // Use data URI string — avoids ArrayBuffer transfer/detachment entirely
  const fileUrl = useMemo(
    () => (pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : undefined),
    [pdfBase64]
  )

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPageNumber(1)
  }, [])

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
          width={380}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
      {numPages > 1 && (
        <Space style={{ marginTop: 8 }} size="middle">
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
        maxHeight: 500,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <img
          src={images[currentIdx]}
          alt={`OFD页面 ${currentIdx + 1}`}
          style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain' }}
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

// ========== XML Thumbnail ==========

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
          setXmlContent(atob(res.data))
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
        background: '#fafafa',
        maxHeight: 420,
        overflow: 'auto',
        padding: 0
      }}>
        <pre style={{
          fontSize: 11,
          lineHeight: 1.6,
          margin: 0,
          padding: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: '#434343',
          fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace"
        }}>
          {xmlContent.slice(0, 3000)}
          {xmlContent.length > 3000 ? '\n\n... (内容已截断)' : ''}
        </pre>
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
