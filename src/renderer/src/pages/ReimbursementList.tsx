import { useState, useEffect, useCallback } from 'react'
import {
  App,
  Button,
  Space,
  Table,
  Tag,
  Typography,
  Popconfirm,
  Modal,
  Descriptions,
  Select
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EyeOutlined,
  EditOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import type { Reimbursement, ReimbursementStatus } from '../../../shared/types'

const { Title, Text } = Typography

export default function ReimbursementList(): React.ReactElement {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([])
  const [loading, setLoading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailData, setDetailData] = useState<Reimbursement | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReimbursementStatus | 'all' | undefined>()

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

  useEffect(() => {
    loadList()
  }, [loadList])

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

  const statusMap: Record<string, { color: string; text: string }> = {
    draft: { color: 'default', text: '草稿' },
    sent: { color: 'blue', text: '已发送' },
    approved: { color: 'green', text: '已批准' },
    rejected: { color: 'red', text: '已驳回' }
  }

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

  return (
    <div>
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
    </div>
  )
}
