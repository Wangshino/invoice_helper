import { useState, useCallback } from 'react'
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Space,
  Typography,
  Table,
  Tag,
  Collapse,
  Result
} from 'antd'
import {
  DollarOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  SaveOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Invoice } from '../../../shared/types'

const { Title, Text } = Typography
const { TextArea } = Input

interface MatchingResult {
  totalAmount: number
  invoices: Invoice[]
  invoiceCount: number
  difference: number
  isExact: boolean
}

export default function ReimbursementCreate(): React.ReactElement {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [matching, setMatching] = useState(false)
  const [matchResults, setMatchResults] = useState<MatchingResult[]>([])
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null)

  const handleMatch = useCallback(async () => {
    const targetAmount = form.getFieldValue('target_amount')
    if (!targetAmount || targetAmount <= 0) {
      message.warning('请先输入目标报销金额')
      return
    }
    setMatching(true)
    setMatchResults([])
    setSelectedPlan(null)
    try {
      const result = await window.api.matching.findBestCombinations(Number(targetAmount))
      if (result.success && result.data) {
        setMatchResults(result.data)
        if (result.data.length === 0) {
          message.info('未找到匹配的发票组合')
        } else {
          message.success(`找到 ${result.data.length} 个匹配方案`)
        }
      } else {
        message.error('匹配失败: ' + (result.error || '未知错误'))
      }
    } finally {
      setMatching(false)
    }
  }, [form, message])

  const handleSave = useCallback(async (status: 'draft' | 'sent') => {
    setSaving(true)
    try {
      const values = await form.validateFields()
      const selectedPlanData = matchResults[selectedPlan ?? 0]

      const params = {
        title: values.title,
        reason: values.reason,
        targetAmount: values.target_amount,
        actualAmount: selectedPlanData?.totalAmount,
        date: values.date.format('YYYY-MM-DD'),
        status,
        invoiceIds: selectedPlanData?.invoices.map((inv: Invoice) => inv.id)
      }

      const result = await window.api.reimbursements.create(params)
      if (result.success) {
        message.success(status === 'draft' ? '报销单已保存为草稿' : '报销单已创建')
        navigate('/reimbursement/list')
      } else {
        message.error('创建失败: ' + (result.error || '未知错误'))
      }
    } catch {
      // form validation error
    } finally {
      setSaving(false)
    }
  }, [form, matchResults, selectedPlan, message, navigate])

  const planColumns = [
    {
      title: '方案',
      width: 80,
      render: (_: unknown, __: unknown, index: number) => (
        <Tag color={selectedPlan === index ? 'blue' : 'default'}>
          方案 {index + 1}
        </Tag>
      )
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      width: 120,
      render: (v: number) => <Text strong>¥{v.toFixed(2)}</Text>
    },
    {
      title: '差额',
      dataIndex: 'difference',
      width: 100,
      render: (v: number) => (
        <Text type={v > 0 ? 'warning' : 'success'}>
          {v > 0 ? `差 ¥${v.toFixed(2)}` : v === 0 ? '精确匹配' : `多 ¥${Math.abs(v).toFixed(2)}`}
        </Text>
      )
    },
    { title: '发票数', dataIndex: 'invoiceCount', width: 80 },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, __: unknown, index: number) => (
        <Button
          type={selectedPlan === index ? 'primary' : 'default'}
          size="small"
          icon={<CheckCircleOutlined />}
          onClick={() => setSelectedPlan(index)}
        >
          {selectedPlan === index ? '已选' : '选择'}
        </Button>
      )
    }
  ]

  return (
    <div>
      <Title level={3}>创建报销单</Title>
      <Card style={{ height: '100%' }}>
        <Form form={form} layout="vertical">
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
            <Form.Item label="报销日期" name="date" rules={[{ required: true }]} initialValue={dayjs()}>
              <DatePicker style={{ width: 250 }} />
            </Form.Item>
          </Space>
          <Form.Item>
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              loading={matching}
              onClick={handleMatch}
            >
              智能匹配发票
            </Button>
          </Form.Item>
        </Form>

        {/* Matching Results */}
        {matchResults.length > 0 && (
          <>
            <Divider>匹配方案（点击选择一个方案）</Divider>
            <Table
              columns={planColumns}
              dataSource={matchResults}
              rowKey={(_, index) => String(index)}
              size="small"
              pagination={false}
              onRow={(_, index) => ({
                onClick: () => setSelectedPlan(index ?? null),
                style: { cursor: 'pointer', background: selectedPlan === index ? '#e6f7ff' : undefined }
              })}
            />

            {/* Selected plan detail */}
            {selectedPlan !== null && matchResults[selectedPlan] && (
              <Card
                size="small"
                title={`方案 ${selectedPlan + 1} 详情`}
                style={{ marginTop: 16 }}
              >
                <Descriptions column={3} size="small">
                  <Descriptions.Item label="总金额">
                    <Text strong>¥{matchResults[selectedPlan].totalAmount.toFixed(2)}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="差额">
                    <Text type={matchResults[selectedPlan].difference > 0 ? 'warning' : 'success'}>
                      ¥{matchResults[selectedPlan].difference.toFixed(2)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="匹配状态">
                    {matchResults[selectedPlan].isExact
                      ? <Tag color="green">精确匹配</Tag>
                      : <Tag color="orange">近似匹配</Tag>
                    }
                  </Descriptions.Item>
                </Descriptions>

                <Collapse
                  size="small"
                  items={[{
                    key: 'invoices',
                    label: `包含发票 (${matchResults[selectedPlan].invoiceCount} 张)`,
                    children: (
                      <Table
                        size="small"
                        pagination={false}
                        dataSource={matchResults[selectedPlan].invoices}
                        rowKey="id"
                        columns={[
                          { title: '发票号码', dataIndex: 'invoiceNumber', width: 200, render: (v: string | null) => v || '-' },
                          { title: '销方名称', dataIndex: 'sellerName', ellipsis: true },
                          { title: '金额', dataIndex: 'totalAmount', width: 120, render: (v: number | null) => v != null ? `¥${v.toFixed(2)}` : '-' },
                          { title: '日期', dataIndex: 'invoiceDate', width: 120 }
                        ]}
                      />
                    )
                  }]}
                />
              </Card>
            )}

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => navigate('/reimbursement')}>取消</Button>
                <Button
                  icon={<SaveOutlined />}
                  onClick={() => handleSave('draft')}
                  disabled={selectedPlan === null}
                >
                  保存草稿
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleSave('draft')}
                  disabled={selectedPlan === null}
                  loading={saving}
                >
                  确认创建
                </Button>
              </Space>
            </div>
          </>
        )}

        {matchResults.length === 0 && !matching && (
          <Result
            icon={<ThunderboltOutlined style={{ color: '#1890ff' }} />}
            title="输入目标金额后点击「智能匹配发票」"
            subTitle="系统将自动从未报销发票中找到最佳组合方案"
          />
        )}
      </Card>
    </div>
  )
}
