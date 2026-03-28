import { useState, useEffect, useCallback } from 'react'
import {
  App,
  Button,
  Table,
  Typography,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Popconfirm,
  Tag
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  FolderOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type {
  EmailAccount,
  EmailProvider,
  EmailProviderPreset
} from '../../../shared/types'

const { Title, Text } = Typography

// ============ Provider Presets ============

const EMAIL_PRESETS: Record<EmailProvider, EmailProviderPreset> = {
  qq: { name: 'QQ邮箱', imapHost: 'imap.qq.com', imapPort: 993, smtpHost: 'smtp.qq.com', smtpPort: 465 },
  '163': { name: '163邮箱', imapHost: 'imap.163.com', imapPort: 993, smtpHost: 'smtp.163.com', smtpPort: 465 },
  '126': { name: '126邮箱', imapHost: 'imap.126.com', imapPort: 993, smtpHost: 'smtp.126.com', smtpPort: 465 },
  gmail: { name: 'Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465 },
  outlook: { name: 'Outlook', imapHost: 'outlook.office365.com', imapPort: 993, smtpHost: 'smtp.office365.com', smtpPort: 587 },
  sina: { name: '新浪邮箱', imapHost: 'imap.sina.com', imapPort: 993, smtpHost: 'smtp.sina.com', smtpPort: 465 },
  custom: { name: '自定义', imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465 }
}

export default function EmailSettings(): React.ReactElement {
  const { message } = App.useApp()
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)
  const [form] = Form.useForm()

  // Folder listing state
  const [folders, setFolders] = useState<string[]>([])
  const [loadingFolders, setLoadingFolders] = useState(false)

  // Watch provider for auto-fill
  const provider = Form.useWatch('provider', form) as EmailProvider | undefined

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    const result = await window.api.emailAccounts.getAll()
    if (result.success && result.data) {
      setAccounts(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // Auto-fill when provider changes
  useEffect(() => {
    if (provider && provider !== 'custom') {
      const preset = EMAIL_PRESETS[provider]
      form.setFieldsValue({
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        smtpHost: preset.smtpHost,
        smtpPort: preset.smtpPort
      })
    }
  }, [provider, form])

  const openCreate = (): void => {
    setEditingId(null)
    setFolders([])
    form.resetFields()
    form.setFieldsValue({
      provider: 'qq',
      imapPort: 993,
      smtpPort: 465,
      mailFolder: 'INBOX',
      syncLimit: 200
    })
    setModalOpen(true)
  }

  const openEdit = (record: EmailAccount): void => {
    setEditingId(record.id)
    setFolders([])
    form.setFieldsValue({
      provider: 'custom',
      name: record.name,
      email: record.email,
      imapHost: record.imapHost,
      imapPort: record.imapPort,
      smtpHost: record.smtpHost,
      smtpPort: record.smtpPort,
      password: '', // 不回填密码
      mailFolder: record.mailFolder,
      syncLimit: record.syncLimit
    })
    setModalOpen(true)
  }

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      const params = {
        name: values.name,
        email: values.email,
        imapHost: values.imapHost,
        imapPort: values.imapPort,
        smtpHost: values.smtpHost,
        smtpPort: values.smtpPort,
        password: values.password,
        mailFolder: values.mailFolder || 'INBOX',
        syncLimit: values.syncLimit || 200
      }

      if (editingId) {
        const updateParams: Record<string, unknown> = { ...params }
        if (!updateParams.password) delete updateParams.password
        const result = await window.api.emailAccounts.update(editingId, updateParams)
        if (result.success) {
          message.success('更新成功')
          setModalOpen(false)
          loadAccounts()
        } else {
          message.error('更新失败: ' + (result.error || '未知错误'))
        }
      } else {
        const result = await window.api.emailAccounts.create(params)
        if (result.success) {
          message.success('添加成功')
          setModalOpen(false)
          loadAccounts()
        } else {
          message.error('添加失败: ' + (result.error || '未知错误'))
        }
      }
    } catch {
      // validation failed
    }
  }

  const handleDelete = async (id: number): Promise<void> => {
    const result = await window.api.emailAccounts.remove(id)
    if (result.success) {
      message.success('删除成功')
      loadAccounts()
    } else {
      message.error('删除失败: ' + (result.error || '未知错误'))
    }
  }

  // 测试连接: 编辑模式使用已存储密码，创建模式使用表单密码
  const handleTestConnection = async (): Promise<void> => {
    try {
      setTesting(true)
      if (editingId) {
        // 编辑模式: 用已存储的密码测试
        const result = await window.api.emailAccounts.testConnectionById(editingId)
        if (result.success && result.data) {
          message.success('连接测试成功')
        } else {
          message.error('连接失败: ' + (result.error || '请检查配置'))
        }
      } else {
        // 创建模式: 用表单中的密码测试
        const values = await form.validateFields(['email', 'imapHost', 'imapPort', 'password'])
        const result = await window.api.emailAccounts.testConnection({
          name: '',
          email: values.email,
          imapHost: values.imapHost,
          imapPort: values.imapPort,
          smtpHost: values.smtpHost || '',
          smtpPort: values.smtpPort || 465,
          password: values.password
        })
        if (result.success && result.data) {
          message.success('连接测试成功')
        } else {
          message.error('连接失败: ' + (result.error || '请检查配置'))
        }
      }
    } catch {
      message.warning('请先填写必要字段')
    } finally {
      setTesting(false)
    }
  }

  // 获取文件夹列表
  const handleListFolders = async (): Promise<void> => {
    try {
      setLoadingFolders(true)
      let result
      if (editingId) {
        result = await window.api.emailAccounts.listFoldersById(editingId)
      } else {
        const values = await form.validateFields(['email', 'imapHost', 'imapPort', 'password'])
        result = await window.api.emailAccounts.listFolders({
          imapHost: values.imapHost,
          imapPort: values.imapPort,
          email: values.email,
          password: values.password
        })
      }
      if (result.success && result.data) {
        setFolders(result.data)
        if (result.data.length === 0) {
          message.info('未找到文件夹')
        }
      } else {
        message.error('获取文件夹失败: ' + (result.error || '请先确保连接正常'))
      }
    } catch {
      message.warning('请先填写必要字段并确保连接正常')
    } finally {
      setLoadingFolders(false)
    }
  }

  const columns: ColumnsType<EmailAccount> = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 120
    },
    {
      title: '邮箱地址',
      dataIndex: 'email',
      width: 220
    },
    {
      title: 'IMAP 服务器',
      dataIndex: 'imapHost',
      width: 180,
      render: (host: string, record: EmailAccount) => `${host}:${record.imapPort}`
    },
    {
      title: '邮件文件夹',
      dataIndex: 'mailFolder',
      width: 120
    },
    {
      title: '同步数量',
      dataIndex: 'syncLimit',
      width: 90,
      align: 'center'
    },
    {
      title: '最后同步',
      dataIndex: 'lastSyncUid',
      width: 100,
      align: 'center',
      render: (uid: number | null) => uid ? <Tag color="green"><CheckCircleOutlined /> UID {uid}</Tag> : <Text type="secondary">未同步</Text>
    },
    {
      title: '操作',
      width: 140,
      render: (_: unknown, record: EmailAccount) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除 "${record.name}" 吗？`}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>邮箱配置</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加邮箱</Button>
      </div>

      <Table
        columns={columns}
        dataSource={accounts}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: '暂无邮箱账户，点击上方按钮添加' }}
      />

      <Modal
        title={editingId ? '编辑邮箱账户' : '添加邮箱账户'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={560}
        okText="保存"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="provider" label="邮件提供商" rules={[{ required: true }]}>
            <Select>
              {Object.entries(EMAIL_PRESETS).map(([key, preset]) => (
                <Select.Option key={key} value={key}>{preset.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: '请输入账户名称' }]}>
            <Input placeholder="如: 工作邮箱" />
          </Form.Item>

          <Form.Item name="email" label="邮箱地址" rules={[{ required: true, message: '请输入邮箱地址' }]}>
            <Input placeholder="your@email.com" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码 / 授权码"
            rules={editingId
              ? []
              : [{ required: true, min: 1, message: '请输入密码或授权码' }]}
            extra={editingId ? '留空则不修改密码' : 'QQ/163/126等邮箱需使用授权码，非登录密码'}
          >
            <Input.Password placeholder="请输入密码或授权码" />
          </Form.Item>

          <Form.Item name="imapHost" label="IMAP 服务器" rules={[{ required: true, message: '请输入IMAP服务器' }]}>
            <Input placeholder="imap.example.com" addonAfter={<LinkOutlined />} />
          </Form.Item>

          <Form.Item name="imapPort" label="IMAP 端口" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="smtpHost" label="SMTP 服务器" rules={[{ required: true, message: '请输入SMTP服务器' }]}>
            <Input placeholder="smtp.example.com" />
          </Form.Item>

          <Form.Item name="smtpPort" label="SMTP 端口" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="mailFolder"
            label="邮件文件夹"
            extra="选择要同步的邮箱文件夹"
            rules={[{ required: true, message: '请选择邮件文件夹' }]}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ width: '100%' }}
                placeholder={folders.length > 0 ? '选择文件夹' : '点击右侧按钮获取文件夹列表'}
                showSearch
                options={folders.map((f) => ({ label: f, value: f }))}
                notFoundContent={folders.length === 0 ? '请先获取文件夹列表' : '无匹配'}
              />
              <Button
                icon={<FolderOutlined />}
                loading={loadingFolders}
                onClick={handleListFolders}
                style={{ flexShrink: 0 }}
              >
                获取文件夹
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item name="syncLimit" label="同步数量" extra="每次同步最多扫描的邮件数">
            <InputNumber min={10} max={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item>
            <Button icon={<ApiOutlined />} loading={testing} onClick={handleTestConnection}>
              测试连接
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
