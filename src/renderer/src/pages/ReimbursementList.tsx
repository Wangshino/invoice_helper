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
  Select,
  Input,
  Divider,
  Card
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  EditOutlined,
  SendOutlined,
  UndoOutlined,
  HistoryOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type { Reimbursement, ReimbursementStatus, SentEmail } from '../../../shared/types'
import { DEFAULT_EMAIL_TEMPLATE } from '../../../shared/types'
import type { EmailTemplateData } from '../../../shared/types'

const { Title, Text } = Typography

export default function ReimbursementList(): React.ReactElement {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [loading, setLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<Reimbursement | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | 'all' | undefined>()
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

  // Load reimbursements
  const loadList = useCallback(async () => {
    setLoading(true)
    const filters = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {}
    const result = await window.api.reimbursements.getAll(filters)
    if (result.success && result.data) {
      setReimbursements(result.data)
    } else {
      message.error('加载失败: ' + (result.error || '未知错误'))
    }
    setLoading(false)
  }, [statusFilter, message])

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

  const handleStatusChange = async (id: number, status: ReimbursementStatus): Promise<void> => {
    const result = await window.api.reimbursements.update(id, { status })
    if (result.success) {
      message.success('状态已更新')
      loadList()
    } else {
      message.error('更新失败: ' + (result.error || '未知错误'))
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

    // Load template
    const tmpl = await loadTemplate()
    setDefaultTemplate(tmpl)
    setSendSubject(tmpl.subjectTemplate)
    setSendBody(tmpl.bodyTemplate)

    // Load preview
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

  const statusMap: Record<string, { color: string; text: string }> = {
    draft: { color: 'default', text: '草稿' },
    sent: { color: 'blue', text: '已发送' },
    approved: { color: 'green', text: '已批准' },
    rejected: { color: 'red', text: '已驳回' }
  }

  // ===================== Columns =====================

  const columns: ColumnsType<Reimbursement> = [
    { title: '标题', dataIndex: 'title', key: 'title', width: 200, ellipsis: true },
    { title: '报销事由', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: '目标金额',
      dataIndex: 'targetAmount',
      key: 'targetAmount',
      width: 120,
      render: (v: number) => <Text>¥{v.toFixed(2)}</Text>
    },
    {
      title: '实际金额',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 120,
      render: (v: number | null) => v != null ? <Text type="success">¥{v.toFixed(2)}</Text> : '-'
    },
    { title: '日期', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = statusMap[status] || { color: 'default', text: status }
        return <Tag color={s.color}>{s.text}</Tag>
      }
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: Reimbursement) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.id)}>
            详情
          </Button>
          {(record.status === 'draft' || record.status === 'sent') && (
            <Button type="link" size="small" icon={<SendOutlined />} onClick={() => handleOpenSendModal(record)}>
              发送
            </Button>
          )}
          {record.status === 'draft' && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => navigate('/reimbursement/create')}>
                编辑
              </Button>
              <Select
                size="small"
                value={record.status}
                style={{ width: 90 }}
                onChange={(v) => handleStatusChange(record.id, v)}
              >
                <Select.Option value="draft">草稿</Select.Option>
                <Select.Option value="sent">已发送</Select.Option>
                <Select.Option value="approved">已批准</Select.Option>
                <Select.Option value="rejected">已驳回</Select.Option>
              </Select>
            </>
          )}
          <Popconfirm title="确认删除此报销单？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  const sentEmailColumns: ColumnsType<SentEmail> = [
    { title: '收件人', dataIndex: 'emailTo', width: 200 },
    { title: '主题', dataIndex: 'subject', ellipsis: true },
    {
      title: '附件数',
      dataIndex: 'attachmentCount',
      width: 80,
      render: (v: number) => `${v} 个`
    },
    {
      title: '发送时间',
      dataIndex: 'sentAt',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, record: SentEmail) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => {
            setSentEmailDetail(record)
            setSentDetailOpen(true)
          }}>
            查看
          </Button>
          <Popconfirm title="确认删除此记录？" onConfirm={() => handleDeleteSentEmail(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'list',
            label: '报销单列表',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Title level={3} style={{ margin: 0 }}>报销单列表</Title>
                  <Space>
                    <Select
                      style={{ width: 120 }}
                      placeholder="状态筛选"
                      allowClear
                      value={statusFilter}
                      onChange={setStatusFilter}
                    >
                      <Select.Option value="all">全部</Select.Option>
                      <Select.Option value="draft">草稿</Select.Option>
                      <Select.Option value="sent">已发送</Select.Option>
                      <Select.Option value="approved">已批准</Select.Option>
                      <Select.Option value="rejected">已驳回</Select.Option>
                    </Select>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/reimbursement/create')}>
                      新建报销单
                    </Button>
                  </Space>
                </div>
                <Table
                  columns={columns}
                  dataSource={reimbursements}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
                  locale={{ emptyText: '暂无报销单，点击「新建报销单」开始' }}
                />
              </>
            )
          },
          {
            key: 'history',
            label: '发送历史',
            icon: <HistoryOutlined />,
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Title level={3} style={{ margin: 0 }}>发送历史</Title>
                  <Popconfirm title="确认清空所有发送记录？" onConfirm={handleClearHistory}>
                    <Button danger>清空历史</Button>
                  </Popconfirm>
                </div>
                <Table
                  columns={sentEmailColumns}
                  dataSource={sentEmails}
                  rowKey="id"
                  pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
                  locale={{ emptyText: '暂无发送记录' }}
                />
              </>
            )
          }
        ]}
      />

      {/* Detail Modal */}
      <Modal
        title={detailData ? `报销单详情 - ${detailData.title}` : '详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={700}
        footer={null}
      >
        {detailData && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="标题">{detailData.title}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detailData.status]?.color}>{statusMap[detailData.status]?.text}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="目标金额">¥{detailData.targetAmount.toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="实际金额">
                {detailData.actualAmount != null ? `¥${detailData.actualAmount.toFixed(2)}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="报销事由" span={2}>{detailData.reason}</Descriptions.Item>
              <Descriptions.Item label="日期">{detailData.date}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(detailData.createdAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
            </Descriptions>

            {detailData.invoices && detailData.invoices.length > 0 && (
              <>
                <Title level={5} style={{ marginTop: 16 }}>关联发票 ({detailData.invoices.length})</Title>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={detailData.invoices}
                  rowKey="id"
                  columns={[
                    { title: '发票号码', dataIndex: 'invoiceNumber', width: 200, render: (v: string | null) => v || '-' },
                    { title: '销方名称', dataIndex: 'sellerName', ellipsis: true },
                    { title: '金额', dataIndex: 'totalAmount', width: 120, render: (v: number | null) => v != null ? `¥${v.toFixed(2)}` : '-' },
                    { title: '日期', dataIndex: 'invoiceDate', width: 120 }
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Send Email Modal */}
      <Modal
        title={`发送报销单 - ${sendTarget?.title ?? ''}`}
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
        <div style={{ marginBottom: 12 }}>
          <Text strong>收件人</Text>
          <Input
            prefix={<SendOutlined />}
            placeholder="请输入收件人邮箱地址"
            value={sendEmailTo}
            onChange={(e) => setSendEmailTo(e.target.value)}
            style={{ marginTop: 4 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text strong>邮件主题</Text>
          <Input
            value={sendSubject}
            onChange={(e) => setSendSubject(e.target.value)}
            onBlur={() => handleUpdatePreview(sendSubject, sendBody)}
            placeholder="邮件主题"
            style={{ marginTop: 4 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Text strong>邮件正文 (HTML)</Text>
          <Input.TextArea
            rows={6}
            value={sendBody}
            onChange={(e) => setSendBody(e.target.value)}
            onBlur={() => handleUpdatePreview(sendSubject, sendBody)}
            placeholder="邮件正文 HTML"
            style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        <Divider style={{ margin: '12px 0' }}>预览</Divider>
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
        title={`发送详情 - ${sentEmailDetail?.subject ?? ''}`}
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

            <Divider>邮件正文</Divider>
            <div
              style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #e8e8e8', padding: 12, borderRadius: 4 }}
              dangerouslySetInnerHTML={{ __html: sentEmailDetail.bodyHtml }}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
