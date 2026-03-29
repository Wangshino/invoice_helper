import { useState, useEffect, useCallback } from 'react'
import {
  Layout as AntLayout,
  Menu,
  theme,
  Modal,
  Button,
  Typography,
  Progress,
  Divider
} from 'antd'
import {
  DashboardOutlined,
  FileTextOutlined,
  MailOutlined,
  SettingOutlined,
  FormOutlined,
  UnorderedListOutlined,
  SnippetsOutlined,
  InfoCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloudOutlined,
  BugOutlined,
  GithubOutlined,
  RocketOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Sider, Content } = AntLayout
const { Text } = Typography

const REPO_URL = 'https://github.com/Wangshino/invoice_helper'
const ISSUES_URL = `${REPO_URL}/issues/new`

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '首页概览' },
  { key: '/invoices', icon: <FileTextOutlined />, label: '发票管理' },
  { key: '/email-import', icon: <MailOutlined />, label: '邮件导入' },
  { key: '/email-settings', icon: <SettingOutlined />, label: '邮箱配置' },
  { key: '/email-template', icon: <SnippetsOutlined />, label: '邮件模板' },
  { type: 'divider' as const },
  { key: '/reimbursement/create', icon: <FormOutlined />, label: '创建报销单' },
  { key: '/reimbursement/list', icon: <UnorderedListOutlined />, label: '报销单列表' }
]

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()

  // About modal state
  const [aboutOpen, setAboutOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<string>('idle')
  const [updateInfo, setUpdateInfo] = useState('')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [checking, setChecking] = useState(false)

  // Load version
  useEffect(() => {
    window.api.app.getVersion().then((res) => {
      if (res.success && res.data) setVersion(res.data)
    })
  }, [])

  // Listen updater events
  useEffect(() => {
    const removeStatus = window.api.updater.onStatus((status, info) => {
      setUpdateStatus(status)
      if (info) setUpdateInfo(info)
    })
    const removeProgress = window.api.updater.onProgress((progress) => {
      setDownloadPercent(progress.percent)
    })
    return () => {
      removeStatus()
      removeProgress()
    }
  }, [])

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true)
    setUpdateStatus('idle')
    setUpdateInfo('')
    setDownloadPercent(0)
    try {
      await window.api.updater.check()
    } catch {
      setUpdateStatus('error')
      setUpdateInfo('检查更新失败')
    } finally {
      setChecking(false)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    try {
      await window.api.updater.download()
    } catch {
      setUpdateStatus('error')
      setUpdateInfo('下载失败')
    }
  }, [updateStatus])

  const handleInstall = useCallback(async () => {
    await window.api.updater.install()
  }, [])

  // Update status config
  const statusConfig: Record<string, { text: string; color: string; icon?: React.ReactNode }> = {
    idle: { text: '点击下方按钮检查更新', color: token.colorTextTertiary },
    checking: { text: '正在检查更新...', color: token.colorPrimary },
    available: { text: `发现新版本 ${updateInfo}`, color: token.colorWarning },
    'not-available': { text: '当前已是最新版本', color: token.colorSuccess, icon: <CheckCircleOutlined /> },
    downloading: { text: `正在下载更新... ${downloadPercent}%`, color: token.colorPrimary },
    downloaded: { text: '下载完成，可以安装更新', color: token.colorSuccess, icon: <CheckCircleOutlined /> },
    error: { text: updateInfo || '更新出错', color: token.colorError }
  }

  return (
    <AntLayout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        style={{
          background: token.colorBgContainer,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${token.colorBorderSecondary}`
        }}
      >
        {/* Logo area */}
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: collapsed ? 14 : 16,
            color: token.colorPrimary,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            flexShrink: 0
          }}
        >
          <span style={{ letterSpacing: 1 }}>{collapsed ? '票' : '发票助手'}</span>
        </div>

        {/* Menu */}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, borderInlineStart: 0, borderInlineEnd: 0 }}
        />

        {/* Bottom area: About + collapse trigger */}
        <div
          style={{
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            padding: collapsed ? '12px 0' : '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between'
          }}
        >
          {/* Collapse trigger — only show on hover */}
          {!collapsed && (
            <div
              onClick={() => setCollapsed(true)}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 20,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.25,
                transition: 'opacity 0.2s',
                color: token.colorTextTertiary
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.6')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.25')}
            >
              ‹
            </div>
          )}

          {/* About button */}
          <div
            onClick={() => setAboutOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 6,
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = token.colorBgTextHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <InfoCircleOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
            {collapsed ? (
              <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>v{version}</Text>
            ) : (
              <Text style={{ fontSize: 13, color: token.colorTextSecondary }}>关于发票助手</Text>
            )}
          </div>

          {/* Expand button when collapsed */}
          {collapsed && (
            <div
              onClick={() => setCollapsed(false)}
              style={{
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = token.colorBgTextHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 14, color: token.colorTextSecondary }}>›</span>
            </div>
          )}
        </div>
      </Sider>

      <AntLayout>
        <Content style={{ padding: 24, overflow: 'auto', background: token.colorBgLayout }}>{children}</Content>
      </AntLayout>

      {/* =============== About Modal =============== */}
      <Modal
        open={aboutOpen}
        onCancel={() => setAboutOpen(false)}
        footer={null}
        width={420}
        closable
        centered
        styles={{
          body: { padding: '32px 32px 24px' }
        }}
      >
        {/* Header: App identity */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: `0 4px 12px ${token.colorPrimaryBg}`,
              overflow: 'hidden'
            }}
          >
            <img src="/icon.png" alt="icon" style={{ width: 64, height: 64 }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: token.colorText }}>
            发票管理助手
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: token.colorTextSecondary }}>
            版本 {version}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextTertiary }}>
            作者: Wangshino
          </div>
        </div>

        {/* Update section */}
        <div
          style={{
            padding: 20,
            background: token.colorBgLayout,
            borderRadius: 12,
            border: `1px solid ${token.colorBorderSecondary}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SyncOutlined
                spin={checking || updateStatus === 'downloading'}
                style={{ color: updateStatus === 'error' ? token.colorError : token.colorPrimary }}
              />
              <span style={{ fontWeight: 500, fontSize: 14 }}>软件更新</span>
            </div>
            {(updateStatus === 'idle' || updateStatus === 'not-available' || updateStatus === 'error') && (
              <Button
                type="primary"
                size="small"
                ghost={updateStatus === 'not-available'}
                icon={<SyncOutlined spin={checking} />}
                loading={checking}
                onClick={handleCheckUpdate}
                disabled={checking}
              >
                {checking ? '检查中...' : updateStatus === 'not-available' ? '重新检查' : '检查更新'}
              </Button>
            )}
          </div>

          {/* Status line */}
          {updateStatus !== 'idle' && (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: statusConfig[updateStatus]?.color || token.colorTextSecondary,
                fontSize: 13
              }}
            >
              {statusConfig[updateStatus]?.icon}
              <span>{statusConfig[updateStatus]?.text || '未知状态'}</span>
            </div>
          )}

          {/* Download progress */}
          {updateStatus === 'downloading' && (
            <Progress
              percent={downloadPercent}
              size="small"
              strokeColor={token.colorPrimary}
              style={{ margin: '12px 0 0' }}
            />
          )}

          {/* Actions */}
          {updateStatus === 'available' && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button
                size="small"
                type="primary"
                icon={<CloudOutlined />}
                onClick={handleDownload}
              >
                立即下载
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setUpdateStatus('idle')
                  setUpdateInfo('')
                }}
              >
                稍后提醒
              </Button>
            </div>
          )}

          {updateStatus === 'downloaded' && (
            <Button
              size="small"
              type="primary"
              icon={<RocketOutlined />}
              onClick={handleInstall}
              style={{ marginTop: 12 }}
            >
              退出并安装更新
            </Button>
          )}
        </div>

        {/* Links section */}
        <Divider style={{ margin: '20px 0 16px' }} />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
          <Button
            type="link"
            icon={<BugOutlined />}
            style={{ fontSize: 13, color: token.colorTextSecondary }}
            onClick={() => window.api.app.openExternal(ISSUES_URL)}
          >
            反馈问题
          </Button>
          <Button
            type="link"
            icon={<GithubOutlined />}
            style={{ fontSize: 13, color: token.colorTextSecondary }}
            onClick={() => window.api.app.openExternal(REPO_URL)}
          >
            GitHub
          </Button>
        </div>
      </Modal>
    </AntLayout>
  )
}
