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
  Tooltip
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
  FileTextOutlined as FileXmlOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Invoice } from '../../../shared/types'
import InvoiceDetailModal from '../components/InvoiceDetailModal'
import { useInvoiceStore } from '../stores/invoice-store'

const { Title, Text } = Typography

const fileTypeIcon: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#f5222d' }} />,
  ofd: <FileXmlOutlined style={{ color: '#fa8c16' }} />,
  xml: <FileXmlOutlined style={{ color: '#52c41a' }} />
}

export default function Dashboard(): React.ReactElement {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const {
    invoices: storeInvoices, stats: invoiceStats, categories,
    loadInvoices, loadStats, loadCategories, invalidate
  } = useInvoiceStore()

  const [reimburseStats, setReimburseStats] = useState<{ status: string; count: number; totalAmount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)

  const recentInvoices = storeInvoices.slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const reimbRes = await window.api.reimbursements.countByStatus()
      if (reimbRes.success && reimbRes.data) setReimburseStats(reimbRes.data)
      await Promise.all([loadInvoices(), loadStats(), loadCategories()])
    } catch {
      message.error('加载首页数据失败')
    } finally {
      setLoading(false)
    }
  }, [message, loadInvoices, loadStats, loadCategories])

  useEffect(() => {
    load()
  }, [load])

  const unreimbursed = invoiceStats.find((s) => s.status === 'unreimbursed')
  const reimbursed = invoiceStats.find((s) => s.status === 'reimbursed')
  const draftReimburs = reimburseStats.find((s) => s.status === 'draft')
  const sentReimburs = reimburseStats.find((s) => s.status === 'sent')

  const totalInvoiceAmount = invoiceStats.reduce((sum, s) => sum + s.totalAmount, 0)

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
                width: 180,
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
                width: 110,
                render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD') : '-'
              },
              {
                title: '类型',
                key: 'fileType',
                width: 60,
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
    </div>
  )
}
