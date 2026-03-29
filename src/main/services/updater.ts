import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

// ============================================================
// Updater — 自动更新服务
// ============================================================

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

let mainWindow: BrowserWindow | null = null

function sendStatus(status: UpdateStatus, info?: string): void {
  mainWindow?.webContents.send('updater:status', status, info)
}

function sendProgress(progress: { percent: number; transferred: number; total: number }): void {
  mainWindow?.webContents.send('updater:progress', progress)
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  // 开发环境不检查更新
  if (process.env.NODE_ENV === 'development') return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus('available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus('not-available')
  })

  autoUpdater.on('download-progress', (progressInfo) => {
    sendProgress({
      percent: Math.round(progressInfo.percent),
      transferred: progressInfo.transferred,
      total: progressInfo.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    sendStatus('downloaded')
  })

  autoUpdater.on('error', (err) => {
    sendStatus('error', err.message)
  })

  // 启动时静默检查
  autoUpdater.checkForUpdates().catch(() => {})
}

// ============================================================
// IPC Registration
// ============================================================

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates()
      return { success: true, data: undefined }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true, data: undefined }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('updater:install', () => {
    setImmediate(() => autoUpdater.quitAndInstall())
    return { success: true, data: undefined }
  })
}
