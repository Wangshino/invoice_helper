# IPC 接口文档

## 概述

渲染进程通过 `window.api.<module>.<method>()` 调用主进程功能，所有调用统一返回 `IpcResult<T>` 结构:

```typescript
interface IpcResult<T> {
  success: boolean
  data?: T      // success=true 时存在
  error?: string // success=false 时存在
}
```

---

## invoices — 发票管理

### `invoices.getAll(filters?)`

获取发票列表，支持筛选。

**参数**:
```typescript
interface InvoiceFilters {
  status?: 'reimbursed' | 'unreimbursed' | 'all'
  dateFrom?: string      // YYYY-MM-DD
  dateTo?: string        // YYYY-MM-DD
  source?: 'email' | 'manual'
  keyword?: string       // 搜索发票号/销方/文件名
}
```

**返回**: `IpcResult<Invoice[]>`

### `invoices.getById(id)`

获取单张发票详情。

**参数**: `id: number`
**返回**: `IpcResult<Invoice | null>`

### `invoices.create(params)`

创建发票记录 (通常由解析管线自动调用)。

**参数**:
```typescript
interface CreateInvoiceParams {
  invoiceNumber?: string
  invoiceCode?: string
  invoiceDate?: string
  invoiceType?: string
  sellerName?: string
  sellerTaxId?: string
  buyerName?: string
  buyerTaxId?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
  filePath: string       // 必填: 本地文件路径
  fileType: 'pdf' | 'ofd' | 'xml'  // 必填
  fileName?: string
  source?: 'email' | 'manual'
  emailAccountId?: number
  emailSubject?: string
}
```

**返回**: `IpcResult<{ id: number }>`

### `invoices.remove(id)`

删除发票。

**参数**: `id: number`
**返回**: `IpcResult<void>`

### `invoices.importFiles()`

打开文件选择对话框，选择发票文件。

**返回**: `IpcResult<string[]>` (选中的文件路径列表)

### `invoices.parseFile(filePath)`

解析发票文件并入库 (Phase 3 实现)。

**参数**: `filePath: string`
**返回**: `IpcResult<Invoice | null>`

### `invoices.countByStatus()`

按状态统计发票数量和金额。

**返回**: `IpcResult<{ status: string; count: number; totalAmount: number }[]>`

---

## emailAccounts — 邮箱账户

### `emailAccounts.getAll()`

获取所有邮箱账户 (不含密码)。

**返回**: `IpcResult<EmailAccount[]>`

### `emailAccounts.getById(id)`

获取单个邮箱账户。

**参数**: `id: number`
**返回**: `IpcResult<EmailAccount | null>`

### `emailAccounts.create(params)`

添加邮箱账户，密码自动加密存储。

**参数**:
```typescript
interface CreateEmailAccountParams {
  name: string
  email: string
  imapHost: string
  imapPort?: number      // 默认 993
  smtpHost: string
  smtpPort?: number      // 默认 465
  password: string       // 明文，入库前自动加密
}
```

**返回**: `IpcResult<{ id: number }>`

### `emailAccounts.update(id, data)`

更新邮箱账户信息。

**参数**: `id: number`, `data: Partial<CreateEmailAccountParams>`
**返回**: `IpcResult<void>`

### `emailAccounts.remove(id)`

删除邮箱账户。

**参数**: `id: number`
**返回**: `IpcResult<void>`

### `emailAccounts.testConnection(params)`

测试 IMAP 连接 (Phase 4 实现)。

**参数**: `CreateEmailAccountParams`
**返回**: `IpcResult<boolean>`

### `emailAccounts.syncEmails(accountId)`

同步邮箱中的发票附件 (Phase 4 实现)。

**参数**: `accountId: number`
**返回**: `IpcResult<Invoice[]>`

---

## reimbursements — 报销单

### `reimbursements.getAll(filters?)`

获取报销单列表。

**参数**:
```typescript
interface ReimbursementFilters {
  status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'all'
  dateFrom?: string
  dateTo?: string
}
```

**返回**: `IpcResult<Reimbursement[]>`

### `reimbursements.getById(id)`

获取报销单详情 (含关联发票列表)。

**参数**: `id: number`
**返回**: `IpcResult<Reimbursement | null>` (Reimbursement.invoices 包含关联发票)

### `reimbursements.create(params)`

创建报销单并关联发票，自动将发票状态改为 `reimbursed`。

**参数**:
```typescript
interface CreateReimbursementParams {
  title: string
  reason: string
  targetAmount: number
  actualAmount?: number
  date: string           // YYYY-MM-DD
  status?: 'draft' | 'sent' | 'approved' | 'rejected'  // 默认 'draft'
  invoiceIds?: number[]  // 关联的发票 ID 列表
}
```

**返回**: `IpcResult<{ id: number }>`

### `reimbursements.update(id, params)`

更新报销单。如提供 `invoiceIds`，会重新关联发票 (旧关联自动解除，发票状态恢复)。

**参数**: `id: number`, `UpdateReimbursementParams`
**返回**: `IpcResult<void>`

### `reimbursements.remove(id)`

删除报销单，自动恢复关联发票状态为 `unreimbursed`。

**参数**: `id: number`
**返回**: `IpcResult<void>`

### `reimbursements.sendEmail(id, emailTo)`

发送报销邮件 (Phase 6 实现)。

**参数**: `id: number`, `emailTo: string`
**返回**: `IpcResult<void>`

### `reimbursements.countByStatus()`

按状态统计报销单数量和金额。

**返回**: `IpcResult<{ status: string; count: number; totalAmount: number }[]>`

---

## matching — 智能匹配

### `matching.findBestCombinations(targetAmount)`

使用动态规划算法，从未报销发票中找到总和最接近目标金额的组合。

**参数**: `targetAmount: number`
**返回**: `IpcResult<MatchingResult[]>` (最多 3 个方案)

```typescript
interface MatchingResult {
  totalAmount: number    // 组合总金额
  invoices: Invoice[]    // 组合中的发票列表
  invoiceCount: number   // 发票数量
  difference: number     // 与目标金额的差额
  isExact: boolean       // 是否精确匹配
}
```

---

## settings — 全局设置

### `settings.get(key)`

获取设置值。

**参数**: `key: string`
**返回**: `IpcResult<string | undefined>`

### `settings.set(key, value)`

设置值 (INSERT OR REPLACE)。

**参数**: `key: string`, `value: string`
**返回**: `IpcResult<void>`

### `settings.getAll()`

获取所有设置。

**返回**: `IpcResult<Record<string, string>>`
