import { Button, Card, Form, Input, InputNumber, List, Modal, Space, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'

const { Title } = Typography

export default function EmailSettings(): React.ReactElement {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>邮箱配置</Title>
        <Button type="primary" icon={<PlusOutlined />}>添加邮箱</Button>
      </div>
      <Card>
        <Empty description="暂无邮箱账户，点击上方按钮添加" />
      </Card>
    </div>
  )
}

function Empty({ description }: { description: string }): React.ReactElement {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
      {description}
    </div>
  )
}
