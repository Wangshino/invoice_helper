# Invoice Helper - 发票管理助手

## 项目概述
Electron + React + TypeScript 桌面应用，用于发票管理和智能报销匹配。

## 技术栈
- **框架**: Electron 38 + React 19 + TypeScript 5
- **构建**: electron-vite 4 (Vite 7)
- **UI**: Ant Design 5
- **路由**: React Router 7
- **状态**: Zustand
- **数据库**: better-sqlite3 (SQLite, WAL模式)
- **邮件读取**: imapflow
- **邮件发送**: nodemailer
- **OFD解析**: invoice-ofd2json
- **XML解析**: fast-xml-parser
- **PDF识别**: 百度OCR增值税发票API

## 常用命令
```bash
npm run dev          # 开发模式 (HMR + Electron)
npm run build        # 类型检查 + 构建
npm run start        # 预览生产构建
npm run build:mac    # macOS 打包
npm run build:win    # Windows 打包
npm run typecheck    # 类型检查
```

## 项目结构
```
src/
├── main/            # Electron 主进程
│   ├── index.ts     # 入口
│   ├── ipc/         # IPC 处理器 (主进程-渲染进程通信)
│   └── services/    # 业务服务 (数据库/邮件/解析/匹配)
├── preload/         # 预加载脚本 (安全桥接)
└── renderer/        # React 渲染进程
    └── src/
        ├── pages/   # 页面组件
        ├── components/ # UI组件
        └── stores/  # Zustand 状态管理
```

## 架构说明
- 主进程负责所有 Node.js 操作 (数据库、文件、邮件、OCR)
- 渲染进程通过 `window.api` (preload 暴露的 IPC) 与主进程通信
- IPC 通道命名: `<模块>:<操作>` (如 `invoices:getAll`)
- 数据库文件位于 `~/Library/Application Support/invoice-helper/data/invoice-helper.db`

## 发票解析管线
1. **OFD文件**: `invoice-ofd2json` 直接解析 → JSON
2. **XML文件**: `fast-xml-parser` 解析全电发票 → JSON
3. **PDF文件**: 百度OCR API 识别 → JSON (需配置API Key)

## 智能匹配算法
动态规划子集和算法，在未报销发票中找到总和最接近目标金额的组合。
返回 Top 3 方案，优先精确匹配。
