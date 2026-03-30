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
  Alert,
  Tooltip,
  Card
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  SearchOutlined,
  FolderOpenOutlined,
  DownloadOutlined,
  ExportOutlined,
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Invoice, InvoiceFilters } from '../../../shared/types'
import InvoicePreview from '../components/InvoicePreview'

const { Text } = Typography

const fileTypeIcon: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#f5222d' }} />,
  ofd: <FileXmlOutlined style={{ color: '#fa8c16' }} />,
  xml: <FileXmlOutlined style={{ color: '#52c41a' }} />
}

export default function Invoices(): React.ReactElement {
  const { message } = App.useApp()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<InvoiceFilters>({})

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [importing, setImporting] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [pageSize, setPageSize] = useState(20)

  // Actions
  const handleDelete = useCallback(async (id: number) => {
    const result = await window.api.invoices.remove(id)
    if (result.success) {
      setInvoices((prev) => prev.filter((inv) => inv.id !== id))
      setSelectedRowKeys((prev) => prev.filter((k) => k !== id))
      message.success('删除成功')
    } else {
      message.error('删除失败: ' + (result.error || '未知错误'))
    }
  }, [message])

  const showDetail = useCallback((invoice: Invoice) => {
    setDetailInvoice(invoice)
    setDetailOpen(true)
  }, [])

  const handleOpenFile = useCallback(async (id: number) => {
    const result = await window.api.invoices.openFile(id)
    if (!result.success) message.error('打开文件失败: ' + (result.error || '未知错误'))
  }, [message])

  const handleExportSingle = useCallback(async (id: number) => {
    const result = await window.api.invoices.exportFiles([id])
    if (result.success && result.data) message.success(result.data)
    else if (!result.success) message.error('导出失败: ' + (result.error || '未知错误'))
  }, [message])

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
  }, [selectedRowKeys, message])

  const handleBatchExport = useCallback(async () => {
    const ids = selectedRowKeys.map(Number)
    const result = await window.api.invoices.exportFiles(ids)
    if (result.success && result.data) message.success(result.data)
    else if (!result.success) message.error('导出失败: ' + (result.error || '未知错误'))
  }, [selectedRowKeys, message])

  // Columns — reordered: status → totalAmount → sellerName → date → invoiceNumber → source → actions
  const columns: ColumnsType<Invoice> = useMemo(() => [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      filters: [
        { text: '未报销', value: 'unreimbursed' },
        { text: '已报销', value: 'reimbursed' }
      ],
      onFilter: (value, record) => record.status === value,
      render: (status: string) => (
        <Tag
          color={status === 'reimbursed' ? 'success' : 'warning'}
          style={{ margin: 0, borderRadius: 4 }}
        >
          {status === 'reimbursed' ? '已报销' : '未报销'}
        </Tag>
      )
    },
    {
      title: '价税合计',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      sorter: (a, b) => (a.totalAmount ?? 0) - (b.totalAmount ?? 0),
      defaultSortOrder: 'descend',
      render: (v: number | null) => (
        <Text strong style={{ fontSize: 14 }}>
          {v != null ? `¥${v.toFixed(2)}` : '-'}
        </Text>
      )
    },
    {
      title: '销方名称',
      dataIndex: 'sellerName',
      key: 'sellerName',
      ellipsis: { showTitle: false },
      width: 220,
      render: (v: string | null) => (
        <Tooltip placement="topLeft" title={v}>
          <Text style={{ color: '#333' }}>{v || <Text type="secondary">未知</Text>}</Text>
        </Tooltip>
      )
    },
    {
      title: '开票日期',
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      width: 110,
      sorter: (a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''),
      render: (v: string | null) => (
        <Text type="secondary">{v ? dayjs(v).format('YYYY-MM-DD') : '-'}</Text>
      )
    },
    {
      title: '发票号码',
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      width: 190,
      ellipsis: { showTitle: false },
      render: (v: string | null) => (
        <Tooltip title={v}>
          <Text copyable={v ? { tooltips: ['复制', '已复制'] } : false}>
            {v || <Text type="secondary">-</Text>}
          </Text>
        </Tooltip>
      )
    },
    {
      title: '类型',
      key: 'fileType',
      width: 50,
      align: 'center',
      render: (_: unknown, record: Invoice) => fileTypeIcon[record.fileType] || null
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 60,
      align: 'center',
      render: (s: string) => (
        <Tag style={{ margin: 0 }}>{s === 'email' ? '邮件' : '手动'}</Tag>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      align: 'center',
      render: (_: unknown, record: Invoice) => (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="打开文件">
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => handleOpenFile(record.id)}
            />
          </Tooltip>
          <Tooltip title="导出">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleExportSingle(record.id)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description={`删除发票 ${record.invoiceNumber || record.id}?`}
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ], [handleDelete, handleOpenFile, handleExportSingle])

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
  }, [filters, message])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  // Import
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

  // Summary stats
  const totalAmount = useMemo(
    () => invoices.reduce((sum, inv) => sum + (inv.totalAmount ?? 0), 0),
    [invoices]
  )
  const unreimbursedCount = useMemo(
    () => invoices.filter((inv) => inv.status === 'unreimbursed').length,
    [invoices]
  )
  const unreimbursedAmount = useMemo(
    () => invoices.filter((inv) => inv.status === 'unreimbursed').reduce((sum, inv) => sum + (inv.totalAmount ?? 0), 0),
    [invoices]
  )

  return (
    <div>
      {/* Header with inline stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <Typography.Title level={3} style={{ margin: '0 0 4px 0' }}>发票管理</Typography.Title>
          <Space size={24} style={{ color: '#8c8c8c', fontSize: 13 }}>
            <span>共 <Text strong>{invoices.length}</Text> 张</span>
            <span>未报销 <Text strong style={{ color: '#faad14' }}>{unreimbursedCount}</Text> 张</span>
            <span>未报销金额 <Text strong style={{ color: '#faad14' }}>¥{unreimbursedAmount.toFixed(2)}</Text></span>
            <span>总金额 <Text strong>¥{totalAmount.toFixed(2)}</Text></span>
          </Space>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={importing}
          onClick={handleImport}
          size="large"
        >
          导入发票
        </Button>
      </div>

      {/* Filters - compact inline bar */}
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <Space size={12} wrap>
          <Select
            style={{ width: 110 }}
            placeholder="状态"
            allowClear
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={[
              { value: 'unreimbursed', label: '未报销' },
              { value: 'reimbursed', label: '已报销' }
            ]}
          />
          <Select
            style={{ width: 110 }}
            placeholder="来源"
            allowClear
            value={filters.source}
            onChange={(v) => setFilters((f) => ({ ...f, source: v }))}
            options={[
              { value: 'manual', label: '手动导入' },
              { value: 'email', label: '邮件导入' }
            ]}
          />
          <DatePicker.RangePicker
            style={{ width: 230 }}
            placeholder={['开始日期', '结束日期']}
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
            placeholder="搜索发票号 / 销方名称"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            value={filters.keyword}
            onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
          />
        </Space>
      </Card>

      {/* Batch operations bar */}
      {selectedRowKeys.length > 0 && (
        <Alert
          type="info"
          showIcon
          message={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>已选择 <Text strong>{selectedRowKeys.length}</Text> 项</span>
              <Space>
                <Button size="small" icon={<ExportOutlined />} onClick={handleBatchExport}>
                  批量导出
                </Button>
                <Popconfirm
                  title={`确定删除 ${selectedRowKeys.length} 张发票？`}
                  description="此操作不可恢复"
                  onConfirm={handleBatchDelete}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    批量删除
                  </Button>
                </Popconfirm>
                <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
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
        onRow={(record) => ({
          onClick: () => showDetail(record),
          style: { cursor: 'pointer', transition: 'background 0.15s' }
        })}
        pagination={{
          pageSize,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 张`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (_, size) => setPageSize(size)
        }}
        size="middle"
        scroll={{ x: 960 }}
        locale={{ emptyText: '暂无发票数据，点击"导入发票"开始' }}
      />

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            {detailInvoice && fileTypeIcon[detailInvoice.fileType]}
            <span>发票详情</span>
            {detailInvoice?.invoiceNumber && (
              <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 13 }}>
                {detailInvoice.invoiceNumber}
              </Text>
            )}
          </Space>
        }
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={960}
        footer={
          detailInvoice ? (
            <Space>
              <Button icon={<FolderOpenOutlined />} onClick={() => handleOpenFile(detailInvoice.id)}>
                打开文件
              </Button>
              <Button icon={<DownloadOutlined />} onClick={() => handleExportSingle(detailInvoice.id)}>
                导出
              </Button>
              <Button onClick={() => setDetailOpen(false)}>关闭</Button>
            </Space>
          ) : null
        }
      >
        {detailInvoice && (
          <div style={{ display: 'flex', gap: 24 }}>
            {/* Left: Preview */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <InvoicePreview invoice={detailInvoice} />
            </div>
            {/* Right: Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="发票号码">
                  <Text copyable>{detailInvoice.invoiceNumber || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="开票日期">{detailInvoice.invoiceDate || '-'}</Descriptions.Item>
                <Descriptions.Item label="发票类型">{detailInvoice.invoiceType || '-'}</Descriptions.Item>
                <Descriptions.Item label="销方名称">{detailInvoice.sellerName || '-'}</Descriptions.Item>
                <Descriptions.Item label="销方税号">
                  <Text copyable>{detailInvoice.sellerTaxId || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="购方名称">{detailInvoice.buyerName || '-'}</Descriptions.Item>
                <Descriptions.Item label="购方税号">
                  <Text copyable>{detailInvoice.buyerTaxId || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="金额">
                  {detailInvoice.amount != null ? `¥${detailInvoice.amount.toFixed(2)}` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="税额">
                  {detailInvoice.taxAmount != null ? `¥${detailInvoice.taxAmount.toFixed(2)}` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="价税合计">
                  <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                    {detailInvoice.totalAmount != null ? `¥${detailInvoice.totalAmount.toFixed(2)}` : '-'}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={detailInvoice.status === 'reimbursed' ? 'success' : 'warning'}>
                    {detailInvoice.status === 'reimbursed' ? '已报销' : '未报销'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="文件类型">
                  {detailInvoice.fileType?.toUpperCase() || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="来源">
                  {detailInvoice.source === 'email' ? '邮件导入' : '手动导入'}
                </Descriptions.Item>
              </Descriptions>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
