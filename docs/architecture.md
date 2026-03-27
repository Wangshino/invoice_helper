# 架构设计文档

## 整体架构

Invoice Helper 采用 Electron + React 的桌面应用架构，遵循**主进程-渲染进程分离**原则。

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│                                                  │
│  ┌──────────────┐     ┌──────────────────────┐  │
│  │  主进程 (Main) │◄────│  Preload Bridge      │  │
│  │              │     │  (contextBridge)      │  │
│  │  Services    │     └──────────────────────┘  │
│  │  Repositories│              │                │
│  │  IPC Handlers│              ▼                │
│  │              │     ┌──────────────────────┐  │
│  │  SQLite DB   │     │  渲染进程 (Renderer)  │  │
│  │  (better-    │     │                      │  │
│  │   sqlite3)   │     │  React 19 + Antd 5   │  │
│  │              │     │  React Router 7       │  │
│  └──────────────┘     │  Zustand Stores       │  │
│                       └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 分层架构

### 1. 渲染进程 (Renderer)

用户界面层，运行在 Chromium 中，**无法直接访问 Node.js API**。

- **Pages**: 页面组件 (Dashboard, Invoices, ReimbursementList 等)
- **Components**: 可复用 UI 组件 (Layout, InvoiceTable, MatchingPanel 等)
- **Stores**: Zustand 状态管理
- 通过 `window.api` 调用 IPC 接口与主进程通信

### 2. Preload Bridge

安全桥接层，使用 `contextBridge.exposeInMainWorld` 将主进程能力暴露给渲染进程。

- 所有 IPC 调用统一返回 `IpcResult<T>` 结构
- 类型声明在 `src/preload/index.d.ts`
- 共享类型在 `src/shared/types.ts`

### 3. 主进程 (Main)

业务逻辑层，拥有完整的 Node.js 能力。

#### IPC 处理器 (`src/main/ipc/`)
- 命名规则: `<module>:<operation>` (如 `invoices:getAll`)
- 使用 `safeHandle()` 统一异常捕获
- 调用 Repository 层处理数据，使用 `FieldMappers` 转换 snake_case → camelCase

#### Repository 层 (`src/main/repositories/`)
- 纯数据访问层，直接操作 SQLite
- 每个实体一个文件: `invoice-repository.ts`, `email-account-repository.ts`, `reimbursement-repository.ts`, `settings-repository.ts`
- 复杂操作使用 `db.transaction()` 保证原子性

#### 服务层 (`src/main/services/`)
- `database.ts`: 数据库初始化、迁移、连接管理
- `crypto.ts`: AES-256-GCM 加密 (用于邮箱密码)
- `invoice-parser.ts`: 发票文件解析入口
- `invoice-ocr.ts`: 百度 OCR 集成
- `matching.ts`: 动态规划子集和匹配算法
- `email-imap.ts` / `email-send.ts`: 邮件读写 (Phase 4)

## 数据流

```
Renderer                   Preload                 Main Process
   │                         │                         │
   │  window.api.invoices    │                         │
   │  .getAll(filters)       │                         │
   │────────────────────────►│  ipcRenderer.invoke()   │
   │                         │────────────────────────►│
   │                         │                         │  IPC Handler
   │                         │                         │  ↓
   │                         │                         │  Repository
   │                         │                         │  ↓
   │                         │                         │  SQLite
   │                         │                         │  ↓
   │                         │                         │  FieldMappers
   │                         │                         │  ↓
   │  IpcResult<Invoice[]>   │  ipcMain result         │  IpcResult.ok()
   │◄────────────────────────│◄────────────────────────│
   │                         │                         │
```

## 关键设计决策

### IpcResult<T> 统一返回结构

所有 IPC 调用返回 `{ success, data?, error? }`，渲染进程统一检查 `success`。

### Repository 模式

IPC 层不直接写 SQL，通过 Repository 函数隔离数据访问，便于测试和维护。

### snake_case / camelCase 映射

数据库使用 snake_case (SQLite 惯例)，渲染进程使用 camelCase (JS 惯例)，通过 `FieldMappers` 自动转换。

### 密码加密

邮箱密码使用 AES-256-GCM 加密存储，密钥由 `node-machine-id` + scrypt 派生，绑定到当前机器。
