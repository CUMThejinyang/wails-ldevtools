import type {
  ApiGlobalConfig,
  BackupMeta,
  HttpRequestParams,
  HttpResponseData,
  BackupSnapshot,
  BatchSaveResult,
  CleanerSettings,
  EnvChange,
  EnvEntry,
  EnvScope,
  FileItem,
  FTPConfig,
  FTPStatus,
  FTPLogEntry,
  ImportPreview,
  LocalServerConfig,
  LogEntry,
  OperationResult,
  PathSegment,
  PathValidation,
  PortEntry,
  PortViewerPrefs,
  PreviewItem,
  ServerStatus,
  SFTPConfig,
  SFTPStatus,
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
  selectFile: (title: string) => call<string>('SelectFile', title),
  selectSaveFile: (title: string) => call<string>('SelectSaveFile', title),
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

  // Codec
  hashText: (text: string, algo: string) => call<string>('HashText', text, algo),
  hashFile: (path: string, algo: string) => call<string>('HashFile', path, algo),

  // Cleaner
  getCleanerSettings:  () => call<CleanerSettings>('GetCleanerSettings'),
  saveCleanerSettings: (s: CleanerSettings) => call<void>('SaveCleanerSettings', s),
  previewClean:        (s: CleanerSettings) => call<PreviewItem[]>('PreviewClean', s),
  startClean:          (s: CleanerSettings) => call<void>('StartClean', s),
  stopClean:           () => call<void>('StopClean'),
  isCleanRunning:      () => call<boolean>('IsCleanRunning'),

  // Env
  listEnv: (scope: EnvScope) => call<EnvEntry[]>('ListEnv', scope),
  getEnv: (scope: EnvScope, name: string) => call<EnvEntry>('GetEnv', scope, name),
  setEnv: (scope: EnvScope, name: string, value: string, type: string) => call<BatchSaveResult>('SetEnv', scope, name, value, type),
  deleteEnv: (scope: EnvScope, name: string) => call<BatchSaveResult>('DeleteEnv', scope, name),
  saveEnvBatch: (changes: EnvChange[]) => call<BatchSaveResult>('SaveEnvBatch', changes),
  parsePath: (scope: EnvScope) => call<PathSegment[]>('ParsePath', scope),
  parseAllPathSegments: () => call<PathSegment[]>('ParseAllPathSegments'),
  savePath: (segments: PathSegment[]) => call<BatchSaveResult>('SavePath', segments),
  validatePath: (paths: string[]) => call<PathValidation[]>('ValidatePath', paths),
  snapshot: (note: string) => call<BackupMeta>('Snapshot', note),
  listBackups: () => call<BackupMeta[]>('ListBackups'),
  restoreBackup: (id: string) => call<BatchSaveResult>('RestoreBackup', id),
  deleteBackup: (id: string) => call<OperationResult>('DeleteBackup', id),
  loadBackup: (id: string) => call<BackupSnapshot>('LoadBackup', id),
  exportEnvFile: (scope: EnvScope, outPath: string) => call<OperationResult>('ExportEnvFile', scope, outPath),
  importEnvFilePreview: (path: string, scope: EnvScope) => call<ImportPreview>('ImportEnvFilePreview', path, scope),
  importEnvFileCommit: (preview: ImportPreview) => call<BatchSaveResult>('ImportEnvFileCommit', preview),
  isElevated: () => call<boolean>('IsElevated'),
  broadcastEnvChange: () => call<OperationResult>('BroadcastEnvChange'),
  getHighRiskVariables: () => call<string[]>('GetHighRiskVariables'),

  // Local Server
  startServer: (cfg: LocalServerConfig) => call<void>('StartServer', cfg),
  stopServer: () => call<void>('StopServer'),
  getServerStatus: () => call<ServerStatus>('GetServerStatus'),
  getServerLogs: (n: number) => call<LogEntry[]>('GetServerLogs', n),
  listLanAddresses: () => call<string[]>('ListLanAddresses'),
  getLocalServerConfig: () => call<LocalServerConfig>('GetLocalServerConfig'),
  saveLocalServerConfig: (cfg: LocalServerConfig) => call<void>('SaveLocalServerConfig', cfg),
  listServerFiles: (subPath: string) => call<FileItem[]>('ListServerFiles', subPath),

  // FTP Server
  startFTP: (cfg: FTPConfig) => call<void>('StartFTP', cfg),
  stopFTP: () => call<void>('StopFTP'),
  getFTPStatus: () => call<FTPStatus>('GetFTPStatus'),
  getFTPLogs: (n: number) => call<FTPLogEntry[]>('GetFTPLogs', n),
  getFtpConfig: () => call<FTPConfig>('GetFtpConfig'),
  saveFtpConfig: (cfg: FTPConfig) => call<void>('SaveFtpConfig', cfg),

  // SFTP Server
  startSFTP: (cfg: SFTPConfig) => call<void>('StartSFTP', cfg),
  stopSFTP: () => call<void>('StopSFTP'),
  getSFTPStatus: () => call<SFTPStatus>('GetSFTPStatus'),
  getSftpConfig: () => call<SFTPConfig>('GetSftpConfig'),
  saveSftpConfig: (cfg: SFTPConfig) => call<void>('SaveSftpConfig', cfg),

  // Port Viewer
  listPorts: () => call<PortEntry[]>('ListPorts'),
  killPortProcess: (pid: number) => call<string>('KillPortProcess', pid),
  killPortProcesses: (pids: number[]) => call<string>('KillPortProcesses', pids),
  isPortElevated: () => call<boolean>('IsPortElevated'),
  openInBrowser: (url: string) => call<void>('OpenInBrowser', url),
  getPortViewerPrefs: () => call<PortViewerPrefs>('GetPortViewerPrefs'),
  savePortViewerPrefs: (prefs: PortViewerPrefs) => call<void>('SavePortViewerPrefs', prefs),

  // API Debugger
  sendHttpRequest: (params: HttpRequestParams) => call<HttpResponseData>('SendHttpRequest', params),
  getApiConfig: () => call<ApiGlobalConfig>('GetApiConfig'),
  saveApiConfig: (cfg: ApiGlobalConfig) => call<void>('SaveApiConfig', cfg),
  readTextFile: (path: string) => call<string>('ReadTextFile', path),
  writeTextFile: (path: string, content: string) => call<void>('WriteTextFile', path, content),
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
