import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  App,
  Button,
  Space,
  Table,
  Tag,
  Typography,
  Popconfirm,
  DatePicker,
  Select,
  Input,
  Modal,
  Descriptions,
  Alert
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  EyeOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  ExportOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Invoice, InvoiceFilters } from '../../../shared/types'

const { Title, Text } = Typography

export default function Invoices(): React.ReactElement {
  const { message } = App.useApp()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({})

  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [importing, setImporting] = useState(false)

  // Batch selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // Delete invoice
  const handleDelete = useCallback(async (id: number) => {
    const result = await window.api.invoices.remove(id)
    if (result.success) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id))
      setSelectedRowKeys((prev) => prev.filter((k) => k !== id))
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

  // Open file with system default app
  const handleOpenFile = useCallback(async (id: number) => {
    const result = await window.api.invoices.openFile(id)
    if (!result.success) {
      message.error('打开文件失败: ' + (result.error || '未知错误'))
    }
  }, [])

  // Export single invoice file
  const handleExportSingle = useCallback(async (id: number) => {
    const result = await window.api.invoices.exportFiles([id])
    if (result.success && result.data) {
      message.success(result.data)
    } else if (result.success) {
      // cancelled
    } else {
      message.error('导出失败: ' + (result.error || '未知错误'))
    }
  }, [])

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    const ids = selectedRowKeys.map(Number)
    const result = await window.api.invoices.batchDelete(ids)
    if (result.success) {
      setInvoices((prev) => prev.filter((inv) => !ids.includes(inv.id)))
      setSelectedRowKeys([])
      message.success(`已删除 ${ids.length} 张发票`)
    } else {
      message.error('批量删除失败: ' + (result.error || '未知错误'))
    }
  }, [selectedRowKeys])

  // Batch export
  const handleBatchExport = useCallback(async () => {
    const ids = selectedRowKeys.map(Number)
    const result = await window.api.invoices.exportFiles(ids)
    if (result.success && result.data) {
      message.success(result.data)
    } else if (result.success) {
      // cancelled
    } else {
      message.error('导出失败: ' + (result.error || '未知错误'))
    }
  }, [selectedRowKeys])

  // Table columns (defined inside component to access handlers)
  const columns: ColumnsType<Invoice> = useMemo(() => [
    {
      title: '发票号码',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 180,
      render: (v: string | null) => v || <Text type="secondary">-</Text>
    },
    {
      title: '开票日期',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 120,
      render: (v: string | null) =>
        v ? dayjs(v).format('YYYY-MM-DD') : <Text type="secondary">-</Text>
    },
    { title: '发票类型', dataIndex: 'invoiceType', key: 'invoiceType', width: 120 },
    { title: '销方名称', dataIndex: 'sellerName', key: 'sellerName', ellipsis: true },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
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
        <Tag color="blue">{v != null ? `¥${v.toFixed(2)}` : '-'}</Tag>
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
      width: 160,
      render: (_: unknown, record: Invoice) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => showPreview(record)}
            title="查看详情"
          />
          <Button
            type="link"
            size="small"
            icon={<FolderOpenOutlined />}
            onClick={() => handleOpenFile(record.id)}
            title="用系统程序打开"
          />
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleExportSingle(record.id)}
            title="导出文件"
          />
          <Popconfirm
            title="确认删除"
            description={`删除发票 ${record.invoiceNumber || record.id}?`}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} title="删除" />
          </Popconfirm>
        </Space>
      )
    }
  ], [showPreview, handleDelete, handleOpenFile, handleExportSingle])

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
        const { invoices: imported, skipped, failed } = parseResult.data
        if (imported.length > 0) {
          setInvoices((prev) => [...prev, ...imported])
          message.success(`成功导入 ${imported.length} 张发票`)
        }
        if (skipped.length > 0) {
          message.warning(`${skipped.length} 张发票已存在被跳过: ${skipped.map((s) => s.fileName).join(', ')}`, 5)
        }
        if (failed.length > 0) {
          message.error(`${failed.length} 张发票解析失败: ${failed.map((f) => `${f.fileName} (${f.error})`).join('; ')}`, 8)
        }
        if (imported.length === 0 && skipped.length === 0 && failed.length === 0) {
          message.info('没有新发票被导入')
        }
      } else {
        message.error('导入失败: ' + (parseResult.error || '解析错误'))
      }
    } catch (e) {
      message.error('导入失败: ' + (e as Error).message)
    } finally {
      setImporting(false)
    }
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

      {/* Batch operations bar */}
      {selectedRowKeys.length > 0 && (
        <Alert
          type="info"
          showIcon
          message={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>已选择 {selectedRowKeys.length} 项</span>
              <Space>
                <Button
                  size="small"
                  icon={<ExportOutlined />}
                  onClick={handleBatchExport}
                >
                  批量导出
                </Button>
                <Popconfirm
                  title={`确定删除 ${selectedRowKeys.length} 张发票？`}
                  description="此操作不可恢复，发票文件也将被删除"
                  onConfirm={handleBatchDelete}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    批量删除
                  </Button>
                </Popconfirm>
                <Button size="small" onClick={() => setSelectedRowKeys([])}>
                  取消选择
                </Button>
              </Space>
            </div>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      {/* Table */}
      <Table
        columns={columns}
        dataSource={invoices}
        rowKey="id"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys
        }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 1300 }}
        locale={{ emptyText: '暂无发票数据，点击"导入发票"开始' }}
      />

      {/* Preview Modal */}
      <Modal
        title="发票详情"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={600}
        footer={
          previewInvoice ? (
            <Space>
              <Button
                icon={<FolderOpenOutlined />}
                onClick={() => handleOpenFile(previewInvoice.id)}
              >
                用系统程序打开
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => handleExportSingle(previewInvoice.id)}
              >
                导出文件
              </Button>
              <Button onClick={() => setPreviewVisible(false)}>关闭</Button>
            </Space>
          ) : null
        }
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
