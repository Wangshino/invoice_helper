import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  InputNumber,
  Modal,
  Alert,
  Tooltip,
  Card,
  AutoComplete
} from 'antd'
import {
  PlusOutlined,
  PlusCircleOutlined,
  DeleteOutlined,
  SearchOutlined,
  ExportOutlined,
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined,
  TagOutlined,
  EyeOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import type { Invoice } from '../../../shared/types'
import InvoiceDetailModal from '../components/InvoiceDetailModal'
import { useInvoiceStore } from '../stores/invoice-store'

const { Text } = Typography

const fileTypeIcon: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#f5222d' }} />,
  ofd: <FileXmlOutlined style={{ color: '#fa8c16' }} />,
  xml: <FileXmlOutlined style={{ color: '#52c41a' }} />
}

export default function Invoices(): React.ReactElement {
  const { message: msgApi } = App.useApp()
  const navigate = useNavigate()
  const {
    invoices, total, filters, pagination, loading, categories, stats,
    setFilters: storeSetFilters, setPagination: storeSetPagination,
    loadInvoices, loadCategories, loadStats, invalidate
  } = useInvoiceStore()

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [importing, setImporting] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // Batch category
  const [batchCategoryValue, setBatchCategoryValue] = useState<string>('')
  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false)

  // Inline category editing
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryValue, setEditingCategoryValue] = useState('')
  const categoryInputRef = useRef<any>(null)

  // Initial data load
  useEffect(() => {
    loadInvoices()
    loadStats()
    loadCategories()
  }, [loadInvoices, loadStats, loadCategories])

  // Actions
  const handleDelete = useCallback(async (id: number) => {
    const result = await window.api.invoices.remove(id)
    if (result.success) {
      invalidate()
      setSelectedRowKeys((prev) => prev.filter((k) => k !== id))
      msgApi.success('删除成功')
    } else {
      msgApi.error('删除失败: ' + (result.error || '未知错误'))
    }
  }, [msgApi, invalidate])

  const showDetail = useCallback((invoice: Invoice) => {
    setDetailInvoice(invoice)
    setDetailOpen(true)
  }, [])

  const handleOpenFile = useCallback(async (id: number) => {
    const result = await window.api.invoices.openFile(id)
    if (!result.success) msgApi.error('打开文件失败: ' + (result.error || '未知错误'))
  }, [msgApi])

  const handleExportSingle = useCallback(async (id: number) => {
    const result = await window.api.invoices.exportFiles([id])
    if (result.success && result.data) msgApi.success(result.data)
    else if (!result.success) msgApi.error('导出失败: ' + (result.error || '未知错误'))
  }, [msgApi])

  const handleBatchDelete = useCallback(async () => {
    const ids = selectedRowKeys.map(Number)
    const result = await window.api.invoices.batchDelete(ids)
    if (result.success) {
      const count = ids.length
      invalidate()
      setSelectedRowKeys([])
      msgApi.success(`已删除 ${count} 张发票`)
    } else {
      msgApi.error('批量删除失败: ' + (result.error || '未知错误'))
    }
  }, [selectedRowKeys, msgApi, invalidate])

  const handleBatchExport = useCallback(async () => {
    const ids = selectedRowKeys.map(Number)
    const result = await window.api.invoices.exportFiles(ids)
    if (result.success && result.data) msgApi.success(result.data)
    else if (!result.success) msgApi.error('导出失败: ' + (result.error || '未知错误'))
  }, [selectedRowKeys, msgApi])

  // Inline category save
  const handleInlineCategorySave = useCallback(async (invoiceId: number, value: string) => {
    const trimmed = value.trim()
    if (trimmed) {
      const result = await window.api.invoices.update(invoiceId, { category: trimmed })
      if (result.success) {
        invalidate()
      }
    }
    setEditingCategoryId(null)
    setEditingCategoryValue('')
  }, [invalidate])

  // Batch category
  const handleBatchCategory = useCallback(async () => {
    if (!batchCategoryValue.trim()) {
      msgApi.warning('请输入分类名称')
      return
    }
    const ids = selectedRowKeys.map(Number)
    const result = await window.api.invoices.batchUpdateCategory(ids, batchCategoryValue.trim())
    if (result.success) {
      msgApi.success(`已更新 ${ids.length} 张发票的分类`)
    } else {
      msgApi.error('批量分类失败: ' + (result.error || '未知错误'))
    }
    setBatchCategoryOpen(false)
    setBatchCategoryValue('')
    invalidate()
  }, [selectedRowKeys, batchCategoryValue, msgApi, invalidate])

  // Columns
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
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (v: string | null, record: Invoice) => {
        if (editingCategoryId === record.id) {
          return (
            <AutoComplete
              ref={categoryInputRef}
              size="small"
              style={{ width: '100%' }}
              options={categories.map((c) => ({ value: c, label: c }))}
              value={editingCategoryValue}
              onChange={setEditingCategoryValue}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              onBlur={() => handleInlineCategorySave(record.id, editingCategoryValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLElement).blur()
                if (e.key === 'Escape') { setEditingCategoryId(null); setEditingCategoryValue('') }
              }}
              placeholder="输入分类"
            />
          )
        }
        return (
          <Tag
            color={v ? 'blue' : 'default'}
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              setEditingCategoryId(record.id)
              setEditingCategoryValue(v || '')
            }}
          >
            {v || <Text type="secondary" style={{ fontSize: 12 }}>+ 分类</Text>}
          </Tag>
        )
      }
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
          <Tooltip title="预览">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenFile(record.id)}
            />
          </Tooltip>
          <Tooltip title="导出">
            <Button
              type="text"
              size="small"
              icon={<ExportOutlined />}
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
  ], [handleDelete, handleOpenFile, handleExportSingle, editingCategoryId, editingCategoryValue, categories, handleInlineCategorySave])

  // Auto-focus category input when editing
  useEffect(() => {
    if (editingCategoryId !== null) {
      setTimeout(() => categoryInputRef.current?.focus(), 50)
    }
  }, [editingCategoryId])

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
          msgApi.success(`成功导入 ${imported.length} 张发票`)
        }
        if (skipped.length > 0) {
          msgApi.warning(`${skipped.length} 张发票已存在被跳过: ${skipped.map((s) => s.fileName).join(', ')}`, 5)
        }
        if (failed.length > 0) {
          msgApi.error(`${failed.length} 张发票解析失败: ${failed.map((f) => `${f.fileName} (${f.error})`).join('; ')}`, 8)
        }
        if (imported.length === 0 && skipped.length === 0 && failed.length === 0) {
          msgApi.info('没有新发票被导入')
        }
        invalidate()
      } else {
        msgApi.error('导入失败: ' + (parseResult.error || '解析错误'))
      }
    } catch (e) {
      msgApi.error('导入失败: ' + (e as Error).message)
    } finally {
      setImporting(false)
    }
  }, [msgApi, invalidate])

  // CSV export
  const handleExportCsv = useCallback(async () => {
    const result = await window.api.invoices.exportCsv(filters)
    if (result.success && result.data) {
      msgApi.success(result.data)
    } else if (!result.success) {
      msgApi.error('导出失败: ' + (result.error || '未知错误'))
    }
  }, [filters, msgApi])

  // Summary stats (from global countByStatus)
  const unreimbursedStat = stats.find((s) => s.status === 'unreimbursed')
  const totalAmount = useMemo(
    () => stats.reduce((sum, s) => sum + s.totalAmount, 0),
    [stats]
  )
  const totalCount = useMemo(() => stats.reduce((sum, s) => sum + s.count, 0), [stats])
  const unreimbursedCount = unreimbursedStat?.count ?? 0
  const unreimbursedAmount = unreimbursedStat?.totalAmount ?? 0

  const hasSelection = selectedRowKeys.length > 0

  return (
    <div>
      {/* Header with inline stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <Typography.Title level={3} style={{ margin: '0 0 8px 0' }}>发票管理</Typography.Title>
          <div style={{ display: 'flex', gap: 8 }}>
            <Tag color="default" style={{ margin: 0, padding: '2px 10px', fontSize: 12, borderRadius: 4 }}>
              共 <Text strong>{totalCount}</Text> 张
            </Tag>
            <Tag color="orange" style={{ margin: 0, padding: '2px 10px', fontSize: 12, borderRadius: 4 }}>
              未报销 <Text strong style={{ color: '#d46b08' }}>{unreimbursedCount}</Text> 张
            </Tag>
            <Tag color="orange" style={{ margin: 0, padding: '2px 10px', fontSize: 12, borderRadius: 4 }}>
              未报销金额 <Text strong style={{ color: '#d46b08' }}>¥{unreimbursedAmount.toFixed(2)}</Text>
            </Tag>
            <Tag color="blue" style={{ margin: 0, padding: '2px 10px', fontSize: 12, borderRadius: 4 }}>
              总金额 <Text strong style={{ color: '#096dd9' }}>¥{totalAmount.toFixed(2)}</Text>
            </Tag>
          </div>
        </div>
        <Space size={12}>
          <Button
            icon={<ExportOutlined />}
            onClick={handleExportCsv}
          >
            导出台账
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={importing}
            onClick={handleImport}
            size="large"
          >
            导入发票
          </Button>
        </Space>
      </div>

      {/* Filters - compact inline bar */}
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <Space size={12} wrap>
          <Select
            style={{ width: 110 }}
            placeholder="状态"
            allowClear
            value={filters.status}
            onChange={(v) => storeSetFilters({ ...filters, status: v })}
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
            onChange={(v) => storeSetFilters({ ...filters, source: v })}
            options={[
              { value: 'manual', label: '手动导入' },
              { value: 'email', label: '邮件导入' }
            ]}
          />
          <AutoComplete
            style={{ width: 120 }}
            placeholder="分类"
            allowClear
            value={filters.category || undefined}
            onChange={(v) => storeSetFilters({ ...filters, category: v || undefined })}
            options={categories.map((c) => ({ value: c, label: c }))}
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
          />
          <DatePicker.RangePicker
            style={{ width: 230 }}
            placeholder={['开始日期', '结束日期']}
            onChange={(dates) =>
              storeSetFilters({
                ...filters,
                dateFrom: dates?.[0]?.format('YYYY-MM-DD'),
                dateTo: dates?.[1]?.format('YYYY-MM-DD')
              })
            }
          />
          <Input
            style={{ width: 200 }}
            placeholder="搜索发票号 / 销方 / 购方"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
            value={filters.keyword}
            onChange={(e) => storeSetFilters({ ...filters, keyword: e.target.value })}
          />
          <InputNumber
            style={{ width: 100 }}
            placeholder="最低金额"
            min={0}
            precision={2}
            value={filters.amountFrom}
            onChange={(v) => storeSetFilters({ ...filters, amountFrom: v ?? undefined })}
          />
          <Text type="secondary">-</Text>
          <InputNumber
            style={{ width: 100 }}
            placeholder="最高金额"
            min={0}
            precision={2}
            value={filters.amountTo}
            onChange={(v) => storeSetFilters({ ...filters, amountTo: v ?? undefined })}
          />
          <Input
            style={{ width: 140 }}
            placeholder="购方名称"
            allowClear
            value={filters.buyerName}
            onChange={(e) => storeSetFilters({ ...filters, buyerName: e.target.value })}
          />
        </Space>
      </Card>

      {/* Batch operations bar — always visible */}
      <Alert
        type={hasSelection ? 'info' : 'warning'}
        showIcon
        message={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              {hasSelection
                ? <>已选择 <Text strong>{selectedRowKeys.length}</Text> 项</>
                : <Text type="secondary">点击表格行选择发票进行批量操作</Text>
              }
            </span>
            <Space>
              <Button size="small" icon={<TagOutlined />} disabled={!hasSelection} onClick={() => setBatchCategoryOpen(true)}>
                批量分类
              </Button>
              <Button size="small" icon={<PlusCircleOutlined />} disabled={!hasSelection} onClick={() => navigate(`/reimbursement/create?invoiceIds=${selectedRowKeys.join(',')}`)}>
                创建报销单
              </Button>
              <Button size="small" icon={<ExportOutlined />} disabled={!hasSelection} onClick={handleBatchExport}>
                批量导出
              </Button>
              <Popconfirm
                title={`确定删除 ${selectedRowKeys.length} 张发票？`}
                description="此操作不可恢复"
                onConfirm={handleBatchDelete}
              >
                <Button size="small" danger icon={<DeleteOutlined />} disabled={!hasSelection}>
                  批量删除
                </Button>
              </Popconfirm>
              {hasSelection && (
                <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
                  取消选择
                </Button>
              )}
            </Space>
          </div>
        }
        style={{ marginBottom: 12 }}
      />

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
          current: pagination.page,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 张`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => storeSetPagination({ page, pageSize }),
          style: { margin: '8px 16px' }
        }}
        size="middle"
        scroll={{ x: 1060 }}
        locale={{ emptyText: '暂无发票数据，点击"导入发票"开始' }}
      />

      {/* Invoice Detail Modal */}
      <InvoiceDetailModal
        invoice={detailInvoice}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        categories={categories}
        editable={true}
        onSaved={() => {
          invalidate()
          loadCategories()
        }}
      />

      {/* Batch Category Modal */}
      <Modal
        title="批量设置分类"
        open={batchCategoryOpen}
        onCancel={() => { setBatchCategoryOpen(false); setBatchCategoryValue('') }}
        onOk={handleBatchCategory}
        okText="确认"
        cancelText="取消"
      >
        <p>将为选中的 <Text strong>{selectedRowKeys.length}</Text> 张发票设置分类</p>
        <AutoComplete
          style={{ width: '100%' }}
          placeholder="选择已有分类或输入新分类"
          value={batchCategoryValue || undefined}
          onChange={setBatchCategoryValue}
          options={categories.map((c) => ({ value: c, label: c }))}
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
          allowClear
        />
      </Modal>
    </div>
  )
}
