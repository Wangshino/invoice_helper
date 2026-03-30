import { useState, useEffect, useCallback } from 'react'
import { Timeline, Select, Spin, Empty, Tag, Typography, theme, Card, Button, Modal, App } from 'antd'
import {
  FileTextOutlined,
  DeleteOutlined,
  EditOutlined,
  FormOutlined,
  SendOutlined,
  SaveOutlined,
  UndoOutlined,
  HistoryOutlined,
  ClearOutlined
} from '@ant-design/icons'
import type { OperationLog } from '../../../shared/types'

const { Title, Text } = Typography

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  invoice_import: { label: '导入发票', color: 'blue', icon: <FileTextOutlined /> },
  invoice_delete: { label: '删除发票', color: 'red', icon: <DeleteOutlined /> },
  invoice_batch_delete: { label: '批量删除发票', color: 'red', icon: <DeleteOutlined /> },
  invoice_edit: { label: '编辑发票', color: 'orange', icon: <EditOutlined /> },
  reimbursement_create: { label: '创建报销单', color: 'green', icon: <FormOutlined /> },
  reimbursement_send: { label: '发送报销单', color: 'purple', icon: <SendOutlined /> },
  backup_create: { label: '数据备份', color: 'cyan', icon: <SaveOutlined /> },
  backup_restore: { label: '数据恢复', color: 'gold', icon: <UndoOutlined /> }
}

function formatDetail(action: string, detailStr: string | null): string {
  if (!detailStr) return ''
  try {
    const detail = JSON.parse(detailStr)
    switch (action) {
      case 'invoice_import':
        return `导入了 ${detail.count} 张发票`
      case 'invoice_delete':
        return detail.invoiceNumber ? `发票号码: ${detail.invoiceNumber}` : ''
      case 'invoice_batch_delete':
        return `批量删除了 ${detail.count} 张发票`
      case 'invoice_edit':
        return `修改了 ${detail.changedFields?.join(', ')} 字段`
      case 'reimbursement_create':
        return `标题: ${detail.title}`
      case 'reimbursement_send':
        return `发送至 ${detail.emailTo}，报销单: ${detail.title}`
      case 'backup_create':
        return `备份文件: ${detail.filePath}`
      case 'backup_restore':
        return `恢复文件: ${detail.filePath}`
      default:
        return detailStr
    }
  } catch {
    return detailStr
  }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr + 'Z')
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `今天 ${time}`
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + time
}

export default function OperationLogs(): React.ReactElement {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | undefined>(undefined)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const res = await window.api.operationLogs.getRecent(200)
    if (res.success && res.data) {
      setLogs(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const filteredLogs = filter ? logs.filter(l => l.action === filter) : logs
  const actionOptions = Object.entries(ACTION_CONFIG).map(([key, cfg]) => ({
    value: key,
    label: cfg.label
  }))

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HistoryOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
          <Title level={4} style={{ margin: 0 }}>操作日志</Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            allowClear
            placeholder="筛选操作类型"
            style={{ width: 180 }}
            options={actionOptions}
            value={filter}
            onChange={setFilter}
          />
          <Button
            danger
            size="small"
            icon={<ClearOutlined />}
            disabled={logs.length === 0}
            onClick={() => {
              Modal.confirm({
                title: '清除操作日志',
                content: '确定要清除所有操作日志吗？此操作不可撤销。',
                okText: '确定清除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: async () => {
                  const res = await window.api.operationLogs.clearAll()
                  if (res.success) {
                    message.success('操作日志已清除')
                    fetchLogs()
                  }
                }
              })
            }}
          >
            清除日志
          </Button>
        </div>
      </div>

      <Card
        style={{ borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}` }}
        styles={{ body: { padding: '24px 24px 8px' } }}
      >
        <Spin spinning={loading}>
          {filteredLogs.length === 0 ? (
            <Empty description={loading ? '加载中...' : '暂无操作记录'} style={{ padding: '40px 0' }} />
          ) : (
            <Timeline
              items={filteredLogs.map(log => {
                const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'default', icon: <HistoryOutlined /> }
                const detailText = formatDetail(log.action, log.detail)
                return {
                  color: cfg.color as 'blue' | 'red' | 'orange' | 'green' | 'purple' | 'cyan' | 'gold' | 'gray',
                  children: (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatTime(log.createdAt)}</Text>
                      </div>
                      {detailText && <Text type="secondary" style={{ fontSize: 13 }}>{detailText}</Text>}
                    </div>
                  )
                }
              })}
            />
          )}
        </Spin>
      </Card>
    </div>
  )
}
