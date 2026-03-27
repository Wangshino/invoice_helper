import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Space
  Table
  Tag
  Typography
  Popconfirm
  message
  DatePicker
  Select
  Input
  Upload
  Empty
  Spin
  Modal
  Descriptions
} from 'antd'
import {
  PlusOutlined
  DeleteOutlined
  SearchOutlined
  FilterOutlined
  EyeOutlined
  InboxOutlined
  ReloadOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Invoice, InvoiceFilters, InvoiceFileType } from '../../../shared/types'

const { Title } = Typography

const { Text } = Text

// ============ Table Columns ============

const columns: ColumnsType<Invoice> = [
  {
    title: '发票号码',
    dataIndex: 'invoiceNumber',
    key: 'invoiceNumber',
    width: 180
    render: (v: string | null) => v || <Text type="secondary">{v || '-'}</Text>
  },
  {
    title: '开票日期',
    dataIndex: 'invoiceDate',
    key: 'invoiceDate',
    width: 120,
    render: (v: string | null) =>
      v ? dayjs(v).format('YYYY-MM-DD') : <Text type="secondary">{'-'}</Text>
  },
  { title: '发票类型', dataIndex: 'invoiceType', key: 'invoiceType', width: 120 },
  { title: '销方名称', dataIndex: 'sellerName', key: 'sellerName', ellipsis: true },
  { title: '金额', dataIndex: 'amount', key: 'amount', width: 100,
    render: (v: number | null) => (v != null ? `¥${v.toFixed(2)}` : '-')
  },
  {
    title: '税额',
    dataIndex: 'taxAmount',
    key: 'taxAmount',
    width: 90,
    render: (v: number | null) => (v != null ? `¥${v.toFixed(2)}` : '-')
  },
  {
    title: '价税合计',
    dataIndex: 'totalAmount',
    key: 'totalAmount',
    width: 110,
    render: (v: number | null) =>
      <Tag color="blue">{`¥${v?.toFixed(2)}`}</Tag>
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 90,
    render: (status: string) => (
      <Tag color={status === 'reimbursed' ? 'green' : 'orange'}>
        {status === 'reimbursed' ? '已报销' : '未报销'}
      </Tag>
    )
  },
  {
    title: '来源',
    dataIndex: 'source',
    key: 'source',
    width: 70,
    render: (s: string) => <Tag>{s === 'email' ? '邮件' : '手动'}</Tag>
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: (_: unknown, record: Invoice) => (
      <Space>
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => showPreview(record)}
        />
        <Popconfirm
          title="确认删除"
          description={`删除发票 ${record.invoiceNumber || record.id}?`}
          onConfirm={() => handleDelete(record.id)}
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    )
  }
]

export default function Invoices(): React.ReactElement {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({})

  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [importing, setImporting] = useState(false)

  // Load invoices
  const loadInvoices = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoices.getAll(filters)
    if (result.success && result.data) {
      setInvoices(result.data)
    } else {
      message.error('加载发票失败: ' + (result.error || '未知错误'))
    }
    setLoading(false)
  }, [filters])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  // Import files and parse
  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      const pathsResult = await window.api.invoices.importFiles()
      if (!pathsResult.success || !pathsResult.data?.length) {
        setImporting(false)
        return
      }
      const parseResult = await window.api.invoices.importAndParse(pathsResult.data!)
      if (parseResult.success && parseResult.data) {
        setInvoices((prev) => [...prev, ...parseResult.data!])
        message.success(`成功导入 ${parseResult.data.length} 张发票`)
      } else {
        message.error('导入失败: ' + (parseResult.error || '解析错误'))
      }
    } catch (e) {
      message.error('导入失败: ' + (e as Error).message)
    } finally {
      setImporting(false)
    }
  }, [])

  // Parse file upload ( handleUpload
  const handleUpload = useCallback(async (file: File) => {
    // electron Upload gives us a File object, we need to use importAndParse
    // which expects file paths on disk. The Upload component doesn't support
    // file path extraction in renderer — use importFiles + importAndParse flow instead.
    message.info('请使用"导入发票"按钮选择文件')
  }, [])

  // Delete invoice
  const handleDelete = useCallback(async (id: number) => {
    const result = await window.api.invoices.remove(id)
    if (result.success) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id))
      message.success('删除成功')
    } else {
      message.error('删除失败: ' + (result.error || '未知错误'))
    }
  }, [])

  // Show preview
  const showPreview = useCallback((invoice: Invoice) => {
    setPreviewInvoice(invoice)
    setPreviewVisible(true)
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>发票管理</Title>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={importing}
            onClick={handleImport}
          >
            导入发票
          </Button>
        </Space>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
        <Select
          style={{ width: 120 }}
          placeholder="状态"
          allowClear
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        >
          <Select.Option value="unreimbursed">未报销</Select.Option>
          <Select.Option value="reimbursed">已报销</Select.Option>
        </Select>
        <Select
          style={{ width: 120 }}
          placeholder="来源"
          allowClear
          value={filters.source}
          onChange={(v) => setFilters((f) => ({ ...f, source: v }))}
        >
          <Select.Option value="manual">手动</Select.Option>
          <Select.Option value="email">邮件</Select.Option>
        </Select>
        <DatePicker.RangePicker
          style={{ width: 240 }}
          onChange={(dates) =>
            setFilters((f) => ({
              ...f,
              dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
              dateTo: dates?.[1]?.format('YYYY-MM-DD')
            }))
          }
        />
        <Input
          style={{ width: 200 }}
          placeholder="搜索发票号/销方"
          prefix={<SearchOutlined />}
          allowClear
          value={filters.keyword}
          onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
        />
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={invoices}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: true }}
        scroll={{ x: 1200 }}
        locale={{ emptyText: '暂无发票数据，点击"导入发票"开始' }}
      />

      {/* Preview Modal */}
      <Modal
        title="发票详情"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={600}
        footer={null}
      >
        {previewInvoice && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="发票号码">
              {previewInvoice.invoiceNumber || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="发票代码">
              {previewInvoice.invoiceCode || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="开票日期">
              {previewInvoice.invoiceDate || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="发票类型">
              {previewInvoice.invoiceType || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="销方名称">
              {previewInvoice.sellerName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="销方税号">
              {previewInvoice.sellerTaxId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="购方名称">
              {previewInvoice.buyerName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="购方税号">
              {previewInvoice.buyerTaxId || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="金额">
              {previewInvoice.amount != null ? `¥${previewInvoice.amount.toFixed(2)}` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="税额">
              {previewInvoice.taxAmount != null ? `¥${previewInvoice.taxAmount.toFixed(2)}` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="价税合计">
              {previewInvoice.totalAmount != null ? (
                <Tag color="blue">¥{previewInvoice.totalAmount.toFixed(2)}</Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="文件类型">
              {previewInvoice.fileType?.toUpperCase() || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="来源">
              {previewInvoice.source === 'email' ? '邮件导入' : '手动导入'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={previewInvoice.status === 'reimbursed' ? 'green' : 'orange'}>
                {previewInvoice.status === 'reimbursed' ? '已报销' : '未报销'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
