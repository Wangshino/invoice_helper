import { BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import packageJson from '../../../package.json'

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

/** macOS 未签名 app 无法自动更新，需要打开 Release 页面手动下载 */
const isMacOS = process.platform === 'darwin'

/** 获取 GitHub Release 页面 URL */
function getReleasePageUrl(tag?: string): string {
  const repo = (packageJson as Record<string, unknown>).homepage as string
  return tag ? `${repo}/releases/tag/${tag}` : `${repo}/releases/latest`
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  // 开发环境不检查更新
  if (process.env.NODE_ENV === 'development') return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = !isMacOS

  autoUpdater.on('checking-for-update', () => {
    sendStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus('available', isMacOS ? `mac-open:${info.version}` : info.version)
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
      // macOS 未签名 app 直接打开 Release 页面下载 dmg
      if (isMacOS) {
        const updateCheckResult = await autoUpdater.checkForUpdates()
        const version = updateCheckResult?.updateInfo?.version
        shell.openExternal(getReleasePageUrl(version ? `v${version}` : undefined))
        return { success: true, data: 'opened-browser' }
      }
      await autoUpdater.downloadUpdate()
      return { success: true, data: undefined }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('updater:install', () => {
    if (isMacOS) return { success: true, data: undefined }
    setImmediate(() => autoUpdater.quitAndInstall())
    return { success: true, data: undefined }
  })
}
