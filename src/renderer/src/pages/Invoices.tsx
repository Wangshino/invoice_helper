import { Button, Space, Table, Tag, Typography, Upload } from 'antd'
import { InboxOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

const { Title } = Typography

const columns: ColumnsType<Record<string, unknown>> = [
  { title: '发票号码', dataIndex: 'invoice_number', key: 'invoice_number', width: 180 },
  { title: '开票日期', dataIndex: 'invoice_date', key: 'invoice_date', width: 120 },
  { title: '销方名称', dataIndex: 'seller_name', key: 'seller_name', ellipsis: true },
  { title: '金额', dataIndex: 'amount', key: 'amount', width: 120, render: (v: number) => `¥${v?.toFixed(2)}` },
  { title: '税额', dataIndex: 'tax_amount', key: 'tax_amount', width: 100, render: (v: number) => `¥${v?.toFixed(2)}` },
  { title: '价税合计', dataIndex: 'total_amount', key: 'total_amount', width: 120, render: (v: number) => `¥${v?.toFixed(2)}` },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100,
    render: (status: string) => (
      <Tag color={status === 'reimbursed' ? 'green' : 'orange'}>
        {status === 'reimbursed' ? '已报销' : '未报销'}
      </Tag>
    )
  },
  { title: '来源', dataIndex: 'source', key: 'source', width: 80, render: (s: string) => s === 'email' ? '邮件' : '手动' }
]

export default function Invoices(): React.ReactElement {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>发票管理</Title>
        <Space>
          <Upload beforeUpload={() => false} showUploadList={false} multiple accept=".pdf,.ofd,.xml">
            <Button type="primary" icon={<PlusOutlined />}>导入发票</Button>
          </Upload>
          <Button icon={<InboxOutlined />}>拖拽导入</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={[]}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1000 }}
      />
    </div>
  )
}
