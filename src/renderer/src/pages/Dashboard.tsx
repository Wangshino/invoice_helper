import { useState, useEffect } from 'react'
import { Card, Col, Row, Statistic, Typography, Table, Tag } from 'antd'
import {
  FileTextOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MailOutlined
} from '@ant-design/icons'
import type { Invoice } from '../../../shared/types'

const { Title, Text } = Typography

export default function Dashboard(): React.ReactElement {
  const [invoiceStats, setInvoiceStats] = useState<{ status: string; count: number; totalAmount: number }[]>([])
  const [reimburseStats, setReimburseStats] = useState<{ status: string; count: number; totalAmount: number }[]>([])
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([])

  useEffect(() => {
    async function load(): Promise<void> {
      const [invRes, reimbRes, recentRes] = await Promise.all([
        window.api.invoices.countByStatus(),
        window.api.reimbursements.countByStatus(),
        window.api.invoices.getAll({})
      ])
      if (invRes.success && invRes.data) setInvoiceStats(invRes.data)
      if (reimbRes.success && reimbRes.data) setReimburseStats(reimbRes.data)
      if (recentRes.success && recentRes.data) {
        setRecentInvoices(recentRes.data.slice(0, 10))
      }
    }
    load()
  }, [])

  const unreimbursed = invoiceStats.find((s) => s.status === 'unreimbursed')
  const reimbursed = invoiceStats.find((s) => s.status === 'reimbursed')
  const draftReimburs = reimburseStats.find((s) => s.status === 'draft')

  return (
    <div>
      <Title level={3}>首页概览</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="未报销发票"
              value={unreimbursed?.count ?? 0}
              prefix={<ClockCircleOutlined />}
              suffix="张"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="未报销金额"
              value={unreimbursed?.totalAmount ?? 0}
              prefix={<DollarOutlined />}
              suffix="元"
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已报销发票"
              value={reimbursed?.count ?? 0}
              prefix={<CheckCircleOutlined />}
              suffix="张"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="草稿报销单"
              value={draftReimburs?.count ?? 0}
              prefix={<FileTextOutlined />}
              suffix="份"
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近发票" size="small">
        {recentInvoices.length === 0 ? (
          <Text type="secondary">暂无发票数据</Text>
        ) : (
          <Table
            dataSource={recentInvoices}
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              { title: '发票号码', dataIndex: 'invoiceNumber', width: 200, render: (v: string | null) => v || '-' },
              { title: '销方名称', dataIndex: 'sellerName', ellipsis: true },
              {
                title: '金额',
                dataIndex: 'totalAmount',
                width: 120,
                render: (v: number | null) => v != null ? `¥${v.toFixed(2)}` : '-'
              },
              {
                title: '来源',
                dataIndex: 'source',
                width: 80,
                render: (s: string) => (
                  <Tag icon={s === 'email' ? <MailOutlined /> : undefined} color={s === 'email' ? 'blue' : 'default'}>
                    {s === 'email' ? '邮件' : '手动'}
                  </Tag>
                )
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 90,
                render: (status: string) => (
                  <Tag color={status === 'reimbursed' ? 'green' : 'orange'}>
                    {status === 'reimbursed' ? '已报销' : '未报销'}
                  </Tag>
                )
              }
            ]}
          />
        )}
      </Card>
    </div>
  )
}
