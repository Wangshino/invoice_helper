import { useState, useCallback } from 'react'
import {
  App,
  Button,
  Space,
  Modal,
  Descriptions,
  Tag,
  Typography,
  Form,
  Input,
  InputNumber,
  Row,
  Col,
  AutoComplete
} from 'antd'
import {
  FilePdfOutlined,
  FileTextOutlined as FileXmlOutlined,
  EditOutlined,
  EyeOutlined,
  ExportOutlined
} from '@ant-design/icons'
import type { Invoice, UpdateInvoiceParams } from '../../../shared/types'
import InvoicePreview from './InvoicePreview'

const { Text } = Typography

const fileTypeIcon: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#f5222d' }} />,
  ofd: <FileXmlOutlined style={{ color: '#fa8c16' }} />,
  xml: <FileXmlOutlined style={{ color: '#52c41a' }} />
}

export interface InvoiceDetailModalProps {
  invoice: Invoice | null
  open: boolean
  onClose: () => void
  categories?: string[]
  editable?: boolean
  onSaved?: () => void
}

export default function InvoiceDetailModal({
  invoice,
  open,
  onClose,
  categories = [],
  editable = true,
  onSaved
}: InvoiceDetailModalProps): React.ReactElement {
  const { message } = App.useApp()
  const [editing, setEditing] = useState(false)
  const [editForm] = Form.useForm()
  const [editLoading, setEditLoading] = useState(false)

  const handleOpenFile = useCallback(async (id: number) => {
    const result = await window.api.invoices.openFile(id)
    if (!result.success) message.error('打开文件失败')
  }, [message])

  const handleExportSingle = useCallback(async (id: number) => {
    const result = await window.api.invoices.exportFiles([id])
    if (result.success && result.data) message.success(result.data)
  }, [message])

  const handleStartEdit = useCallback(() => {
    if (!invoice) return
    Modal.confirm({
      title: '确认编辑发票信息',
      content: '手动修改发票信息可能导致与原始文件不一致，请确认修改内容准确无误后再保存。',
      okText: '确认编辑',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        editForm.setFieldsValue({
          invoiceNumber: invoice.invoiceNumber || '',
          invoiceCode: invoice.invoiceCode || '',
          invoiceDate: invoice.invoiceDate || '',
          invoiceType: invoice.invoiceType || '',
          sellerName: invoice.sellerName || '',
          sellerTaxId: invoice.sellerTaxId || '',
          buyerName: invoice.buyerName || '',
          buyerTaxId: invoice.buyerTaxId || '',
          amount: invoice.amount,
          taxAmount: invoice.taxAmount,
          totalAmount: invoice.totalAmount,
          invoiceContent: invoice.invoiceContent || '',
          category: invoice.category || undefined
        })
        setEditing(true)
      }
    })
  }, [invoice, editForm])

  const handleSaveEdit = useCallback(async () => {
    if (!invoice) return
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const params: UpdateInvoiceParams = {
        invoiceNumber: values.invoiceNumber || undefined,
        invoiceCode: values.invoiceCode || undefined,
        invoiceDate: values.invoiceDate || undefined,
        invoiceType: values.invoiceType || undefined,
        sellerName: values.sellerName || undefined,
        sellerTaxId: values.sellerTaxId || undefined,
        buyerName: values.buyerName || undefined,
        buyerTaxId: values.buyerTaxId || undefined,
        amount: values.amount,
        taxAmount: values.taxAmount,
        totalAmount: values.totalAmount,
        invoiceContent: values.invoiceContent || undefined,
        category: values.category || undefined
      }
      const result = await window.api.invoices.update(invoice.id, params)
      if (result.success) {
        message.success('发票信息已更新')
        setEditing(false)
        onSaved?.()
      } else {
        message.error('更新失败: ' + (result.error || '未知错误'))
      }
    } catch {
      // form validation error
    } finally {
      setEditLoading(false)
    }
  }, [invoice, editForm, message, onSaved])

  // Reset editing when invoice changes
  const handleCloseModal = useCallback(() => {
    setEditing(false)
    onClose()
  }, [onClose])

  const titleContent = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
      <Space>
        {invoice && fileTypeIcon[invoice.fileType]}
        <span>发票详情</span>
        {invoice?.invoiceNumber && (
          <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 13 }}>
            {invoice.invoiceNumber}
          </Text>
        )}
      </Space>
      {invoice && (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleOpenFile(invoice.id)}>
            预览
          </Button>
          <Button size="small" icon={<ExportOutlined />} onClick={() => handleExportSingle(invoice.id)}>
            导出
          </Button>
          {editable && !editing && (
            <Button size="small" icon={<EditOutlined />} onClick={handleStartEdit}>
              编辑
            </Button>
          )}
          {editing && (
            <>
              <Button size="small" type="primary" loading={editLoading} onClick={handleSaveEdit}>
                保存
              </Button>
              <Button size="small" onClick={() => setEditing(false)}>
                取消
              </Button>
            </>
          )}
        </Space>
      )}
    </div>
  )

  return (
    <Modal
      title={titleContent}
      open={open}
      onCancel={handleCloseModal}
      width={1100}
      footer={null}
      styles={{ body: { maxHeight: '80vh', overflow: 'auto' } }}
    >
      {invoice && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Info section */}
          <div>
            {editing ? (
              <Form form={editForm} layout="vertical" size="small">
                <Row gutter={16}>
                  <Col span={12}><Form.Item label="发票号码" name="invoiceNumber"><Input /></Form.Item></Col>
                  <Col span={12}><Form.Item label="发票代码" name="invoiceCode"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}><Form.Item label="开票日期" name="invoiceDate"><Input placeholder="YYYY-MM-DD" /></Form.Item></Col>
                  <Col span={12}><Form.Item label="发票类型" name="invoiceType"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}><Form.Item label="销方名称" name="sellerName"><Input /></Form.Item></Col>
                  <Col span={12}><Form.Item label="销方税号" name="sellerTaxId"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}><Form.Item label="购方名称" name="buyerName"><Input /></Form.Item></Col>
                  <Col span={12}><Form.Item label="购方税号" name="buyerTaxId"><Input /></Form.Item></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={8}><Form.Item label="金额" name="amount"><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col span={8}><Form.Item label="税额" name="taxAmount"><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                  <Col span={8}><Form.Item label="价税合计" name="totalAmount"><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item></Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}><Form.Item label="发票内容" name="invoiceContent"><Input /></Form.Item></Col>
                  <Col span={12}>
                    <Form.Item label="分类" name="category">
                      <AutoComplete
                        allowClear
                        placeholder="选择或输入分类"
                        options={categories.map((c) => ({ value: c, label: c }))}
                        filterOption={(input, option) =>
                          (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            ) : (
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="发票号码">
                  <Text copyable>{invoice.invoiceNumber || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="开票日期">{invoice.invoiceDate || '-'}</Descriptions.Item>
                <Descriptions.Item label="发票代码">{invoice.invoiceCode || '-'}</Descriptions.Item>
                <Descriptions.Item label="发票类型">{invoice.invoiceType || '-'}</Descriptions.Item>
                <Descriptions.Item label="销方名称">{invoice.sellerName || '-'}</Descriptions.Item>
                <Descriptions.Item label="销方税号">
                  <Text copyable>{invoice.sellerTaxId || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="购方名称">{invoice.buyerName || '-'}</Descriptions.Item>
                <Descriptions.Item label="购方税号">
                  <Text copyable>{invoice.buyerTaxId || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="金额">
                  {invoice.amount != null ? `¥${invoice.amount.toFixed(2)}` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="税额">
                  {invoice.taxAmount != null ? `¥${invoice.taxAmount.toFixed(2)}` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="价税合计">
                  <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                    {invoice.totalAmount != null ? `¥${invoice.totalAmount.toFixed(2)}` : '-'}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="分类">
                  {invoice.category ? <Tag color="blue">{invoice.category}</Tag> : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={invoice.status === 'reimbursed' ? 'success' : 'warning'}>
                    {invoice.status === 'reimbursed' ? '已报销' : '未报销'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="发票内容">{invoice.invoiceContent || '-'}</Descriptions.Item>
                <Descriptions.Item label="文件类型">
                  {invoice.fileType?.toUpperCase() || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="来源">
                  {invoice.source === 'email' ? '邮件导入' : '手动导入'}
                </Descriptions.Item>
              </Descriptions>
            )}
          </div>
          {/* Preview */}
          <div>
            <InvoicePreview invoice={invoice} />
          </div>
        </div>
      )}
    </Modal>
  )
}
