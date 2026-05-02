# API 调试器设计规格

## 概述

为 DevTools 添加一个 API 调试器模块，支持 REST API 和 WebSocket 调试，具备全局/环境级 Header 管理、请求集合、历史记录、环境变量、导入导出等能力。

## 架构决策

**方案：纯前端方案**

所有 HTTP 请求、WebSocket 连接、历史记录、集合管理都在前端 JS 层完成。Go 后端只负责：
- 配置持久化（`~/.devtools/api-config.json`）
- Cookie jar 持久化（浏览器无法跨域管理 cookie）
- 文件对话框（导入导出）

理由：Wails webview 不受 CORS 限制，`fetch` + `WebSocket` 完全满足调试需求，开发量最小。

## 页面布局

三栏式布局：

```
┌──────────────────────────────────────────────────┐
│  API 调试器                                        │
├────────┬─────────────────────────────────────────┤
│        │  ┌─ URL 栏 ──────────────────────────┐  │
│ 侧边栏  │  │ [GET▼] https://api.example.com/  │  │
│        │  │ [环境选择▼]           [发送] [保存] │  │
│ 集合    │  └──────────────────────────────────┘  │
│ ├ 项目A │  ┌─ 请求构建（Tabs）────────────────┐  │
│ │ └ 登录 │  │ [Params][Headers][Body][Auth]    │  │
│ │ └ 列表 │  │                                  │  │
│ └ 项目B │  │  key-value 编辑器 / JSON 编辑器   │  │
│        │  └──────────────────────────────────┘  │
│ 历史    │  ┌─ 响应查看（Tabs）────────────────┐  │
│ ├ 14:30 │  │ [Body][Headers][Cookies][统计]    │  │
│ ├ 14:28 │  │                                  │  │
│ └ 14:25 │  │  格式化 JSON + 搜索              │  │
│        │  └──────────────────────────────────┘  │
└────────┴─────────────────────────────────────────┘
```

- 左侧边栏：上方集合树（可折叠文件夹），下方历史记录列表
- 主区域上半：URL 栏 + 请求构建区（上下分区，可拖拽调整比例）
- 主区域下半：响应查看区

## 数据模型

### 请求定义

```typescript
interface ApiRequest {
  id: string
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  url: string                    // 支持 {{variable}} 模板语法
  params: KvPair[]
  headers: KvPair[]
  body: RequestBody | null
  auth: RequestAuth | null
}

type RequestBody =
  | { type: 'json'; content: string }
  | { type: 'form-data'; items: FormItem[] }
  | { type: 'urlencoded'; items: KvPair[] }
  | { type: 'raw'; content: string; contentType: string }

interface KvPair {
  key: string
  value: string
  enabled: boolean
  description?: string
}

interface FormItem extends KvPair {
  type: 'text' | 'file'
  filePath?: string
}

interface RequestAuth {
  type: 'none' | 'bearer' | 'basic'
  token?: string        // bearer
  username?: string     // basic
  password?: string     // basic
}
```

### 集合

```typescript
interface ApiCollection {
  id: string
  name: string
  children: (ApiCollection | ApiRequest)[]  // 嵌套文件夹
  headers: KvPair[]                         // 集合级 header
}
```

### 环境与全局配置

```typescript
interface ApiEnvironment {
  id: string
  name: string
  variables: KvPair[]
  headers: KvPair[]
}

interface ApiGlobalConfig {
  globalHeaders: KvPair[]
  environments: ApiEnvironment[]
  activeEnvId: string | null
  collections: ApiCollection[]
  historyLimit: number   // 默认 100
}
```

### 历史记录与响应快照

```typescript
interface HistoryEntry {
  id: string
  timestamp: number
  request: ApiRequest
  response: ResponseSnapshot
  usedEnvId: string | null
}

interface ResponseSnapshot {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  size: number
  durationMs: number
  cookies: CookieEntry[]
}

interface CookieEntry {
  name: string
  value: string
  domain: string
  path: string
  expires?: string
  httpOnly: boolean
  secure: boolean
}
```

### Header 优先级（从高到低）

1. 请求级 `headers`
2. 环境级 `headers`（当前选中环境）
3. 集合级 `headers`（请求所属集合）
4. 全局 `globalHeaders`

## 请求构建器

### URL 栏

- 左侧下拉选择 HTTP Method，带颜色标识（GET 绿、POST 橙、PUT 蓝、DELETE 红）
- 中间 URL 输入框，`{{var}}` 模板变量高亮
- 右侧环境下拉 + 发送按钮 + 保存到集合按钮

### Params Tab

- Key-Value 表格编辑器，勾选框控制 enabled
- 支持批量粘贴（从 `a=1&b=2` 格式解析）
- URL 中的 query 参数自动同步

### Headers Tab

- Key-Value 表格编辑器
- 底部显示合并后的最终 Header 预览（标注来源层级）
- 常用 Header 快捷添加（Content-Type、Authorization、Accept）

### Body Tab（按子模式切换）

- **none**：无请求体
- **JSON**：Monaco Editor，自带格式化和语法校验
- **form-data**：Key-Value 表格 + 文件选择按钮（文件通过 Go 后端读取）
- **x-www-form-urlencoded**：Key-Value 表格
- **Raw**：纯文本编辑器 + 自定义 Content-Type

### Auth Tab

- 类型选择：None / Bearer Token / Basic Auth
- Bearer：输入框，自动映射为 `Authorization: Bearer {{token}}`
- Basic：用户名 + 密码，自动 Base64 编码

## 响应查看器

### Body Tab

