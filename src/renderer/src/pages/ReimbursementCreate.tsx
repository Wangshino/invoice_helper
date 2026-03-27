import { Button, Card, DatePicker, Form, Input, InputNumber, Space, Steps, Typography } from 'antd'
import { DollarOutlined } from '@ant-design/icons'

const { Title } = Typography
const { TextArea } = Input

export default function ReimbursementCreate(): React.ReactElement {
  return (
    <div>
      <Title level={3}>创建报销单</Title>
      <Card style={{ maxWidth: 800 }}>
        <Form layout="vertical">
          <Form.Item label="报销单标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="例如：3月差旅费报销" />
          </Form.Item>
          <Form.Item label="报销事由" name="reason" rules={[{ required: true, message: '请输入事由' }]}>
            <TextArea rows={3} placeholder="请描述报销原因" />
          </Form.Item>
          <Space size="large">
            <Form.Item label="目标报销金额（元）" name="target_amount" rules={[{ required: true }]}>
              <InputNumber
                prefix={<DollarOutlined />}
                min={0}
                precision={2}
                style={{ width: 250 }}
                placeholder="5000.00"
              />
            </Form.Item>
            <Form.Item label="报销日期" name="date" rules={[{ required: true }]}>
              <DatePicker style={{ width: 250 }} />
            </Form.Item>
          </Space>
          <Form.Item>
            <Button type="primary" size="large">智能匹配发票</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
