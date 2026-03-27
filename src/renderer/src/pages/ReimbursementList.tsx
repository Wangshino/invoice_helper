import { Button, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'

const { Title } = Typography

const columns: ColumnsType<Record<string, unknown>> = [
  { title: '标题', dataIndex: 'title', key: 'title' },
  { title: '报销事由', dataIndex: 'reason', key: 'reason', ellipsis: true },
  { title: '目标金额', dataIndex: 'target_amount', key: 'target_amount', render: (v: number) => `¥${v?.toFixed(2)}` },
  { title: '实际金额', dataIndex: 'actual_amount', key: 'actual_amount', render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
  { title: '日期', dataIndex: 'date', key: 'date' },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    render: (status: string) => {
      const map: Record<string, { color: string; text: string }> = {
        draft: { color: 'default', text: '草稿' },
        sent: { color: 'blue', text: '已发送' },
        approved: { color: 'green', text: '已批准' },
        rejected: { color: 'red', text: '已驳回' }
      }
      const s = map[status] || { color: 'default', text: status }
      return <Tag color={s.color}>{s.text}</Tag>
    }
  }
]

export default function ReimbursementList(): React.ReactElement {
  const navigate = useNavigate()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>报销单列表</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/reimbursement/create')}>
          新建报销单
        </Button>
      </div>
      <Table columns={columns} dataSource={[]} rowKey="id" pagination={{ pageSize: 20 }} />
    </div>
  )
}
