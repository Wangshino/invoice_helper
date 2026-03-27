# 开发日志

## Phase 1: 项目初始化与基础架构 ✅
**日期**: 2026-03-27
**状态**: 已完成

### 完成内容

1. **项目脚手架**: 使用 electron-vite 手动搭建 React + TypeScript 项目
2. **依赖安装**:
   - Electron 38 + React 19 + TypeScript 5
   - Ant Design 5 (UI框架) + React Router 7 (路由)
   - better-sqlite3 (SQLite数据库)
   - imapflow (IMAP邮件) + nodemailer (SMTP发送)
   - fast-xml-parser (XML发票解析)
   - Zustand (状态管理)
3. **布局与路由**: 侧边栏导航 + 6个页面路由
4. **数据库层**: 完整 Schema 设计 (4张表) + CRUD 操作
5. **IPC 通信**: preload 桥接 + ipcMain 处理器
6. **核心服务框架**:
   - 发票解析管线 (PDF/OFD/XML 分发)
   - 百度OCR集成模块
   - 动态规划匹配算法
   - 邮件读取/发送服务骨架

### 遇到的问题

1. **better-sqlite3 编译失败**:
   - 症状: `fatal error: 'climits' file not found`
   - 根因: Xcode 许可协议未同意 (Xcode 更新后需要重新 accept)
   - 解决: `sudo xcodebuild -license accept`

2. **better-sqlite3 架构不匹配**:
   - 症状: `mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')`
   - 根因: Node.js 通过 Rosetta 以 x86_64 运行, npm 编译原生模块为 x86_64; 但 Electron 是 arm64
   - 解决: `npx @electron/rebuild -f -w better-sqlite3 --arch=arm64`

3. **electron-vite 脚手架交互式CLI**: 无法在非交互模式下运行, 改为手动创建项目结构

### 验证结果
- `electron-vite build` ✅ 构建成功
- `electron-vite dev` ✅ 应用正常启动
- 数据库初始化 ✅ `~/Library/Application Support/invoice-helper/data/invoice-helper.db`

### Git Commit
- `feat: Phase 1 - 项目初始化与基础架构`

---

## Phase 2: 数据库层 + IPC 通信 ✅
**日期**: 2026-03-27
**状态**: 已完成

### 完成内容

1. **数据库服务重写** (`src/main/services/database.ts`):
   - 版本化迁移系统 (`schema_version` 表)
   - WAL 模式 + 外键约束 + 忙等待超时
   - Migration #1: 创建 5 张表 (email_accounts, invoices, reimbursements, reimbursement_invoices, settings)
   - 应用退出时正确关闭数据库连接

2. **加密模块** (`src/main/services/crypto.ts`):
   - AES-256-GCM 对称加密
   - 密钥由 machine-id + scrypt 派生，绑定到当前机器

3. **共享类型系统** (`src/shared/types.ts`):
   - 统一命名规则: `XxxRow` (DB) / `Xxx` (业务) / `CreateXxxParams` / `XxxFilters`
   - `IpcResult<T>` 统一返回结构
   - `FieldMappers` 工具: snake_case ↔ camelCase 自动转换
   - 覆盖全部实体: 发票、邮箱账户、报销单、匹配结果

4. **邮箱预设** (`src/shared/email-presets.ts`):
   - 国内常用邮箱服务商预设 (QQ/163/126/Sina/Gmail/Outlook)
   - `detectProvider()` 自动识别

5. **Repository 层** (4 个文件):
   - `invoice-repository.ts`: 发票 CRUD + 筛选 + 统计
   - `email-account-repository.ts`: 邮箱账户 CRUD + 密码加解密
   - `reimbursement-repository.ts`: 报销单 CRUD + 发票关联 (事务操作)
   - `settings-repository.ts`: Key-Value 设置存储

6. **IPC 层重写** (`src/main/ipc/index.ts`):
   - 全部委托到 Repository 层，不再内联 SQL
   - `safeHandle()` 统一异常捕获
   - 自动 snake_case → camelCase 字段映射
   - 新增 `settings:*` IPC 通道
   - 新增 `countByStatus` 统计接口

7. **Preload 层更新**:
   - `index.ts`: 使用共享类型，全部 IPC 调用返回 `IpcResult<T>`
   - `index.d.ts`: 精确的 TypeScript 类型声明

8. **文档**:
   - `docs/architecture.md`: 架构设计文档
   - `docs/database.md`: 数据库设计文档
   - `docs/api.md`: IPC 接口文档

### 关键设计决策

