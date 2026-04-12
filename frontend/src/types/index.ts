export interface FolderConfig {
  id: string
  name: string
  path: string
  patterns: string[]
  recursive: boolean
  deleteEmptyDirs: boolean
  deleteFolder: boolean   // 清理完成后删除文件夹本身
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

// 可扩展：在此添加新页面 ID
export type PageId = 'cleaner' | 'sync' | 'settings'

// ── Sync ──
export type ConflictMode = 'overwrite' | 'skip' | 'ask'

export interface SyncConfig {
  src: string
  dst: string
  conflict: ConflictMode
  recursive: boolean
  patterns: string[]   // 空 = 全部
  threadCount: number
}

export type SyncFileStatus = 'new' | 'modified' | 'identical' | 'pending' | 'syncing' | 'synced' | 'skipped' | 'error'

export interface SyncPreviewItem {
  relativePath: string
  srcPath: string
  dstPath: string
  size: number
  status: SyncFileStatus   // preview 阶段: new | modified | identical
  error?: string
}

export interface NavItem {
  id: PageId
  label: string
}
