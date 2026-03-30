import { useState, useEffect, useCallback } from 'react'
import {
  App,
  Card,
  Col,
  Row,
  Statistic,
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Spin,
  Empty,
  Modal,
  Descriptions,
  Tooltip,
  Form,
  Input,
  InputNumber,
  AutoComplete
} from 'antd'
import {
  FileTextOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MailOutlined,
  ReloadOutlined,
  PlusOutlined,
  ImportOutlined,
  SendOutlined,
  RightOutlined,
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined,
  EditOutlined,
  EyeOutlined,
  ExportOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Invoice, UpdateInvoiceParams } from '../../../shared/types'
import InvoicePreview from '../components/InvoicePreview'

const { Title, Text } = Typography

const fileTypeIcon: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#f5222d' }} />,
  ofd: <FileXmlOutlined style={{ color: '#fa8c16' }} />,
  xml: <FileXmlOutlined style={{ color: '#52c41a' }} />
}

export default function Dashboard(): React.ReactElement {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [invoiceStats, setInvoiceStats] = useState<{ status: string; count: number; totalAmount: number }[]>([])
  const [reimburseStats, setReimburseStats] = useState<{ status: string; count: number; totalAmount: number }[]>([])
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editForm] = Form.useForm()
  const [editLoading, setEditLoading] = useState(false)

  // Category
  const [categories, setCategories] = useState<string[]>([])

  const loadCategories = useCallback(async () => {
    const result = await window.api.invoices.getCategories()
    if (result.success && result.data) {
      setCategories(result.data)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [invRes, reimbRes, recentRes] = await Promise.all([
        window.api.invoices.countByStatus(),
        window.api.reimbursements.countByStatus(),
        window.api.invoices.getAll({}, { page: 1, pageSize: 10 })
      ])
      if (invRes.success && invRes.data) setInvoiceStats(invRes.data)
      if (reimbRes.success && reimbRes.data) setReimburseStats(reimbRes.data)
      if (recentRes.success && recentRes.data) {
        const data = recentRes.data
        setRecentInvoices('items' in data ? data.items : Array.isArray(data) ? data.slice(0, 10) : [])
      }
    } catch {
      message.error('加载首页数据失败')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const unreimbursed = invoiceStats.find((s) => s.status === 'unreimbursed')
  const reimbursed = invoiceStats.find((s) => s.status === 'reimbursed')
  const draftReimburs = reimburseStats.find((s) => s.status === 'draft')
  const sentReimburs = reimburseStats.find((s) => s.status === 'sent')

  const totalInvoiceAmount = invoiceStats.reduce((sum, s) => sum + s.totalAmount, 0)

  // Edit handlers
  const handleStartEdit = useCallback(() => {
    if (!detailInvoice) return
    Modal.confirm({
      title: '确认编辑发票信息',
      content: '手动修改发票信息可能导致与原始文件不一致，请确认修改内容准确无误后再保存。',
      okText: '确认编辑',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        editForm.setFieldsValue({
          invoiceNumber: detailInvoice.invoiceNumber || '',
          invoiceCode: detailInvoice.invoiceCode || '',
          invoiceDate: detailInvoice.invoiceDate || '',
          invoiceType: detailInvoice.invoiceType || '',
          sellerName: detailInvoice.sellerName || '',
          sellerTaxId: detailInvoice.sellerTaxId || '',
          buyerName: detailInvoice.buyerName || '',
          buyerTaxId: detailInvoice.buyerTaxId || '',
          amount: detailInvoice.amount,
          taxAmount: detailInvoice.taxAmount,
          totalAmount: detailInvoice.totalAmount,
          invoiceContent: detailInvoice.invoiceContent || '',
          category: detailInvoice.category || undefined
        })
        setEditing(true)
      }
    })
  }, [detailInvoice, editForm])

  const handleSaveEdit = useCallback(async () => {
    if (!detailInvoice) return
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const params: UpdateInvoiceParams = {
        invoiceNumber: values.invoiceNumber || undefined,
        invoiceCode: values.invoiceCode || undefined,
        invoiceDate: values.invoiceDate || undefined,
        invoiceType: values.invoiceType || undefined,
        sellerName: values.sellerName || undefined,
        sellerTaxId: values.sellerTaxId || undefined,
        buyerName: values.buyerName || undefined,
        buyerTaxId: values.buyerTaxId || undefined,
        amount: values.amount,
        taxAmount: values.taxAmount,
        totalAmount: values.totalAmount,
        invoiceContent: values.invoiceContent || undefined,
        category: values.category || undefined
      }
      const result = await window.api.invoices.update(detailInvoice.id, params)
      if (result.success) {
        message.success('发票信息已更新')
        setEditing(false)
        const recentRes = await window.api.invoices.getAll({}, { page: 1, pageSize: 10 })
        if (recentRes.success && recentRes.data) {
          const data = recentRes.data
          const items = 'items' in data ? data.items : data
          setRecentInvoices(items)
          const updated = items.find((inv) => inv.id === detailInvoice.id)
          if (updated) setDetailInvoice(updated)
        }
        loadCategories()
      } else {
        message.error('更新失败: ' + (result.error || '未知错误'))
      }
    } catch {
      // form validation error
    } finally {
      setEditLoading(false)
    }
  }, [detailInvoice, editForm, message, loadCategories])

  const handleOpenFile = useCallback(async (id: number) => {
    const result = await window.api.invoices.openFile(id)
    if (!result.success) message.error('打开文件失败')
  }, [message])

  const handleExportSingle = useCallback(async (id: number) => {
    const result = await window.api.invoices.exportFiles([id])
    if (result.success && result.data) message.success(result.data)
  }, [message])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>首页概览</Title>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card hoverable onClick={() => navigate('/invoices')} style={{ cursor: 'pointer' }}>
            <Statistic
              title="未报销发票"
              value={unreimbursed?.count ?? 0}
              prefix={<ClockCircleOutlined />}
              suffix="张"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable onClick={() => navigate('/invoices')} style={{ cursor: 'pointer' }}>
            <Statistic
              title="未报销金额"
              value={unreimbursed?.totalAmount ?? 0}
              prefix={<DollarOutlined />}
              suffix="元"
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable onClick={() => navigate('/invoices')} style={{ cursor: 'pointer' }}>
            <Statistic
              title="已报销发票"
              value={reimbursed?.count ?? 0}
              prefix={<CheckCircleOutlined />}
              suffix="张"
              styles={{ content: { color: '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable onClick={() => navigate('/reimbursement/list')} style={{ cursor: 'pointer' }}>
            <Statistic
              title="已发送报销单"
              value={sentReimburs?.count ?? 0}
              prefix={<SendOutlined />}
              suffix="份"
              styles={{ content: { color: '#1890ff' } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Second row stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="草稿报销单"
              value={draftReimburs?.count ?? 0}
              prefix={<FileTextOutlined />}
              suffix="份"
              styles={{ content: { fontSize: 20 } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="发票总金额"
              value={totalInvoiceAmount}
              prefix={<DollarOutlined />}
              suffix="元"
              precision={2}
              styles={{ content: { fontSize: 20 } }}
            />
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card title="快捷操作" size="small" style={{ marginBottom: 24 }}>
        <Space size="middle" wrap>
          <Button
            type="primary"
            icon={<ImportOutlined />}
            onClick={() => navigate('/invoices')}
          >
            导入发票
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => navigate('/reimbursement/create')}
          >
            新建报销单
          </Button>
          <Button
            icon={<MailOutlined />}
            onClick={() => navigate('/email-import')}
          >
            同步邮件
          </Button>
          <Button
            icon={<SendOutlined />}
            onClick={() => navigate('/reimbursement/list')}
          >
            查看报销单
          </Button>
        </Space>
      </Card>

      {/* Recent Invoices */}
      <Card
        title="最近发票"
        size="small"
        extra={
          <Button type="link" icon={<RightOutlined />} onClick={() => navigate('/invoices')}>
            查看全部
          </Button>
        }
      >
        {recentInvoices.length === 0 ? (
          <Empty description="暂无发票数据" image={Empty.PRESENTED_IMAGE_SIMPLE}>
            <Button type="primary" icon={<ImportOutlined />} onClick={() => navigate('/invoices')}>
              导入发票
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={recentInvoices}
            rowKey="id"
            size="small"
            pagination={false}
            onRow={(record: Invoice) => ({
              onClick: () => {
                setDetailInvoice(record)
                setEditing(false)
                setDetailOpen(true)
              },
              style: { cursor: 'pointer', transition: 'background 0.15s' }
            })}
            columns={[
              {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (status: string) => (
                  <Tag color={status === 'reimbursed' ? 'success' : 'warning'} style={{ margin: 0, borderRadius: 4 }}>
                    {status === 'reimbursed' ? '已报销' : '未报销'}
                  </Tag>
                )
              },
              {
                title: '价税合计',
                dataIndex: 'totalAmount',
                width: 110,
                render: (v: number | null) => v != null ? <Text strong>¥{v.toFixed(2)}</Text> : '-'
              },
              {
                title: '销方名称',
                dataIndex: 'sellerName',
                ellipsis: { showTitle: false },
                render: (v: string | null) => (
                  <Tooltip placement="topLeft" title={v}>
                    {v || <Text type="secondary">未知</Text>}
                  </Tooltip>
                )
              },
              {
                title: '开票日期',
                dataIndex: 'invoiceDate',
                width: 100,
                render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-'
              },
              {
                title: '类型',
                key: 'fileType',
                width: 40,
                align: 'center',
                render: (_: unknown, record: Invoice) => fileTypeIcon[record.fileType] || null
              },
              {
                title: '来源',
                dataIndex: 'source',
                width: 60,
                align: 'center',
                render: (s: string) => (
                  <Tag style={{ margin: 0 }}>{s === 'email' ? '邮件' : '手动'}</Tag>
                )
              }
            ]}
          />
        )}
      </Card>

      {/* Invoice Detail Modal — 2-row layout: info top, preview bottom */}
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
        onCancel={() => { setDetailOpen(false); setEditing(false) }}
        width={1100}
        styles={{ body: { maxHeight: '80vh', overflow: 'auto' } }}
        footer={
          detailInvoice ? (
            <Space>
              <Button icon={<EyeOutlined />} onClick={() => handleOpenFile(detailInvoice.id)}>
                预览
              </Button>
              <Button icon={<ExportOutlined />} onClick={() => handleExportSingle(detailInvoice.id)}>
                导出
              </Button>
              {!editing && (
                <Button icon={<EditOutlined />} onClick={handleStartEdit}>
                  编辑
                </Button>
              )}
              {editing && (
                <>
                  <Button type="primary" loading={editLoading} onClick={handleSaveEdit}>
                    保存
                  </Button>
                  <Button onClick={() => setEditing(false)}>取消编辑</Button>
                </>
              )}
              <Button onClick={() => { setDetailOpen(false); setEditing(false) }}>关闭</Button>
            </Space>
          ) : <Button onClick={() => { setDetailOpen(false); setEditing(false) }}>关闭</Button>
        }
      >
        {detailInvoice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top: Info section */}
            <div>
              {editing ? (
                <Form form={editForm} layout="vertical" size="small">
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label="发票号码" name="invoiceNumber"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item label="发票代码" name="invoiceCode"><Input /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label="开票日期" name="invoiceDate"><Input placeholder="YYYY-MM-DD" /></Form.Item></Col>
                    <Col span={12}><Form.Item label="发票类型" name="invoiceType"><Input /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label="销方名称" name="sellerName"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item label="销方税号" name="sellerTaxId"><Input /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label="购方名称" name="buyerName"><Input /></Form.Item></Col>
                    <Col span={12}><Form.Item label="购方税号" name="buyerTaxId"><Input /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={8}><Form.Item label="金额" name="amount"><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={8}><Form.Item label="税额" name="taxAmount"><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={8}><Form.Item label="价税合计" name="totalAmount"><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}><Form.Item label="发票内容" name="invoiceContent"><Input /></Form.Item></Col>
                    <Col span={12}>
                      <Form.Item label="分类" name="category">
                        <AutoComplete
                          allowClear
                          placeholder="选择或输入分类"
                          options={categories.map((c) => ({ value: c, label: c }))}
                          filterOption={(input, option) =>
                            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                          }
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              ) : (
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="发票号码">
                    <Text copyable>{detailInvoice.invoiceNumber || '-'}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="开票日期">{detailInvoice.invoiceDate || '-'}</Descriptions.Item>
                  <Descriptions.Item label="发票代码">{detailInvoice.invoiceCode || '-'}</Descriptions.Item>
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
                  <Descriptions.Item label="分类">
                    {detailInvoice.category ? <Tag color="blue">{detailInvoice.category}</Tag> : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={detailInvoice.status === 'reimbursed' ? 'success' : 'warning'}>
                      {detailInvoice.status === 'reimbursed' ? '已报销' : '未报销'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="发票内容">{detailInvoice.invoiceContent || '-'}</Descriptions.Item>
                  <Descriptions.Item label="文件类型">
                    {detailInvoice.fileType?.toUpperCase() || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="来源">
                    {detailInvoice.source === 'email' ? '邮件导入' : '手动导入'}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </div>
            {/* Bottom: Preview */}
            <div>
              <InvoicePreview invoice={detailInvoice} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
