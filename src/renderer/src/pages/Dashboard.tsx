import { Card, Col, Row, Statistic, Typography } from 'antd'
import {
  FileTextOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'

const { Title } = Typography

export default function Dashboard(): React.ReactElement {
  return (
    <div>
      <Title level={3}>首页概览</Title>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic title="未报销发票" value={0} prefix={<ClockCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="未报销金额" value={0} prefix={<DollarOutlined />} suffix="元" />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已报销发票" value={0} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="本月报销单" value={0} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
