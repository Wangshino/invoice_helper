import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Invoices from './pages/Invoices'
import EmailImport from './pages/EmailImport'
import EmailSettings from './pages/EmailSettings'
import EmailTemplateSettings from './pages/EmailTemplateSettings'
import ReimbursementCreate from './pages/ReimbursementCreate'
import ReimbursementList from './pages/ReimbursementList'

function App(): React.ReactElement {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/email-import" element={<EmailImport />} />
              <Route path="/email-settings" element={<EmailSettings />} />
              <Route path="/email-template" element={<EmailTemplateSettings />} />
              <Route path="/reimbursement/create" element={<ReimbursementCreate />} />
              <Route path="/reimbursement/list" element={<ReimbursementList />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  )
}

export default App
