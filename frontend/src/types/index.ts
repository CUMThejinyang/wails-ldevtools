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

export type PageId = 'cleaner' | 'sync' | 'codec' | 'env' | 'localserver' | 'ports' | 'settings' | 'apidebug'

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

// ── Local Server ──

export interface LocalServerConfig {
  root: string
  port: number
  bindLocal: boolean
  spaMode: boolean
  singleFile: boolean
  indexName: string
  authEnabled: boolean
  authUser: string
  authPass: string
}

export interface ServerStatus {
  running: boolean
  root: string
  port: number
  bindLocal: boolean
  mode: string
  authEnabled: boolean
  startedAt: string
  stats: { totalRequests: number; totalBytes: number }
  urls: string[]
}

export interface LogEntry {
  time: string
  remoteAddr: string
  method: string
  path: string
  status: number
  bytes: number
  durationMs: number
  userAgent: string
}

export interface FileItem {
  name: string
  path: string
  size: number
  isDir: boolean
  modTime: string
}

// ── Port Viewer ──

export interface PortEntry {
  protocol: string
  family: string
  localAddr: string
  localPort: number
  remoteAddr: string
  remotePort: number
  state: string
  pid: number
  processName: string
  exePath: string
}

export interface PortViewerPrefs {
  pollInterval: number
  protocol: string
  family: string
  states: string[]
}

// ── FTP Server ──

export interface FTPConfig {
  root: string
  port: number
  bindLocal: boolean
  authEnabled: boolean
  authUser: string
  authPass: string
  allowAnonymous: boolean
}

export interface FTPStatus {
  running: boolean
  root: string
  port: number
  bindLocal: boolean
  authEnabled: boolean
  allowAnonymous: boolean
  startedAt: string
  activeConns: number
  totalConns: number
  urls: string[]
}

export interface FTPLogEntry {
  time: string
  remoteAddr: string
  command: string
  args: string
  response: string
  code: number
}

// ── SFTP Server ──

export interface SFTPConfig {
  root: string
  port: number
  bindLocal: boolean
  authUser: string
  authPass: string
}

export interface SFTPStatus {
  running: boolean
  root: string
  port: number
  bindLocal: boolean
  startedAt: string
  activeConns: number
  urls: string[]
}

// ── API Debugger HTTP Proxy ──

export interface HttpMultipartItem {
  key: string
  value: string
  kind: 'text' | 'file'
  filePath?: string
}

export interface HttpRequestParams {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  multipartItems?: HttpMultipartItem[]
}

export interface HttpResponseData {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
  durationMs: number
}

// ── API Debugger ──

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export interface ApiKvPair {
  key: string
  value: string
  enabled: boolean
  description?: string
}

export interface ApiFormItem extends ApiKvPair {
  type: 'text' | 'file'
  filePath?: string
}

export type ApiBodyType = 'none' | 'json' | 'form-data' | 'urlencoded' | 'raw'

export interface ApiRequestBody {
  type: ApiBodyType
  jsonContent?: string
  formItems?: ApiFormItem[]
  urlencodedItems?: ApiKvPair[]
  rawContent?: string
  rawContentType?: string
}

export interface ApiAuth {
  type: 'none' | 'bearer' | 'basic'
  token?: string
  username?: string
  password?: string
}

export interface ApiRequest {
  id: string
  name: string
  method: ApiMethod
  url: string
  params: ApiKvPair[]
  headers: ApiKvPair[]
  body: ApiRequestBody
  auth: ApiAuth
}

export interface ResponseSnapshot {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
  durationMs: number
  cookies: ApiCookieEntry[]
}

export interface ApiCookieEntry {
  name: string
  value: string
  domain: string
  path: string
  expires?: string
  httpOnly: boolean
  secure: boolean
}

export interface HistoryEntry {
  id: string
  timestamp: number
  request: ApiRequest
  response: ResponseSnapshot
  usedEnvId: string | null
}

export interface ApiEnv {
  id: string
  name: string
  variables: ApiKvPair[]
  headers: ApiKvPair[]
}

export interface ApiCollection {
  id: string
  name: string
  children: (ApiCollection | ApiRequest)[]
  headers: ApiKvPair[]
}

export interface ApiGlobalConfig {
  globalHeaders: ApiKvPair[]
  environments: ApiEnv[]
  activeEnvId: string | null
  collections: ApiCollection[]
  historyLimit: number
}
