import type {
  CleanerSettings,
  PreviewItem,
  SyncConfig,
  SyncPreviewItem,
} from '@/types'

declare global {
  interface Window {
    go?: { main?: { App?: Record<string, (...args: unknown[]) => Promise<unknown>> } }
    runtime?: {
      EventsOn: (event: string, cb: (data: unknown) => void) => void
      EventsOff: (event: string) => void
      WindowMinimise: () => void
      WindowToggleMaximise: () => void
      Quit: () => void
    }
  }
}

const isWails = () => !!window.go?.main?.App

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (isWails() && window.go?.main?.App?.[method]) {
    return window.go.main.App[method](...args) as Promise<T>
  }
  throw new Error(`Not in Wails env or method missing: ${method}`)
}

export const bridge = {
  // 通用
  getTheme: () => call<string>('GetTheme'),
  setTheme: (theme: string) => call<void>('SetTheme', theme),
  selectDirectory: () => call<string>('SelectDirectory'),
  getDirSize: (path: string) => call<number>('GetDirSize', path),

  // 窗口控制
  windowMinimise: () => call<void>('WindowMinimise'),
  windowToggleMaximise: () => call<void>('WindowToggleMaximise'),
  windowClose: () => call<void>('WindowClose'),
  windowIsMaximised: () => call<boolean>('WindowIsMaximised'),
  windowSetAlwaysOnTop: (on: boolean) => call<void>('WindowSetAlwaysOnTop', on),

  // Sync
  getSyncConfig:       () => call<SyncConfig>('GetSyncConfig'),
  saveSyncConfig:      (c: SyncConfig) => call<void>('SaveSyncConfig', c),
  previewSync:         (c: SyncConfig) => call<SyncPreviewItem[]>('PreviewSync', c),
  startSync:           (c: SyncConfig) => call<void>('StartSync', c),
  stopSync:            () => call<void>('StopSync'),
  isSyncRunning:       () => call<boolean>('IsSyncRunning'),
  resolveSyncConflict: (decision: string) => call<void>('ResolveSyncConflict', decision),

  // Cleaner
  getCleanerSettings:  () => call<CleanerSettings>('GetCleanerSettings'),
  saveCleanerSettings: (s: CleanerSettings) => call<void>('SaveCleanerSettings', s),
  previewClean:        (s: CleanerSettings) => call<PreviewItem[]>('PreviewClean', s),
  startClean:          (s: CleanerSettings) => call<void>('StartClean', s),
  stopClean:           () => call<void>('StopClean'),
  isCleanRunning:      () => call<boolean>('IsCleanRunning'),
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11)
}