- **Repository 模式**: IPC 层不写 SQL，通过 Repository 函数隔离，便于维护和测试
- **IpcResult<T>**: 统一返回 `{ success, data?, error? }`，渲染进程一致地处理成功/失败
- **FieldMappers**: 自动转换 DB snake_case 到 JS camelCase，两端各自使用自然命名

### 验证结果
- TypeScript 类型检查 ✅ (共享类型在 main/preload/renderer 三端通用)
- 数据库迁移 ✅ (schema_version 表正确追踪版本)
- Repository 层 ✅ (事务操作、外键约束正常)

### Git Commit
- `feat: Phase 2 - 数据库层 + Repository + IPC 通信`

---

## Phase 3: 发票解析管线 ✅
**日期**: 2026-03-28
**状态**: 已完成

### 完成内容

1. **invoice-ofd2json 集成**: 安装并验证，API 返回中文键值对)
   - 输入: `Buffer`，输出: `{ [key: string]: string }` (中文键名: 发票号码、 开票日期, 销售方名称 等)
   - 金额字段以 `|` 分隔，含税额/价税合计
自动转换为 number

2. **OFD 解析器** (`invoice-parser.ts`):
   - 调用 `ofd2json(buffer)` → 映射中文字段名为标准 `ParsedInvoice` 结构
   - `合计金额` → `amount`, `合计税额` → `taxAmount`, `价税合计（小写）` → `totalAmount`
2. **XML 解析器** (全电发票):
   - 使用 `fast-xml-parser`，支持多种 XML 格式 (EInvoice/EInvoiceData/CompositeInvoice)
   - 兼容多种字段命名 (中英文/拼音缩写)
   - 支持 BasicInformation/BuyerInformation/SellerInformation/TaxInformation 节点
2. **PDF 解析器** (百度 OCR):
   - `invoice-ocr.ts` 重写: 宰取 access_token 缓存、结果映射
   - 新增 `recognizeInvoice()`: PDF/图片 → 百度OCR → `OcrInvoiceResult`
   - 百度OCR响应字段映射: InvoiceNumber→invoice_number 等
2. **文件存储服务**:
   - `storeInvoiceFile()`: 复制到 userData/invoices/ 目录, 自动重命名防覆盖
   - `parseAndStore()`: 解析 + 存储 + 返回 `ParseResult`
3. **IPC 更新** (`ipc/index.ts`):
   - 新增 `invoices:importAndParse`: 选择文件 → 解析 → 存储 → 入库
返回完整 Invoice[]
   - 新增 `invoices:parseFile`: 单文件预览, 不入库
   - 使用 `safeHandle` 统一异常捕获
4. **Preload 更新**:
   - 新增 `importAndParse` 和 `parseFile` IPC 通道
   - `index.d.ts` 新增 `ParsePreview` 类型声明
5. **共享类型更新** (`shared/types.ts`):
   - 新增 `ParsePreview` 和 `ParsedInvoice` 类型
6. **Invoices 页面重写** (`pages/Invoices.tsx`):
   - 完整 CRUD 表格 (筛选/搜索/分页)
   - 导入发票按钮 (调用 importAndParse)
   - 发票详情预览 Modal
   - 删除确认

   - 状态/来源/日期范围筛选
### 关键设计决策
- **OFD 字段映射**: invoice-ofd2json 返回中文字段名，直接映射为英文 snake_case 字段
- **XML 多格式兼容**: 使用可选链操作符避免 null pointer, 支持多种 XML 嫋名空间
- **百度OCR 缓存**: access_token 缓存 5 分钟提前过期, 避免频繁请求
- **文件存储**: 复制到 userData 目录而非原地引用，避免源文件移动导致丢失

---

## Phase 4: 邮件集成
**状态**: 待开始

### 验证结果
- `electron-vite build` ✅ 构建成功 (main + preload + renderer)
- OFD 解析 ✅ invoice-ofd2json 集成正常
- XML 解析 ✅ fast-xml-parser 集成正常
- PDF 解析 ✅ 百度OCR 模块就绪 (需配置 API Key)

- IPC ✅ importAndParse / parseFile 通道注册正常
- Invoices 页面 ✅ 完整 CRUD + 筛选 + 导入功能

### Git Commit
- `feat: Phase 3 - 发票解析管线 + Invoices 页面`

---

## Phase 5: 智能匹配 + 报销单
**状态**: 待开始

---

## Phase 6: 报销单发送 + 历史管理
**状态**: 待开始

---

## Phase 7: 首页概览 + 打包配置
**状态**: 待开始
