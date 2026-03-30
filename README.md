# 发票管理助手 (Invoice Helper)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/Wangshino/invoice_helper?include_prereleases)](https://github.com/Wangshino/invoice_helper/releases)

一款基于 Electron 的桌面端发票管理与智能报销工具。支持 PDF/OFD/XML 多格式发票解析、邮件自动导入、智能金额匹配、报销单管理及邮件发送。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

---

## 功能特性

- **多格式发票解析** — 支持 PDF（OCR识别）、OFD、XML（全电发票）三种格式
- **邮件自动导入** — 配置 IMAP 邮箱账户，自动同步邮件附件中的发票
- **智能匹配算法** — 动态规划子集和算法，自动找到最优发票组合匹配目标金额
- **报销单管理** — 创建报销单、关联发票、自定义邮件模板一键发送
- **文件预览** — 应用内直接预览 PDF/OFD/XML 发票文件
- **发票编辑** — 支持手动编辑发票解析字段（带慎重提醒）
- **手动分类** — 为发票设置分类标签，支持分类筛选与批量分类
- **标准化命名** — 发票附件自动按「发票号-内容-金额-日期」规则命名
- **全文搜索** — 基于 SQLite FTS5 + trigram 中文分词的高效搜索
- **服务端分页** — SQL 层分页查询，大数据量下保持流畅
- **数据导出** — 发票台账 CSV 导出（支持当前筛选条件）
- **报销单编辑** — 草稿状态报销单支持修改标题、事由、重新匹配发票
- **Dashboard 增强** — 月度金额趋势折线图 + 分类金额分布饼图
- **批量操作** — 批量分类、批量加入报销单、批量重命名
- **数据备份恢复** — 一键备份/恢复数据库与发票文件（ZIP 格式）
- **Zustand 状态管理** — 全局 Store 实现跨页面数据共享与缓存
- **CSS Modules** — 样式体系化，设计 Token 一致性
- **自动更新** — 支持应用内检查更新，一键下载安装新版本

## 截图预览

> *待补充*

## 下载安装

前往 [Releases](https://github.com/Wangshino/invoice_helper/releases) 下载最新版本：

| 平台 | 文件 |
|------|------|
| macOS | `.dmg` |
| Windows | `.exe` (NSIS 安装包) |
| Linux | `.AppImage` / `.deb` |

## 快速开始（开发）

### 环境要求

- Node.js >= 20
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建打包

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

### 常用命令

```bash
npm run dev          # 开发模式 (HMR + Electron)
npm run build        # 类型检查 + 构建
npm run start        # 预览生产构建
npm run typecheck    # TypeScript 类型检查
```

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 38 + React 19 + TypeScript 5 |
| 构建 | electron-vite 4 (Vite 7) |
| UI | Ant Design 6 |
| 路由 | React Router 7 |
| 状态管理 | Zustand 5 |
| 数据库 | better-sqlite3 (SQLite, WAL 模式) |
| 邮件读取 | imapflow |
| 邮件发送 | nodemailer |
| OFD 解析 | invoice-ofd2json |
| XML 解析 | fast-xml-parser |
| PDF 识别 | 百度 OCR 增值税发票 API |
| 自动更新 | electron-updater |

## 项目结构

```
src/
├── main/               # Electron 主进程
│   ├── index.ts        # 应用入口、窗口管理、菜单
│   ├── ipc/            # IPC 处理器 (主进程 ↔ 渲染进程)
│   ├── repositories/   # 数据访问层 (SQLite)
│   └── services/       # 业务服务
│       ├── database.ts       # 数据库初始化与迁移
│       ├── invoice-parser.ts # 发票文件解析 + 标准化命名
│       ├── invoice-ocr.ts    # 百度 OCR 集成
│       ├── email-imap.ts     # IMAP 邮件读取
│       ├── email-sync.ts     # 邮件同步服务
│       ├── email-sender.ts   # 邮件发送服务
│       ├── matching.ts       # 智能匹配算法
│       ├── backup.ts         # 数据备份与恢复
│       └── updater.ts        # 自动更新服务
├── preload/            # 预加载脚本 (安全桥接)
│   ├── index.ts        # API 暴露
│   └── index.d.ts      # 类型声明
├── renderer/           # React 渲染进程
│   └── src/
│       ├── pages/      # 页面组件
│       │   ├── Dashboard.tsx           # 首页概览 (趋势图/分布图)
│       │   ├── Invoices.tsx            # 发票管理 (分页/搜索/编辑/分类/导出)
│       │   ├── EmailImport.tsx         # 邮件导入
│       │   ├── EmailSettings.tsx       # 邮箱配置
│       │   ├── EmailTemplateSettings.tsx  # 邮件模板
│       │   ├── ReimbursementCreate.tsx    # 创建/编辑报销单
│       │   └── ReimbursementList.tsx      # 报销单列表 (分页)
│       ├── stores/     # Zustand 全局状态管理
│       └── components/ # 通用组件
│           ├── Layout.tsx       # 应用布局 (侧边栏 + 备份恢复)
│           └── InvoicePreview.tsx  # 发票文件预览
└── shared/             # 主进程与渲染进程共享类型
    └── types.ts
```

## 架构说明

- **主进程**：负责所有 Node.js 操作（数据库、文件系统、邮件、OCR、自动更新）
- **渲染进程**：React SPA，通过 `window.api`（preload 暴露的 IPC）与主进程通信
- **IPC 通道命名**：`<模块>:<操作>`（如 `invoices:getAll`、`reimbursements:sendEmail`）
- **数据存储**：SQLite 数据库，位于用户数据目录下

## 发票解析流程

```
PDF 文件 → 百度 OCR API → 结构化数据
OFD 文件 → invoice-ofd2json 解析 → 结构化数据
XML 文件 → fast-xml-parser 解析 → 结构化数据
```

## 自动更新

应用使用 `electron-updater` 实现自动更新：

1. 推送 `v*` 格式 tag 触发 GitHub Actions 构建
2. 构建产物自动发布到 GitHub Releases
3. 应用内「关于」弹窗可手动检查更新

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 许可证

[MIT](LICENSE)

---

> **Author**: [Wangshino](https://github.com/Wangshino)
>
> If you find this project helpful, please consider giving it a ⭐️!
