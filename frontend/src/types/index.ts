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
export type PageId = 'cleaner' | 'settings'

export interface NavItem {
  id: PageId
  label: string
}
