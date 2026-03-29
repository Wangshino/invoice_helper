import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase, getDb } from './services/database'
import { registerIpcHandlers } from './ipc'

// ============================================================
// Window State Persistence (using SQLite settings table)
// ============================================================

interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

function loadWindowBounds(): WindowBounds {
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'window_bounds'").get() as { value: string } | undefined
    if (row) return JSON.parse(row.value) as WindowBounds
  } catch { /* db not ready yet */ }
  return { width: 1200, height: 800 }
}

function saveWindowBounds(bounds: WindowBounds): void {
  try {
    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('window_bounds', ?)").run(JSON.stringify(bounds))
  } catch { /* ignore */ }
}

// ============================================================
// Application Menu
// ============================================================

function buildAppMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭' }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

// ============================================================
// Window Creation
// ============================================================

function createWindow(): void {
  const bounds = loadWindowBounds()

  const mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x != null && bounds.y != null ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: '发票管理助手',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (bounds.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Persist window bounds on move/resize
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (mainWindow.isDestroyed()) return
      const isMaximized = mainWindow.isMaximized()
      if (!isMaximized) {
        const rect = mainWindow.getBounds()
        saveWindowBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, isMaximized: false })
      } else {
        saveWindowBounds({ ...loadWindowBounds(), isMaximized: true })
      }
    }, 500)
  }

  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  mainWindow.on('maximize', saveBounds)
  mainWindow.on('unmaximize', saveBounds)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============================================================
// App Lifecycle
// ============================================================

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.invoice-helper')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set application menu
  Menu.setApplicationMenu(buildAppMenu())

  // Initialize database
  initDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