- 自动检测内容类型：
  - JSON → 格式化树状（可折叠）+ 原始文本可切换
  - XML → 格式化展示
  - HTML/Image → 预览渲染
  - 其他 → 纯文本
- 工具栏：美化 / 原始 / 复制 / 下载 / 搜索
- 搜索支持 JSON Path 过滤（如 `$.data.items[0].name`）

### Headers Tab

- 响应头列表，Key-Value 展示
- 点击值可复制
- 高亮重要 Header（Content-Type、Set-Cookie、Cache-Control）

### Cookies Tab

- 表格：Name / Value / Domain / Path / Expires / HttpOnly / Secure
- 来源标注（Set-Cookie 解析 / 已持久化）

### 统计 Tab

- 状态码（带颜色标签：2xx 绿、4xx 橙、5xx 红）
- 耗时（DNS / 连接 / TTFB / 内容下载 / 总耗时，进度条可视化）
- 响应体大小
- 请求/响应 Header 大小

## WebSocket 模式

当 URL 栏选择 WS 类型时，主区域切换为 WebSocket 专用布局：

```
┌─────────────────────────────────────────┐
│ [WS▼] ws://localhost:8080/ws  [连接] [断开] │
│ [Headers 编辑] [Params]                    │
├─────────────────────────────────────────┤
│ 消息历史                                   │
│                                           │
│  ↑ 发送 {"action":"ping"}                 │  ← 蓝色气泡，右对齐
│  ↓ 收到 {"action":"pong"}                 │  ← 绿色气泡，左对齐
│  ↓ 收到 {"data":"update"}                 │
│                                           │
├─────────────────────────────────────────┤
│ ┌─ 发送消息 ──────────────────── [发送] ─┐ │
│ │ JSON / Text / Binary 切换             │ │
│ │ Monaco Editor 或文本框                 │ │
│ └───────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

- 连接状态指示器（绿=已连接 / 灰=未连接 / 红=已断开）
- 消息时间戳 + 方向标识 + 大小
- 自动重连选项
- 支持 JSON / 纯文本 / 二进制（Hex 输入）

## 集合管理

- 左侧边栏上半区，树形结构
- 新建集合、新建文件夹、拖拽排序、右键菜单（重命名/复制/删除）
- 点击请求 → 加载到主区域
- 集合级别可设默认 Header（子请求继承）
- 保存时存储完整快照（method/url/headers/body/auth）

## 历史记录

- 左侧边栏下半区，按时间倒序
- 每条：Method 标签（带颜色）+ URL 简略 + 状态码 + 时间
- 点击加载为只读快照，"另存为"后可修改
- 支持清空、关键词搜索过滤
- 超过 historyLimit（默认 100）自动淘汰最旧

## 环境变量

- URL 栏旁环境选择器 + 齿轮图标进入管理弹窗
- 弹窗：左侧环境列表（增删改）+ 右侧变量表 + 环境级 Header 表
- `{{variableName}}` 在发送时替换为当前环境值
- 未匹配变量保留原文，控制台警告

## 导入导出

**导入支持：**
- Postman Collection v2.1（.json）
- OpenAPI 3.0（.json / .yaml）→ 自动转为集合

**导出支持：**
- Postman Collection v2.1 格式
- 本项目自有 JSON 格式

文件选择通过 Go 后端 `runtime.OpenFileDialog` 实现。

## Go 后端接口

仅 3 个方法：

| 方法 | 作用 |
|------|------|
| `ApiLoadConfig() string` | 读取 `~/.devtools/api-config.json`，返回 JSON 字符串 |
| `ApiSaveConfig(json string)` | 写入配置 |
| `ApiSaveCookies(domain, cookies string)` | 持久化 cookie |

配置序列化/反序列化全在前端，Go 侧透传 JSON。

## 文件结构

```
internal/apidebug/          # Go 后端（极简）
  apidebug.go               # 上述 3 个方法

frontend/src/features/apidebug/
  index.tsx                 # 主页面
  components/
    RequestPanel.tsx        # 请求构建区（URL栏 + Tabs）
    ResponsePanel.tsx       # 响应查看区
    WebSocketPanel.tsx      # WebSocket 专用面板
    CollectionTree.tsx      # 左侧集合树
    HistoryList.tsx         # 左侧历史列表
    EnvManager.tsx          # 环境管理弹窗
    HeaderPreview.tsx       # 合并 Header 预览
    KvEditor.tsx            # 通用 Key-Value 编辑器
  hooks/
    useApiRequest.ts        # 请求发送逻辑（fetch 封装）
    useWebSocket.ts         # WebSocket 连接管理
    useCollections.ts       # 集合 CRUD
    useHistory.ts           # 历史记录管理
    useEnvironments.ts      # 环境变量管理
  utils/
    header-merge.ts         # Header 合并（按优先级）
    template.ts             # {{var}} 模板替换
    import-export.ts        # Postman/OpenAPI 导入导出转换
  types.ts                  # 类型定义
```

## 集成点

遵循现有项目架构（见 CLAUDE.md "Adding a new module"）：

1. `internal/apidebug/apidebug.go` — Go 持久化逻辑
2. `app.go` — 添加 `ApiLoadConfig`、`ApiSaveConfig`、`ApiSaveCookies` 方法
3. `frontend/src/features/apidebug/index.tsx` — React 页面
4. `frontend/src/components/nav/Sidebar.tsx` — 添加导航项
5. `frontend/src/App.tsx` — 添加 KeepAlive 页面槽位
6. `frontend/src/types/index.ts` — 扩展 `PageId` union（添加 `'apidebug'`）
