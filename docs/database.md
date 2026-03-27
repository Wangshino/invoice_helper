# 数据库设计文档

## 概述

- **数据库**: SQLite 3 (通过 better-sqlite3 驱动)
- **存储路径**: `~/Library/Application Support/invoice-helper/data/invoice-helper.db`
- **WAL 模式**: 已启用 (提升并发读写性能)
- **外键约束**: 已启用 (`PRAGMA foreign_keys = ON`)
- **迁移机制**: 基于 `schema_version` 表的版本化迁移

## 表结构

### email_accounts — 邮箱账户

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTO | 主键 |
| name | TEXT | NOT NULL | 显示名称 |
| email | TEXT | NOT NULL | 邮箱地址 |
| imap_host | TEXT | NOT NULL | IMAP 服务器 |
| imap_port | INTEGER | NOT NULL DEFAULT 993 | IMAP 端口 |
| smtp_host | TEXT | NOT NULL | SMTP 服务器 |
| smtp_port | INTEGER | NOT NULL DEFAULT 465 | SMTP 端口 |
| password | TEXT | NOT NULL | AES-256-GCM 加密后的密码 |
| last_sync_uid | INTEGER | NULL | 最后同步的邮件 UID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

### invoices — 发票

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTO | 主键 |
| invoice_number | TEXT | UNIQUE | 发票号码 |
| invoice_code | TEXT | | 发票代码 |
| invoice_date | DATE | | 开票日期 |
| invoice_type | TEXT | | 发票类型 (普票/专票/全电) |
| seller_name | TEXT | | 销方名称 |
| seller_tax_id | TEXT | | 销方税号 |
| buyer_name | TEXT | | 购方名称 |
| buyer_tax_id | TEXT | | 购方税号 |
| amount | DECIMAL(12,2) | | 金额 (不含税) |
| tax_amount | DECIMAL(12,2) | | 税额 |
| total_amount | DECIMAL(12,2) | | 价税合计 |
| file_path | TEXT | NOT NULL | 发票文件本地路径 |
| file_type | TEXT | NOT NULL CHECK | 文件类型: pdf / ofd / xml |
| file_name | TEXT | | 原始文件名 |
| source | TEXT | NOT NULL DEFAULT 'manual' | 来源: email / manual |
| email_account_id | INTEGER | FK → email_accounts(id) | 来源邮箱账户 |
| email_subject | TEXT | | 来源邮件主题 |
| status | TEXT | NOT NULL DEFAULT 'unreimbursed' | 状态: reimbursed / unreimbursed |
| reimbursement_id | INTEGER | FK → reimbursements(id) | 关联报销单 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

**索引**: `idx_invoices_status` (status), `idx_invoices_date` (invoice_date), `idx_invoices_number` (invoice_number)

### reimbursements — 报销单

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK AUTO | 主键 |
| title | TEXT | NOT NULL | 报销单标题 |
| reason | TEXT | NOT NULL | 报销事由 |
| target_amount | DECIMAL(12,2) | NOT NULL | 目标报销金额 |
| actual_amount | DECIMAL(12,2) | | 实际匹配金额 |
| date | DATE | NOT NULL | 报销日期 |
| status | TEXT | NOT NULL DEFAULT 'draft' | 状态: draft / sent / approved / rejected |
| email_to | TEXT | | 发送目标邮箱 |
| email_sent_at | DATETIME | | 邮件发送时间 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新时间 |

### reimbursement_invoices — 报销单-发票关联

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| reimbursement_id | INTEGER | FK → reimbursements(id) CASCADE | 报销单 ID |
| invoice_id | INTEGER | FK → invoices(id) CASCADE | 发票 ID |

**联合主键**: `(reimbursement_id, invoice_id)`

### settings — 全局设置 (Key-Value)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| key | TEXT | PK | 设置键名 |
| value | TEXT | NOT NULL | 设置值 |

**预定义键**:
- `baidu_ocr_api_key`: 百度 OCR API Key
- `baidu_ocr_secret_key`: 百度 OCR Secret Key
- `default_sender_account_id`: 默认发件邮箱 ID
- `reimbursement_email_template`: 报销邮件模板

### schema_version — 迁移版本

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| version | INTEGER | PK | 迁移版本号 |
| applied_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 应用时间 |

## 迁移机制

迁移定义在 `src/main/services/database.ts` 的 `MIGRATIONS` Map 中:

```typescript
const MIGRATIONS: Map<number, string> = new Map([
  [1, 'CREATE TABLE IF NOT EXISTS ...'],  // 初始 Schema
  // [2, 'ALTER TABLE invoices ADD COLUMN ...'],  // 后续迁移
])
```

启动时:
1. 读取 `schema_version` 表的当前版本
2. 按版本号顺序执行未应用的迁移
3. 每个迁移在一个事务内执行

## ER 关系

```
email_accounts ──1:N──► invoices
                          │
reimbursements ──M:N──► invoices  (通过 reimbursement_invoices)
```

- 一个邮箱账户可关联多封发票 (email 来源)
- 一个报销单可关联多张发票 (多对多)
- 一张发票只能属于一个报销单 (reimbursement_id 字段)
- 删除邮箱账户时，关联发票的 email_account_id 设为 NULL
- 删除报销单时，自动恢复关联发票状态为 unreimbursed
