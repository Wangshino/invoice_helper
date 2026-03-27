import { Button, Card, Empty, List, Typography, Space, Select, Tag } from 'antd'
import { SyncOutlined, MailOutlined } from '@ant-design/icons'

const { Title } = Typography

export default function EmailImport(): React.ReactElement {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>邮件导入</Title>
        <Space>
          <Select placeholder="选择邮箱账户" style={{ width: 250 }} />
          <Button type="primary" icon={<SyncOutlined />}>同步邮件</Button>
        </Space>
      </div>
      <Card>
        <Empty
          image={<MailOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
          description="请先配置邮箱账户，然后同步邮件以导入发票"
        />
      </Card>
    </div>
  )
}
