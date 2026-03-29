import { useState, useEffect, useCallback } from 'react'
import { App, Button, Card, Input, Space, Typography, Divider, Dropdown, Spin } from 'antd'
import { SaveOutlined, UndoOutlined, PlusOutlined } from '@ant-design/icons'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { DEFAULT_EMAIL_TEMPLATE } from '../../../shared/types'
import type { EmailTemplateData } from '../../../shared/types'
import { renderTemplate, renderInvoiceTable } from '../../../shared/template-renderer'

const { Title, Text } = Typography

// 模拟数据用于预览
const SAMPLE_VARIABLES = {
  title: '3月差旅费报销',
  reason: '出差北京参加技术峰会，包含交通费、住宿费和餐饮费',
  targetAmount: '¥5000.00',
  actualAmount: '¥4850.00',
  date: '2026-03-25',
  invoiceCount: '4',
  invoiceTable: renderInvoiceTable([
    { invoiceNumber: '26412000000006008521', sellerName: '北京滴滴出行', totalAmount: '¥256.00', invoiceDate: '2026-03-20' },
    { invoiceNumber: '26412000000006008522', sellerName: '如家酒店', totalAmount: '¥1200.00', invoiceDate: '2026-03-21' },
    { invoiceNumber: '26412000000006008523', sellerName: '北京餐饮公司', totalAmount: '¥380.00', invoiceDate: '2026-03-22' },
    { invoiceNumber: '26412000000006008524', sellerName: '中国国航', totalAmount: '¥3014.00', invoiceDate: '2026-03-23' }
  ])
}

const TEMPLATE_VARIABLES = [
  { key: 'title', label: '报销单标题' },
  { key: 'reason', label: '报销事由' },
  { key: 'targetAmount', label: '目标金额' },
  { key: 'actualAmount', label: '实际金额' },
  { key: 'date', label: '报销日期' },
  { key: 'invoiceCount', label: '发票数量' },
  { key: 'invoiceTable', label: '发票明细表格' }
]

export default function EmailTemplateSettings(): React.ReactElement {
  const { message } = App.useApp()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [subjectTemplate, setSubjectTemplate] = useState(DEFAULT_EMAIL_TEMPLATE.subjectTemplate)
  const [previewHtml, setPreviewHtml] = useState('')

  const editor = useEditor({
    extensions: [StarterKit],
    content: DEFAULT_EMAIL_TEMPLATE.bodyTemplate,
    onUpdate: ({ editor }) => {
      updatePreview(subjectTemplate, editor.getHTML())
    }
  })

  const updatePreview = useCallback((subject: string, body: string) => {
    const template: EmailTemplateData = { subjectTemplate: subject, bodyTemplate: body }
    const rendered = renderTemplate(template, SAMPLE_VARIABLES)
    setPreviewHtml(rendered.html)
  }, [])

  // 加载已保存的模板
  useEffect(() => {
    async function load(): Promise<void> {
      const result = await window.api.settings.get('reimbursement_email_template')
      if (result.success && result.data) {
        try {
          const saved = JSON.parse(result.data) as EmailTemplateData
          setSubjectTemplate(saved.subjectTemplate)
          editor?.commands.setContent(saved.bodyTemplate)
          updatePreview(saved.subjectTemplate, saved.bodyTemplate)
        } catch {
          updatePreview(DEFAULT_EMAIL_TEMPLATE.subjectTemplate, DEFAULT_EMAIL_TEMPLATE.bodyTemplate)
        }
      } else {
        updatePreview(DEFAULT_EMAIL_TEMPLATE.subjectTemplate, DEFAULT_EMAIL_TEMPLATE.bodyTemplate)
      }
      setLoading(false)
    }
    if (editor) load()
  }, [editor, updatePreview])

  useEffect(() => {
    if (!loading && editor) {
      updatePreview(subjectTemplate, editor.getHTML())
    }
  }, [subjectTemplate, editor, loading, updatePreview])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const bodyTemplate = editor?.getHTML() ?? DEFAULT_EMAIL_TEMPLATE.bodyTemplate
      const template: EmailTemplateData = { subjectTemplate, bodyTemplate }
      const result = await window.api.settings.set(
        'reimbursement_email_template',
        JSON.stringify(template)
      )
      if (result.success) {
        message.success('模板已保存')
      } else {
        message.error('保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleReset = (): void => {
    setSubjectTemplate(DEFAULT_EMAIL_TEMPLATE.subjectTemplate)
    editor?.commands.setContent(DEFAULT_EMAIL_TEMPLATE.bodyTemplate)
    message.info('已恢复默认模板')
  }

  const insertVariable = (key: string): void => {
    editor?.chain().focus().insertContent(`{{${key}}}`).run()
  }

  const insertSubjectVariable = (key: string): void => {
    setSubjectTemplate((prev) => prev + `{{${key}}}`)
  }

  if (loading) {
    return <Spin style={{ display: 'block', margin: '100px auto' }} />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>邮件模板设置</Title>
        <Space>
          <Button icon={<UndoOutlined />} onClick={handleReset}>恢复默认</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存模板
          </Button>
        </Space>
      </div>

      <Card title="邮件主题" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="邮件主题模板"
          />
          <Dropdown
            menu={{
              items: TEMPLATE_VARIABLES.map((v) => ({
                key: v.key,
                label: `{{${v.key}}} — ${v.label}`,
                onClick: () => insertSubjectVariable(v.key)
              }))
            }}
          >
            <Button icon={<PlusOutlined />}>插入变量</Button>
          </Dropdown>
        </Space.Compact>
        <Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
          可用变量: {TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`).join(' ')}
        </Text>
      </Card>

      <Card
        title="邮件正文"
        style={{ marginBottom: 16 }}
        extra={
          <Dropdown
            menu={{
              items: TEMPLATE_VARIABLES.map((v) => ({
                key: v.key,
                label: `{{${v.key}}} — ${v.label}`,
                onClick: () => insertVariable(v.key)
              }))
            }}
          >
            <Button size="small" icon={<PlusOutlined />}>插入变量</Button>
          </Dropdown>
        }
      >
        {/* Toolbar */}
        <div style={{ borderBottom: '1px solid #e8e8e8', marginBottom: 8, paddingBottom: 8 }}>
          <Space size={4}>
            <Button
              size="small"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              type={editor?.isActive('bold') ? 'primary' : 'default'}
            >
              <strong>B</strong>
            </Button>
            <Button
              size="small"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              type={editor?.isActive('italic') ? 'primary' : 'default'}
            >
              <em>I</em>
            </Button>
            <Button
              size="small"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              type={editor?.isActive('heading', { level: 2 }) ? 'primary' : 'default'}
            >
              H2
            </Button>
            <Button
              size="small"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
              type={editor?.isActive('heading', { level: 3 }) ? 'primary' : 'default'}
            >
              H3
            </Button>
            <Button
              size="small"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              type={editor?.isActive('bulletList') ? 'primary' : 'default'}
            >
              列表
            </Button>
          </Space>
        </div>

        <div
          style={{
            border: '1px solid #e8e8e8',
            borderRadius: 4,
            minHeight: 300,
            padding: 12
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </Card>

      <Divider>预览（使用样例数据渲染）</Divider>
      <Card size="small">
        {previewHtml ? (
          <div
            style={{ maxHeight: 500, overflow: 'auto' }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <Text type="secondary">编辑模板后将在此处显示预览</Text>
        )}
      </Card>
    </div>
  )
}
