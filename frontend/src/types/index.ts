export interface FolderConfig {
  id: string
  name: string
  path: string
  patterns: string[]
  recursive: boolean
  deleteEmptyDirs: boolean
  deleteFolder: boolean
  enabled: boolean
}

export interface CleanerSettings {
  folders: FolderConfig[]
  threadCount: number
}

export interface CleanProgress {
  folderId: string
  folderName: string
  currentFile: string
  deletedFiles: number
  deletedSize: number
  totalFiles: number
  status: 'scanning' | 'deleting' | 'done' | 'error' | 'cancelled'
  error?: string
}

export interface FolderResult {
  folderId: string
  folderName: string
  path: string
  deletedFiles: number
  deletedSize: number
  error?: string
  duration: string
}

export interface OverallResult {
  results: FolderResult[]
  totalDeleted: number
  totalSize: number
  duration: string
  cancelled: boolean
}

export interface PreviewItem {
  folderId: string
  folderName: string
  filePath: string
  size: number
  isDir: boolean
}

export type EnvScope = 'user' | 'system'
export type EnvValueType = 'sz' | 'expand_sz'

export interface EnvEntry {
  name: string
  value: string
  type: EnvValueType
  scope: EnvScope
}

export interface EnvChange {
  name: string
  value: string
  type: EnvValueType
  scope: EnvScope
  delete?: boolean
}

export interface OperationResult {
  ok: boolean
  cancelled?: boolean
  error?: string
}

export interface BatchSaveResult {
  user: OperationResult
  system: OperationResult
}

export interface PathSegment {
  raw: string
  expanded: string
  scope: EnvScope
  exists: boolean
  isDir: boolean
  duplicateOf: number
}

export interface PathValidation {
  path: string
  expandedValue: string
  exists: boolean
  isDir: boolean
}

export interface BackupMeta {
  id: string
  timestamp: number
  note?: string
  userCount: number
  systemCount: number
  corrupt?: boolean
}

export interface BackupSnapshot {
  timestamp: number
  note?: string
  user: EnvEntry[]
  system: EnvEntry[]
}

export interface ImportError {
  line: number
  raw: string
  reason: string
}

export interface ImportPreview {
  changes: EnvChange[]
  errors: ImportError[]
}

export type PageId = 'cleaner' | 'sync' | 'codec' | 'env' | 'settings'

// ── Sync ──
export type ConflictMode = 'overwrite' | 'skip' | 'ask'

export interface SyncConfig {
  src: string
  dst: string
  conflict: ConflictMode
  recursive: boolean
  patterns: string[]
  threadCount: number
}

export type SyncFileStatus =
  | 'new' | 'modified' | 'identical'
  | 'pending' | 'syncing' | 'synced' | 'skipped' | 'error'

export interface SyncPreviewItem {
  relativePath: string
  srcPath: string
  dstPath: string
  size: number
  status: SyncFileStatus
  error?: string
}

export interface NavItem {
  id: PageId
  label: string
}

export type ThemeMode = 'dark' | 'light'
