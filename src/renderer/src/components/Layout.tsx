import { useState } from 'react'
import { Layout as AntLayout, Menu, theme } from 'antd'
import {
  DashboardOutlined,
  FileTextOutlined,
  MailOutlined,
  SettingOutlined,
  FormOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Sider, Content } = AntLayout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '首页概览' },
  { key: '/invoices', icon: <FileTextOutlined />, label: '发票管理' },
  { key: '/email-import', icon: <MailOutlined />, label: '邮件导入' },
  { key: '/email-settings', icon: <SettingOutlined />, label: '邮箱配置' },
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

  return (
    <AntLayout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{ background: token.colorBgContainer }}
      >
        <div
          style={{
            height: 48,
            margin: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: collapsed ? 14 : 16,
            color: token.colorPrimary,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            paddingBottom: 12
          }}
        >
          {collapsed ? '票' : '发票助手'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <AntLayout>
        <Content style={{ padding: 24, overflow: 'auto' }}>{children}</Content>
      </AntLayout>
    </AntLayout>
  )
}
