import { useState, useEffect, useCallback } from 'react'
import {
  App,
  Button,
  Card,
  Empty,
  Typography,
  Space,
  Select,
  Statistic,
  Row,
  Col,
  Table,
  Tag,
  Alert,
  Divider,
  Switch,
  Popconfirm,
  Tabs,
  Modal
} from 'antd'
import {
  SyncOutlined,
  MailOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  InboxOutlined,
  BugOutlined,
  ClearOutlined,
  CopyOutlined,
  UndoOutlined,
  HistoryOutlined,
  DeleteOutlined,
  EyeOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { EmailAccount, EmailSyncResult, SyncLog } from '../../../shared/types'

const { Title, Text } = Typography

export default function EmailImport(): React.ReactElement {
  const { message } = App.useApp()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<EmailSyncResult | null>(null)

  // Debug state
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [syncLog, setSyncLog] = useState('')

  // Sync log history state
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [logDetail, setLogDetail] = useState<SyncLog | null>(null)
  const [logDetailOpen, setLogDetailOpen] = useState(false)

  const loadAccounts = useCallback(async () => {
    const result = await window.api.emailAccounts.getAll()
    if (result.success && result.data) {
      setAccounts(result.data)
      if (result.data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(result.data[0].id)
      }
    }
  }, [selectedAccountId])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // Load sync log history
  const loadSyncLogs = useCallback(async () => {
    const result = await window.api.syncLogs.getAll(selectedAccountId ?? undefined)
    if (result.success && result.data) {
      setSyncLogs(result.data)
    }
  }, [selectedAccountId])

  useEffect(() => {
    loadSyncLogs()
  }, [loadSyncLogs])

  // Load debug log when debug is enabled
  const refreshLog = useCallback(async () => {
    if (!debugEnabled) return
    const result = await window.api.emailSync.getLog()
    if (result.success && result.data !== undefined) {
      setSyncLog(result.data)
    }
  }, [debugEnabled])

  useEffect(() => {
    if (debugEnabled) {
      refreshLog()
      const timer = setInterval(refreshLog, 2000)
      return () => clearInterval(timer)
    }
    return undefined
  }, [debugEnabled, refreshLog])

  const handleToggleDebug = async (enabled: boolean): Promise<void> => {
    setDebugEnabled(enabled)
    await window.api.emailSync.setDebug(enabled)
    if (!enabled) {
      setSyncLog('')
    }
  }

  const handleClearLog = async (): Promise<void> => {
    await window.api.emailSync.clearLog()
    setSyncLog('')
    message.success('日志已清空')
  }

  const handleCopyLog = (): void => {
    navigator.clipboard.writeText(syncLog)
    message.success('已复制到剪贴板')
  }

  const handleSync = async (): Promise<void> => {
    if (!selectedAccountId) {
      message.warning('请先选择邮箱账户')
      return
    }
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await window.api.emailAccounts.syncEmails(selectedAccountId)
      if (result.success && result.data) {
        setSyncResult(result.data)
        if (result.data.imported.length > 0) {
          message.success(`同步完成: 成功导入 ${result.data.imported.length} 张发票`)
        } else {
          message.info('同步完成: 没有新的发票')
        }
        if (debugEnabled) refreshLog()
        loadSyncLogs()
      } else {
        message.error('同步失败: ' + (result.error || '未知错误'))
        if (debugEnabled) refreshLog()
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleResetSync = async (): Promise<void> => {
    if (!selectedAccountId) return
    const result = await window.api.emailAccounts.resetSync(selectedAccountId)
    if (result.success) {
      message.success('同步进度已重置，下次同步将从头开始')
    } else {
      message.error('重置失败: ' + (result.error || '未知错误'))
    }
  }

  const handleDeleteSyncLog = async (id: number): Promise<void> => {
    const result = await window.api.syncLogs.remove(id)
    if (result.success) {
      message.success('已删除')
      loadSyncLogs()
    }
  }

  const handleClearAllLogs = async (): Promise<void> => {
    const result = selectedAccountId
      ? await window.api.syncLogs.clearByAccount(selectedAccountId)
      : await window.api.syncLogs.clearAll()
    if (result.success) {
      message.success('已清空所有记录')
      loadSyncLogs()
    }
  }

  const handleViewLogDetail = (log: SyncLog): void => {
    setLogDetail(log)
    setLogDetailOpen(true)
  }

  const importedColumns: ColumnsType<EmailSyncResult['imported'][0]> = [
    { title: '发票号码', dataIndex: 'invoiceNumber', width: 200 },
    { title: '金额', dataIndex: 'totalAmount', width: 120, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '销方名称', dataIndex: 'sellerName', ellipsis: true },
    { title: '开票日期', dataIndex: 'invoiceDate', width: 120 }
  ]

  const skippedColumns: ColumnsType<EmailSyncResult['skipped'][0]> = [
    { title: '文件名', dataIndex: 'fileName', ellipsis: true },
    { title: '发票号码', dataIndex: 'invoiceNumber', width: 200, render: (v?: string) => v || '-' },
    {
      title: '原因',
      dataIndex: 'reason',
      width: 160,
      render: (reason: string) => {
        const map: Record<string, { color: string; text: string }> = {
          duplicate: { color: 'orange', text: '已存在' },
          no_invoice_number: { color: 'default', text: '无发票号码' },
          same_invoice_in_email: { color: 'orange', text: '邮件内重复' },
          no_invoice_attachment: { color: 'default', text: '无发票附件' }
        }
        const info = map[reason] || { color: 'default', text: reason }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    }
  ]

  const failedColumns: ColumnsType<EmailSyncResult['failed'][0]> = [
    { title: '文件名', dataIndex: 'fileName', ellipsis: true },
    { title: '错误信息', dataIndex: 'error', ellipsis: true, render: (v: string) => <Text type="danger">{v}</Text> }
  ]

  const syncLogColumns: ColumnsType<SyncLog> = [
    {
      title: '同步时间',
      dataIndex: 'syncedAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN')
    },
    {
      title: '扫描',
      dataIndex: 'scanned',
      width: 70,
      align: 'center',
      render: (v: number) => <Text>{v}</Text>
    },
    {
      title: '导入',
      dataIndex: 'imported',
      width: 70,
      align: 'center',
      render: (v: number) => <Text style={{ color: '#52c41a' }}>{v}</Text>
    },
    {
      title: '跳过',
      dataIndex: 'skipped',
      width: 70,
      align: 'center',
      render: (v: number) => <Text style={{ color: '#faad14' }}>{v}</Text>
    },
    {
      title: '失败',
      dataIndex: 'failed',
      width: 70,
      align: 'center',
      render: (v: number) => <Text style={{ color: '#ff4d4f' }}>{v}</Text>
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: SyncLog) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewLogDetail(record)}
          >
            详情
          </Button>
          <Popconfirm title="确定删除此记录？" onConfirm={() => handleDeleteSyncLog(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  // Find account name for a sync log
  const getAccountName = (accountId: number): string => {
    const acc = accounts.find((a) => a.id === accountId)
    return acc ? `${acc.name} (${acc.email})` : `#${accountId}`
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>邮件导入</Title>
        <Space>
          <Select
            placeholder="选择邮箱账户"
            style={{ width: 250 }}
            value={selectedAccountId ?? undefined}
            onChange={setSelectedAccountId}
            options={accounts.map((a) => ({ label: `${a.name} (${a.email})`, value: a.id }))}
            notFoundContent="请先在邮箱配置中添加账户"
          />
          <Button
            type="primary"
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSync}
            disabled={!selectedAccountId}
          >
            {syncing ? '同步中...' : '同步邮件'}
          </Button>
          <Popconfirm
            title="重置同步进度"
            description="将清除同步记录，下次同步将重新扫描所有邮件"
            onConfirm={handleResetSync}
          >
            <Button
              icon={<UndoOutlined />}
              disabled={!selectedAccountId || syncing}
            >
              重新同步
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Tabs
        items={[
          {
            key: 'sync',
            label: '同步',
            children: (
              <>
                {accounts.length === 0 ? (
                  <Card>
                    <Empty
                      image={<MailOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                      description="请先在邮箱配置页面添加邮箱账户"
                    />
                  </Card>
                ) : syncResult ? (
                  <div>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={6}>
                        <Card>
                          <Statistic
                            title="扫描邮件"
                            value={syncResult.totalScanned}
                            prefix={<InboxOutlined />}
                            suffix="封"
                          />
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card>
                          <Statistic
                            title="成功导入"
                            value={syncResult.imported.length}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                            suffix="张"
                          />
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card>
                          <Statistic
                            title="跳过"
                            value={syncResult.skipped.length}
                            prefix={<MinusCircleOutlined />}
                            valueStyle={{ color: '#faad14' }}
                            suffix="张"
                          />
                        </Card>
                      </Col>
                      <Col span={6}>
                        <Card>
                          <Statistic
                            title="失败"
                            value={syncResult.failed.length}
                            prefix={<CloseCircleOutlined />}
                            valueStyle={{ color: '#ff4d4f' }}
                            suffix="张"
                          />
                        </Card>
                      </Col>
                    </Row>

                    {syncResult.imported.length > 0 && (
                      <>
                        <Divider>成功导入 ({syncResult.imported.length})</Divider>
                        <Table
                          columns={importedColumns}
                          dataSource={syncResult.imported}
                          rowKey="id"
                          size="small"
                          pagination={false}
                        />
                      </>
                    )}

                    {syncResult.skipped.length > 0 && (
                      <>
                        <Divider>跳过 ({syncResult.skipped.length})</Divider>
                        <Table
                          columns={skippedColumns}
                          dataSource={syncResult.skipped}
                          rowKey="fileName"
                          size="small"
                          pagination={false}
                        />
                      </>
                    )}

                    {syncResult.failed.length > 0 && (
                      <>
                        <Divider>失败 ({syncResult.failed.length})</Divider>
                        <Alert
                          type="error"
                          showIcon
                          message="部分文件解析失败"
                          style={{ marginBottom: 12 }}
                        />
                        <Table
                          columns={failedColumns}
                          dataSource={syncResult.failed}
                          rowKey="fileName"
                          size="small"
                          pagination={false}
                        />
                      </>
                    )}

                    {syncResult.lastSyncUid > 0 && (
                      <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                        同步进度: UID {syncResult.lastSyncUid}
                      </Text>
                    )}
                  </div>
                ) : (
                  <Card>
                    <Empty
                      image={<MailOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                      description="选择邮箱账户后点击「同步邮件」开始导入发票"
                    />
                  </Card>
                )}
              </>
            )
          },
          {
            key: 'logs',
            label: (
              <Space>
                <HistoryOutlined />
                同步记录
              </Space>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text type="secondary">
                    共 {syncLogs.length} 条同步记录
                  </Text>
                  <Popconfirm
                    title="确定清空所有同步记录？"
                    description="此操作不可恢复"
                    onConfirm={handleClearAllLogs}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={syncLogs.length === 0}>
                      清空全部
                    </Button>
                  </Popconfirm>
                </div>
                <Table
                  columns={[
                    ...(!selectedAccountId ? [{
                      title: '账户',
                      dataIndex: 'emailAccountId',
                      width: 200,
                      render: (v: number) => getAccountName(v)
                    }] : []),
                    ...syncLogColumns
                  ]}
                  dataSource={syncLogs}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                />
              </div>
            )
          },
          {
            key: 'debug',
            label: (
              <Space>
                <BugOutlined />
                调试日志
                <Switch
                  size="small"
                  checked={debugEnabled}
                  onChange={handleToggleDebug}
                />
              </Space>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text type="secondary">开启后记录详细同步日志，用于排查问题</Text>
                  {debugEnabled && (
                    <Space style={{ marginLeft: 'auto' }}>
                      <Button size="small" icon={<CopyOutlined />} onClick={handleCopyLog} disabled={!syncLog}>
                        复制
                      </Button>
                      <Button size="small" icon={<ClearOutlined />} onClick={handleClearLog} disabled={!syncLog}>
                        清空
                      </Button>
                    </Space>
                  )}
                </div>
                {debugEnabled ? (
                  <Card
                    style={{
                      backgroundColor: '#1e1e1e',
                      maxHeight: 400,
                      overflow: 'auto'
                    }}
                  >
                    <pre
                      style={{
                        color: '#d4d4d4',
                        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                        fontSize: 12,
                        lineHeight: 1.5,
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {syncLog || '暂无日志，请先同步邮件'}
                    </pre>
                  </Card>
                ) : (
                  <Card>
                    <Empty description="请开启调试日志开关" />
                  </Card>
                )}
              </div>
            )
          }
        ]}
      />

      {/* Log Detail Modal */}
      <Modal
        title={logDetail ? `同步详情 - ${new Date(logDetail.syncedAt).toLocaleString('zh-CN')}` : '同步详情'}
        open={logDetailOpen}
        onCancel={() => setLogDetailOpen(false)}
        footer={null}
        width={700}
      >
        {logDetail && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic title="扫描" value={logDetail.scanned} suffix="封" />
              </Col>
              <Col span={6}>
                <Statistic title="导入" value={logDetail.imported} suffix="张" valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={6}>
                <Statistic title="跳过" value={logDetail.skipped} suffix="张" valueStyle={{ color: '#faad14' }} />
              </Col>
              <Col span={6}>
                <Statistic title="失败" value={logDetail.failed} suffix="张" valueStyle={{ color: '#ff4d4f' }} />
              </Col>
            </Row>
            {logDetail.fullLog && (
              <Card
                title="完整日志"
                size="small"
                style={{
                  backgroundColor: '#1e1e1e',
                  maxHeight: 500,
                  overflow: 'auto'
                }}
                bodyStyle={{ padding: 12 }}
              >
                <pre
                  style={{
                    color: '#d4d4d4',
                    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                    fontSize: 11,
                    lineHeight: 1.4,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}
                >
                  {logDetail.fullLog}
                </pre>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
