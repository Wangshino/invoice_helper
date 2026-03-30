import { useState, useEffect, useCallback } from 'react'
import {
  App,
  Button,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
  Popconfirm,
  Modal,
  Descriptions,
  Input,
  Divider,
  Card,
  Segmented,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  SendOutlined,
  UndoOutlined,
  HistoryOutlined,
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined,
  EditOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type { Invoice, Reimbursement, ReimbursementStatus, SentEmail } from '../../../shared/types'
import { DEFAULT_EMAIL_TEMPLATE } from '../../../shared/types'
import type { EmailTemplateData } from '../../../shared/types'
import InvoiceDetailModal from '../components/InvoiceDetailModal'

const { Title, Text } = Typography

const fileTypeIcon: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#f5222d' }} />,
  ofd: <FileXmlOutlined style={{ color: '#fa8c16' }} />,
  xml: <FileXmlOutlined style={{ color: '#52c41a' }} />
}

export default function ReimbursementList(): React.ReactElement {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [loading, setLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<Reimbursement | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | 'all'>('all')
  const [activeTab, setActiveTab] = useState('list')

  // Send modal state
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendTarget, setSendTarget] = useState<Reimbursement | null>(null)
  const [sendEmailTo, setSendEmailTo] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sendPreviewHtml, setSendPreviewHtml] = useState('')
  const [sending, setSending] = useState(false)
  const [defaultTemplate, setDefaultTemplate] = useState<EmailTemplateData>(DEFAULT_EMAIL_TEMPLATE)

  // Sent email history
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([])
  const [sentEmailDetail, setSentEmailDetail] = useState<SentEmail | null>(null)
  const [sentDetailOpen, setSentDetailOpen] = useState(false)

  // Invoice detail modal
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false)
  const [invoiceDetailData, setInvoiceDetailData] = useState<Invoice | null>(null)

  const [reimbTotal, setReimbTotal] = useState(0)
  const [reimbPagination, setReimbPagination] = useState({ page: 1, pageSize: 20 })

  // Load reimbursements
  const loadList = useCallback(async () => {
    setLoading(true)
    const filters = statusFilter !== 'all' ? { status: statusFilter } : {}
    const result = await window.api.reimbursements.getAll(filters, reimbPagination)
    if (result.success && result.data) {
      const data = result.data
      if ('items' in data) {
        setReimbursements(data.items)
        setReimbTotal(data.total)
      } else {
        setReimbursements(data)
        setReimbTotal(data.length)
      }
    } else {
      message.error('加载失败: ' + (result.error || '未知错误'))
    }
    setLoading(false)
  }, [statusFilter, reimbPagination, message])

  // Load sent emails
  const loadSentEmails = useCallback(async () => {
    const result = await window.api.sentEmails.getAll()
    if (result.success && result.data) {
      setSentEmails(result.data)
    }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    if (activeTab === 'history') {
      loadSentEmails()
    }
  }, [activeTab, loadSentEmails])

  const handleDelete = async (id: number): Promise<void> => {
    const result = await window.api.reimbursements.remove(id)
    if (result.success) {
      message.success('删除成功')
      loadList()
    } else {
      message.error('删除失败: ' + (result.error || '未知错误'))
    }
  }

  const handleViewDetail = async (id: number): Promise<void> => {
    const result = await window.api.reimbursements.getById(id)
    if (result.success && result.data) {
      setDetailData(result.data)
      setDetailOpen(true)
    } else {
      message.error('加载详情失败')
    }
  }

  // ===================== Send Modal =====================

  const loadTemplate = useCallback(async () => {
    const result = await window.api.settings.get('reimbursement_email_template')
    if (result.success && result.data) {
      try {
        return JSON.parse(result.data) as EmailTemplateData
      } catch {
        return DEFAULT_EMAIL_TEMPLATE
      }
    }
    return DEFAULT_EMAIL_TEMPLATE
  }, [])

  const handleOpenSendModal = async (record: Reimbursement): Promise<void> => {
    setSendTarget(record)
    setSendEmailTo(record.emailTo || '')
    setSending(false)

    const tmpl = await loadTemplate()
    setDefaultTemplate(tmpl)
    setSendSubject(tmpl.subjectTemplate)
    setSendBody(tmpl.bodyTemplate)

    const previewResult = await window.api.reimbursements.previewEmail(record.id, {
      customSubject: tmpl.subjectTemplate,
      customBody: tmpl.bodyTemplate
    })
    if (previewResult.success && previewResult.data) {
      setSendPreviewHtml(previewResult.data.html)
    }

    setSendModalOpen(true)
  }

  const handleUpdatePreview = async (subject: string, body: string): Promise<void> => {
    if (!sendTarget) return
    const previewResult = await window.api.reimbursements.previewEmail(sendTarget.id, {
      customSubject: subject,
      customBody: body
    })
    if (previewResult.success && previewResult.data) {
      setSendPreviewHtml(previewResult.data.html)
    }
  }

  const handleResetTemplate = (): void => {
    setSendSubject(defaultTemplate.subjectTemplate)
    setSendBody(defaultTemplate.bodyTemplate)
    handleUpdatePreview(defaultTemplate.subjectTemplate, defaultTemplate.bodyTemplate)
  }

  const handleSendEmail = async (): Promise<void> => {
    if (!sendTarget || !sendEmailTo.trim()) {
      message.warning('请输入收件人邮箱')
      return
    }
    setSending(true)
    try {
      const result = await window.api.reimbursements.sendEmail(
        sendTarget.id,
        sendEmailTo.trim(),
        { customSubject: sendSubject, customBody: sendBody }
      )
      if (result.success) {
        message.success('报销单已发送')
        setSendModalOpen(false)
        loadList()
      } else {
        message.error('发送失败: ' + (result.error || '未知错误'))
      }
    } finally {
      setSending(false)
    }
  }

  // ===================== Sent Email History =====================

  const handleDeleteSentEmail = async (id: number): Promise<void> => {
    const result = await window.api.sentEmails.remove(id)
    if (result.success) {
      message.success('已删除')
      loadSentEmails()
    }
  }

  const handleClearHistory = async (): Promise<void> => {
    const result = await window.api.sentEmails.clearAll()
    if (result.success) {
      message.success('已清空发送历史')
      loadSentEmails()
    }
  }

  // ===================== Status Map =====================

  const statusMap: Record<string, { color: string; text: string; icon: React.ReactNode }> = {
    draft: { color: 'default', text: '未发送', icon: <ClockCircleOutlined /> },
    sent: { color: 'blue', text: '已发送', icon: <CheckCircleOutlined /> }
  }

  // ===================== Columns =====================

  const columns: ColumnsType<Reimbursement> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 220,
      ellipsis: { showTitle: false },
      render: (v: string, record: Reimbursement) => (
        <Text
          strong
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            handleViewDetail(record.id)
          }}
        >
          {v}
        </Text>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'left',
      align: 'center',
      render: (_: unknown, record: Reimbursement) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          {record.status === 'draft' && (
            <Tooltip title="编辑">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => navigate(`/reimbursement/create?editId=${record.id}`)} />
            </Tooltip>
          )}
          {(record.status === 'draft' || record.status === 'sent') && (
            <Tooltip title="发送">
              <Button type="link" size="small" icon={<SendOutlined />} onClick={() => handleOpenSendModal(record)} />
            </Tooltip>
          )}
          <Popconfirm title="确认删除此报销单？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status: string) => {
        const s = statusMap[status] || { color: 'default', text: status, icon: null }
        return <Tag color={s.color} style={{ margin: 0, borderRadius: 4 }}>{s.icon} {s.text}</Tag>
      }
    },
    {
      title: '目标金额',
      dataIndex: 'targetAmount',
      key: 'targetAmount',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.targetAmount - b.targetAmount,
      render: (v: number) => <Text strong>¥{v.toFixed(2)}</Text>
    },
    {
      title: '实际金额',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 120,
      align: 'right',
      render: (v: number | null) =>
        v != null ? <Text style={{ color: '#52c41a', fontWeight: 500 }}>¥{v.toFixed(2)}</Text> : <Text type="secondary">-</Text>
    },
    {
      title: '报销事由',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: { showTitle: false },
      render: (v: string) => (
        <Tooltip placement="topLeft" title={v}>
          {v || <Text type="secondary">-</Text>}
        </Tooltip>
      )
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'
    }
  ]

  const sentEmailColumns: ColumnsType<SentEmail> = [
    {
      title: '收件人',
      dataIndex: 'emailTo',
      width: 200,
      render: (v: string) => <Text copyable style={{ fontSize: 13 }}>{v}</Text>
    },
    { title: '主题', dataIndex: 'subject', ellipsis: true },
    {
      title: '附件数',
      dataIndex: 'attachmentCount',
      width: 80,
      align: 'center',
      render: (v: number) => <Tag>{v} 个</Tag>
    },
    {
      title: '发送时间',
      dataIndex: 'sentAt',
      width: 180,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</Text>
    },
    {
      title: '操作',
      width: 120,
      align: 'center',
      render: (_: unknown, record: SentEmail) => (
        <Space size={0}>
          <Tooltip title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => {
              setSentEmailDetail(record)
              setSentDetailOpen(true)
            }} />
          </Tooltip>
          <Popconfirm title="确认删除此记录？" onConfirm={() => handleDeleteSentEmail(record.id)}>
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div style={{ padding: '0 16px' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'list',
            label: '报销单列表',
            children: (
              <>
                {/* Page header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Space size="large" align="center">
                    <Title level={3} style={{ margin: 0 }}>报销单列表</Title>
                    <Segmented
                      value={statusFilter}
                      onChange={(v) => setStatusFilter(v as ReimbursementStatus | 'all')}
                      options={[
                        { label: '全部', value: 'all' },
                        { label: '未发送', value: 'draft' },
                        { label: '已发送', value: 'sent' }
                      ]}
                    />
                  </Space>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/reimbursement/create')}>
                    新建报销单
                  </Button>
                </div>

                <Card size="small" styles={{ body: { padding: 0 } }}>
                  <Table
                    columns={columns}
                    dataSource={reimbursements}
                    rowKey="id"
                    loading={loading}
                    onRow={(record) => ({
                      onClick: () => handleViewDetail(record.id),
                      style: { cursor: 'pointer', transition: 'background 0.15s' }
                    })}
                    pagination={{
                      current: reimbPagination.page,
                      pageSize: reimbPagination.pageSize,
                      total: reimbTotal,
                      showTotal: (t) => `共 ${t} 条`,
                      showSizeChanger: true,
                      pageSizeOptions: [10, 20, 50],
                      onChange: (page, pageSize) => setReimbPagination({ page, pageSize }),
                      style: { margin: '8px 16px' }
                    }}
                    size="middle"
                    locale={{
                      emptyText: (
                        <div style={{ padding: '40px 0' }}>
                          <InboxOutlined style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 8 }} />
                          <div style={{ color: '#8c8c8c' }}>暂无报销单</div>
                          <Button
                            type="link"
                            style={{ marginTop: 4 }}
                            onClick={() => navigate('/reimbursement/create')}
                          >
                            点击创建第一个报销单
                          </Button>
                        </div>
                      )
                    }}
                  />
                </Card>
              </>
            )
          },
          {
            key: 'history',
            label: '发送历史',
            icon: <HistoryOutlined />,
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Title level={3} style={{ margin: 0 }}>发送历史</Title>
                  <Popconfirm title="确认清空所有发送记录？" onConfirm={handleClearHistory}>
                    <Button danger icon={<DeleteOutlined />}>清空历史</Button>
                  </Popconfirm>
                </div>
                <Card size="small" styles={{ body: { padding: 0 } }}>
                  <Table
                    columns={sentEmailColumns}
                    dataSource={sentEmails}
                    rowKey="id"
                    pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条`, style: { margin: '8px 16px' } }}
                    locale={{
                      emptyText: (
                        <div style={{ padding: '40px 0' }}>
                          <SendOutlined style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 8 }} />
                          <div style={{ color: '#8c8c8c' }}>暂无发送记录</div>
                        </div>
                      )
                    }}
                  />
                </Card>
              </>
            )
          }
        ]}
      />

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            <FileXmlOutlined style={{ color: '#1890ff' }} />
            <span>{detailData?.title ?? '报销单详情'}</span>
            {detailData && (
              <Tag color={statusMap[detailData.status]?.color} style={{ marginLeft: 4 }}>
                {statusMap[detailData.status]?.text}
              </Tag>
            )}
          </Space>
        }
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={760}
        footer={
          detailData ? (
            <Space>
              {detailData.status === 'draft' && (
                <Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); navigate(`/reimbursement/create?editId=${detailData.id}`) }}>
                  编辑
                </Button>
              )}
              {(detailData.status === 'draft' || detailData.status === 'sent') && (
                <Button type="primary" icon={<SendOutlined />} onClick={() => { setDetailOpen(false); handleOpenSendModal(detailData) }}>
                  发送邮件
                </Button>
              )}
              <Button onClick={() => setDetailOpen(false)}>关闭</Button>
            </Space>
          ) : <Button onClick={() => setDetailOpen(false)}>关闭</Button>
        }
      >
        {detailData && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="标题" span={2}>
                <Text strong>{detailData.title}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="目标金额">
                <Text strong>¥{detailData.targetAmount.toFixed(2)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="实际金额">
                {detailData.actualAmount != null ? (
                  <Text strong style={{ color: '#52c41a' }}>¥{detailData.actualAmount.toFixed(2)}</Text>
                ) : <Text type="secondary">-</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="报销事由" span={2}>{detailData.reason || '-'}</Descriptions.Item>
              <Descriptions.Item label="日期">{detailData.date || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(detailData.createdAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            {detailData.invoices && detailData.invoices.length > 0 && (
              <>
                <Divider style={{ marginTop: 20, marginBottom: 12, fontSize: 14 }}>
                  关联发票 ({detailData.invoices.length} 张)
                </Divider>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={detailData.invoices}
                  rowKey="id"
                  onRow={(record: Invoice) => ({
                    onClick: () => {
                      setInvoiceDetailData(record)
                      setInvoiceDetailOpen(true)
                    },
                    style: { cursor: 'pointer', transition: 'background 0.15s' }
                  })}
                  columns={[
                    { title: '发票号码', dataIndex: 'invoiceNumber', width: 200, render: (v: string | null) => v || '-' },
                    { title: '销方名称', dataIndex: 'sellerName', ellipsis: true },
                    { title: '金额', dataIndex: 'totalAmount', width: 120, align: 'right', render: (v: number | null) => v != null ? `¥${v.toFixed(2)}` : '-' },
                    { title: '日期', dataIndex: 'invoiceDate', width: 120 },
                    {
                      title: '类型',
                      key: 'fileType',
                      width: 50,
                      align: 'center',
                      render: (_: unknown, record: Invoice) => fileTypeIcon[record.fileType] || null
                    }
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Send Email Modal */}
      <Modal
        title={<Space><SendOutlined />发送报销单 - {sendTarget?.title ?? ''}</Space>}
        open={sendModalOpen}
        onCancel={() => setSendModalOpen(false)}
        width={900}
        footer={
          <Space>
            <Button icon={<UndoOutlined />} onClick={handleResetTemplate}>
              恢复模板
            </Button>
            <Button onClick={() => setSendModalOpen(false)}>取消</Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={sending}
              onClick={handleSendEmail}
            >
              发送
            </Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>收件人</Text>
          <Input
            prefix={<SendOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="请输入收件人邮箱地址"
            value={sendEmailTo}
            onChange={(e) => setSendEmailTo(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>邮件主题</Text>
          <Input
            value={sendSubject}
            onChange={(e) => setSendSubject(e.target.value)}
            onBlur={() => handleUpdatePreview(sendSubject, sendBody)}
            placeholder="邮件主题"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>邮件正文 (HTML)</Text>
          <Input.TextArea
            rows={6}
            value={sendBody}
            onChange={(e) => setSendBody(e.target.value)}
            onBlur={() => handleUpdatePreview(sendSubject, sendBody)}
            placeholder="邮件正文 HTML"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        <Divider style={{ margin: '8px 0 12px', fontSize: 13, color: '#8c8c8c' }}>邮件预览</Divider>
        <Card size="small" style={{ maxHeight: 300, overflow: 'auto' }}>
          {sendPreviewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: sendPreviewHtml }} />
          ) : (
            <Text type="secondary">加载预览中...</Text>
          )}
        </Card>

        {sendTarget?.emailSentAt && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            上次发送: {dayjs(sendTarget.emailSentAt).format('YYYY-MM-DD HH:mm')} → {sendTarget.emailTo}
          </Text>
        )}
      </Modal>

      {/* Sent Email Detail Modal */}
      <Modal
        title={<Space><EyeOutlined />{sentEmailDetail?.subject ?? '发送详情'}</Space>}
        open={sentDetailOpen}
        onCancel={() => setSentDetailOpen(false)}
        width={700}
        footer={null}
      >
        {sentEmailDetail && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="收件人">{sentEmailDetail.emailTo}</Descriptions.Item>
              <Descriptions.Item label="发送时间">
                {dayjs(sentEmailDetail.sentAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="主题" span={2}>{sentEmailDetail.subject}</Descriptions.Item>
              <Descriptions.Item label="附件数">{sentEmailDetail.attachmentCount} 个</Descriptions.Item>
            </Descriptions>

            <Divider style={{ fontSize: 13, color: '#8c8c8c' }}>邮件正文</Divider>
            <div
              style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #f0f0f0', padding: 16, borderRadius: 8, background: '#fafafa' }}
              dangerouslySetInnerHTML={{ __html: sentEmailDetail.bodyHtml }}
            />
          </div>
        )}
      </Modal>

      {/* Invoice Detail Modal — 复用共享组件 */}
      <InvoiceDetailModal
        invoice={invoiceDetailData}
        open={invoiceDetailOpen}
        onClose={() => setInvoiceDetailOpen(false)}
        editable={false}
      />
    </div>
  )
}
