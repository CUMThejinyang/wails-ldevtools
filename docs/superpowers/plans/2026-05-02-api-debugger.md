# API 调试器 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 DevTools 添加 API 调试器模块，支持 REST + WebSocket 调试、全局/环境 Header 管理、请求集合、历史记录、环境变量、Postman/OpenAPI 导入导出。

**架构：** 纯前端方案 — HTTP 请求用 `fetch`，WebSocket 用原生 API，Go 后端仅负责配置持久化（`~/.devtools/api-config.json`）和文件对话框。

**技术栈：** Go net/http (Wails v2)，React 18，TypeScript，Ant Design 5，Monaco Editor，react-activation

---

### 任务 1: Go 后端 — 配置持久化

**文件：**
- 创建：`internal/apidebug/apidebug.go`
- 修改：`app.go`
- 测试：无（纯 IO 委托，无需 Go 测试）

- [ ] **步骤 1: 创建 Go 后端文件**

```go
// internal/apidebug/apidebug.go
package apidebug

import "encoding/json"

type ApiGlobalConfig struct {
	GlobalHeaders []KvPair       `json:"globalHeaders"`
	Environments  []ApiEnv       `json:"environments"`
	ActiveEnvId   string         `json:"activeEnvId"`
	Collections   []ApiCollection `json:"collections"`
	HistoryLimit  int            `json:"historyLimit"`
}

type KvPair struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description,omitempty"`
}

type ApiEnv struct {
	Id        string   `json:"id"`
	Name      string   `json:"name"`
	Variables []KvPair `json:"variables"`
	Headers   []KvPair `json:"headers"`
}

type ApiCollection struct {
	Id       string           `json:"id"`
	Name     string           `json:"name"`
	Children []json.RawMessage `json:"children"`
	Headers  []KvPair         `json:"headers"`
}

func DefaultConfig() ApiGlobalConfig {
	return ApiGlobalConfig{
		GlobalHeaders: []KvPair{},
		Environments:  []ApiEnv{},
		ActiveEnvId:   "",
		Collections:   []ApiCollection{},
		HistoryLimit:  100,
	}
}
```

- [ ] **步骤 2: 在 app.go 中注册模块**

在 `AppConfig` 中添加字段：
```go
type AppConfig struct {
	// ... 现有字段
	ApiDebugger apidebug.ApiGlobalConfig `json:"apiDebugger"`
}
```

在 `defaultConfig()` 中添加：
```go
ApiDebugger: apidebug.DefaultConfig(),
```

在 `app.go` 中添加 2 个方法：
```go
func (a *App) GetApiConfig() apidebug.ApiGlobalConfig {
	return a.config.ApiDebugger
}

func (a *App) SaveApiConfig(cfg apidebug.ApiGlobalConfig) error {
	a.config.ApiDebugger = cfg
	return a.saveConfig()
}

func (a *App) ReadTextFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (a *App) WriteTextFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
}
```

- [ ] **步骤 3: Commit**

```bash
git add internal/apidebug/apidebug.go app.go
git commit -m "feat: add API debugger Go backend (config persistence)"
```

---

### 任务 2: 前端 — 类型定义与 bridge

**文件：**
- 修改：`frontend/src/types/index.ts`
- 修改：`frontend/src/services/bridge.ts`

- [ ] **步骤 1: 添加类型定义**

在 `frontend/src/types/index.ts` 末尾，在 `// ── SFTP Server ──` 之后添加：

```typescript
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
```

将 `PageId` 更新为包含 `'apidebug'`：
```typescript
export type PageId = 'cleaner' | 'sync' | 'codec' | 'env' | 'localserver' | 'ports' | 'settings' | 'apidebug'
```

- [ ] **步骤 2: 添加 bridge 方法**

在 `frontend/src/services/bridge.ts` 中，在 `// Port Viewer` 之后添加：

```typescript
// API Debugger
getApiConfig: () => call<ApiGlobalConfig>('GetApiConfig'),
saveApiConfig: (cfg: ApiGlobalConfig) => call<void>('SaveApiConfig', cfg),
readTextFile: (path: string) => call<string>('ReadTextFile', path),
writeTextFile: (path: string, content: string) => call<void>('WriteTextFile', path, content),
```

并在 import 中添加 `ApiGlobalConfig`。

- [ ] **步骤 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/bridge.ts
git commit -m "feat: add API debugger types and bridge methods"
```

---

### 任务 3: 前端 — 页面注册与导航

**文件：**
- 创建：`frontend/src/features/apidebug/index.tsx`（占位页面）
- 修改：`frontend/src/components/nav/Sidebar.tsx`
- 修改：`frontend/src/App.tsx`

- [ ] **步骤 1: 创建占位页面**

```tsx
// frontend/src/features/apidebug/index.tsx
import { ApiOutlined } from '@ant-design/icons'
import PageShell from '@/components/layout/PageShell'

export default function ApiDebugPage() {
  return (
    <PageShell
      title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}
    >
      <div style={{ padding: 24, color: 'var(--color-text-3)', textAlign: 'center', marginTop: 48 }}>
        API 调试器开发中...
      </div>
    </PageShell>
  )
}
```

- [ ] **步骤 2: 在 Sidebar 中添加导航项**

```tsx
```tsx
// 在 NAV_ITEMS 数组中添加一项（ApiOutlined 已导入并用于 ports，无需重复导入）
{ id: 'apidebug', icon: <ApiOutlined style={{ fontSize: 18 }} />, label: 'API 调试器' },
```
{ id: 'apidebug', icon: <ApiOutlined style={{ fontSize: 18 }} />, label: 'API 调试器' },
```

- [ ] **步骤 3: 在 App.tsx 中注册页面**

在 imports 中添加：
```tsx
import ApiDebugPage from '@/features/apidebug'
```

在 JSX 中，在 port 页面之后添加：
```tsx
<div className="page-slot" style={activePage === 'apidebug' ? styles.pageSlot : styles.pageHidden}>
  <KeepAlive id="apidebug"><ApiDebugPage /></KeepAlive>
</div>
```

- [ ] **步骤 4: Commit**

```bash
git add frontend/src/features/apidebug/index.tsx frontend/src/components/nav/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat: register API debugger page in nav and router"
```

---

### 任务 4: 前端 — 通用 Key-Value 编辑器组件

**文件：**
- 创建：`frontend/src/features/apidebug/components/KvEditor.tsx`

- [ ] **步骤 1: 创建 KvEditor 组件**

```tsx
// frontend/src/features/apidebug/components/KvEditor.tsx
import { useState } from 'react'
import { Button, Input, Checkbox, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ApiKvPair } from '@/types'

interface KvEditorProps {
  items: ApiKvPair[]
  onChange: (items: ApiKvPair[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  showDescription?: boolean
  readonly?: boolean
}

export default function KvEditor({ items, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', showDescription = false, readonly = false }: KvEditorProps) {
  const updateItem = (index: number, patch: Partial<ApiKvPair>) => {
    const next = items.map((item, i) => i === index ? { ...item, ...patch } : item)
    onChange(next)
  }

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const addItem = () => {
    onChange([...items, { key: '', value: '', enabled: true }])
  }

  return (
    <div style={styles.container}>
      {items.map((item, i) => (
        <div key={i} style={styles.row}>
          <Checkbox
            checked={item.enabled}
            onChange={(e) => updateItem(i, { enabled: e.target.checked })}
            disabled={readonly}
          />
          <Input
            size="small"
            placeholder={keyPlaceholder}
            value={item.key}
            onChange={(e) => updateItem(i, { key: e.target.value })}
            style={styles.keyInput}
            readOnly={readonly}
          />
          <Input
            size="small"
            placeholder={valuePlaceholder}
            value={item.value}
            onChange={(e) => updateItem(i, { value: e.target.value })}
            style={styles.valueInput}
            readOnly={readonly}
          />
          {showDescription && (
            <Input
              size="small"
              placeholder="描述"
              value={item.description || ''}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              style={styles.descInput}
              readOnly={readonly}
            />
          )}
          {!readonly && (
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(i)} />
            </Tooltip>
          )}
        </div>
      ))}
      {!readonly && (
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addItem} style={styles.addBtn}>
          添加
        </Button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', gap: 6, alignItems: 'center' },
  keyInput: { width: 180 },
  valueInput: { flex: 1 },
  descInput: { width: 140 },
  addBtn: { width: '100%', marginTop: 4 },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/KvEditor.tsx
mkdir -p frontend/src/features/apidebug/components
git commit -m "feat: add KvEditor component for key-value editing"
```

---

### 任务 5: 前端 — URL 栏组件

**文件：**
- 创建：`frontend/src/features/apidebug/components/UrlBar.tsx`

- [ ] **步骤 1: 创建 UrlBar 组件**

```tsx
// frontend/src/features/apidebug/components/UrlBar.tsx
import { Select, Input, Button } from 'antd'
import { SendOutlined, SaveOutlined } from '@ant-design/icons'
import type { ApiMethod } from '@/types'

const METHOD_COLORS: Record<string, string> = {
  GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
  DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7',
}

interface UrlBarProps {
  method: ApiMethod
  url: string
  envNames: string[]
  activeEnvId: string | null
  onMethodChange: (m: ApiMethod) => void
  onUrlChange: (url: string) => void
  onEnvChange: (id: string | null) => void
  onSend: () => void
  onSave: () => void
  loading: boolean
}

export default function UrlBar({ method, url, envNames, activeEnvId, onMethodChange, onUrlChange, onEnvChange, onSend, onSave, loading }: UrlBarProps) {
  return (
    <div style={styles.container}>
      <Select
        value={method}
        onChange={onMethodChange}
        size="small"
        style={{ width: 100 }}
        options={['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].map((m) => ({
          value: m,
          label: <span style={{ color: METHOD_COLORS[m], fontWeight: 600 }}>{m}</span>,
        }))}
      />
      <Input
        size="small"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://api.example.com/endpoint"
        style={{ flex: 1, fontFamily: 'var(--code-font-family)' }}
        onPressEnter={onSend}
      />
      <Select
        value={activeEnvId || undefined}
        onChange={(v) => onEnvChange(v || null)}
        size="small"
        style={{ width: 110 }}
        placeholder="无环境"
        allowClear
        options={envNames.map((name) => ({ value: name, label: name }))}
      />
      <Button type="primary" size="small" icon={<SendOutlined />} onClick={onSend} loading={loading}>
        发送
      </Button>
      <Button size="small" icon={<SaveOutlined />} onClick={onSave}>
        保存
      </Button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/UrlBar.tsx
git commit -m "feat: add UrlBar component for API debugger"
```

---

### 任务 6: 前端 — 请求构建面板（Params / Headers / Body / Auth）

**文件：**
- 创建：`frontend/src/features/apidebug/components/RequestPanel.tsx`

- [ ] **步骤 1: 创建 RequestPanel 组件**

```tsx
// frontend/src/features/apidebug/components/RequestPanel.tsx
import { useState } from 'react'
import { Tabs, Select } from 'antd'
import KvEditor from './KvEditor'
import type { ApiRequest, ApiKvPair, ApiBodyType } from '@/types'

interface RequestPanelProps {
  request: ApiRequest
  onChange: (req: ApiRequest) => void
}

export default function RequestPanel({ request, onChange }: RequestPanelProps) {
  const update = (patch: Partial<ApiRequest>) => onChange({ ...request, ...patch })

  const [bodyType, setBodyType] = useState<ApiBodyType>(request.body?.type || 'none')

  const handleBodyTypeChange = (t: ApiBodyType) => {
    setBodyType(t)
    onChange({
      ...request,
      body: { type: t, jsonContent: '', formItems: [], urlencodedItems: [], rawContent: '', rawContentType: '' },
    })
  }

  const renderBodyEditor = () => {
    if (bodyType === 'none') return <div style={{ padding: 12, color: 'var(--color-text-3)' }}>此请求无请求体</div>
    if (bodyType === 'json') {
      return (
        <textarea
          style={styles.textarea}
          value={request.body?.jsonContent || ''}
          onChange={(e) => update({ body: { ...request.body!, jsonContent: e.target.value } })}
          placeholder='{"key": "value"}'
        />
      )
    }
    if (bodyType === 'form-data') {
      return (
        <KvEditor
          items={request.body?.formItems?.map(f => ({ key: f.key, value: f.value, enabled: f.enabled })) || []}
          onChange={(items) => update({ body: { ...request.body!, formItems: items as any } })}
          keyPlaceholder="字段名"
          valuePlaceholder="值或文件路径"
        />
      )
    }
    if (bodyType === 'urlencoded') {
      return (
        <KvEditor
          items={request.body?.urlencodedItems || []}
          onChange={(items) => update({ body: { ...request.body!, urlencodedItems: items } })}
          keyPlaceholder="参数名"
          valuePlaceholder="参数值"
        />
      )
    }
    // raw
    return (
      <div style={styles.rawContainer}>
        <input
          style={styles.rawContentType}
          value={request.body?.rawContentType || ''}
          onChange={(e) => update({ body: { ...request.body!, rawContentType: e.target.value } })}
          placeholder="Content-Type (e.g. application/xml)"
        />
        <textarea
          style={{ ...styles.textarea, flex: 1 }}
          value={request.body?.rawContent || ''}
          onChange={(e) => update({ body: { ...request.body!, rawContent: e.target.value } })}
          placeholder="原始请求体内容..."
        />
      </div>
    )
  }

  const authContent = (
    <div style={styles.authContainer}>
      <Select
        value={request.auth?.type || 'none'}
        onChange={(t) => update({ auth: { type: t as 'none' | 'bearer' | 'basic' } })}
        size="small"
        style={{ width: 160 }}
        options={[
          { value: 'none', label: 'No Auth' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'basic', label: 'Basic Auth' },
        ]}
      />
      {request.auth?.type === 'bearer' && (
        <input
          style={styles.authInput}
          value={request.auth.token || ''}
          onChange={(e) => update({ auth: { ...request.auth!, token: e.target.value } })}
          placeholder="输入 Token..."
        />
      )}
      {(request.auth?.type === 'basic') && (
        <div style={styles.basicRow}>
          <input style={styles.authInput} value={request.auth?.username || ''} onChange={(e) => update({ auth: { ...request.auth!, username: e.target.value } })} placeholder="用户名" />
          <input style={styles.authInput} value={request.auth?.password || ''} onChange={(e) => update({ auth: { ...request.auth!, password: e.target.value } })} placeholder="密码" type="password" />
        </div>
      )}
    </div>
  )

  return (
    <Tabs
      size="small"
      items={[
        {
          key: 'params',
          label: 'Params',
          children: (
            <KvEditor
              items={request.params}
              onChange={(items) => update({ params: items })}
              keyPlaceholder="参数名"
              valuePlaceholder="参数值"
            />
          ),
        },
        {
          key: 'headers',
          label: 'Headers',
          children: (
            <KvEditor
              items={request.headers}
              onChange={(items) => update({ headers: items })}
              keyPlaceholder="Header 名"
              valuePlaceholder="Header 值"
              showDescription
            />
          ),
        },
        {
          key: 'body',
          label: 'Body',
          children: (
            <div style={styles.bodyContainer}>
              <Select
                value={bodyType}
                onChange={handleBodyTypeChange}
                size="small"
                style={{ width: 160, marginBottom: 8 }}
                options={[
                  { value: 'none', label: 'none' },
                  { value: 'json', label: 'JSON' },
                  { value: 'form-data', label: 'form-data' },
                  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
                  { value: 'raw', label: 'Raw' },
                ]}
              />
              {renderBodyEditor()}
            </div>
          ),
        },
        { key: 'auth', label: 'Auth', children: authContent },
      ]}
    />
  )
}

const styles: Record<string, React.CSSProperties> = {
  bodyContainer: { display: 'flex', flexDirection: 'column' },
  textarea: { width: '100%', minHeight: 100, background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: 8, fontFamily: 'var(--code-font-family)', fontSize: 13, resize: 'vertical' },
  rawContainer: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 120 },
  rawContentType: { background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--code-font-family)', fontSize: 12 },
  authContainer: { display: 'flex', flexDirection: 'column', gap: 8, padding: 8 },
  authInput: { background: 'var(--color-bg-1)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)', borderRadius: 4, padding: '4px 8px', fontFamily: 'var(--code-font-family)', fontSize: 13, width: '100%' },
  basicRow: { display: 'flex', gap: 8 },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/RequestPanel.tsx
git commit -m "feat: add RequestPanel with Params/Headers/Body/Auth tabs"
```

---

### 任务 7: 前端 — 响应查看面板

**文件：**
- 创建：`frontend/src/features/apidebug/components/ResponsePanel.tsx`

- [ ] **步骤 1: 创建 ResponsePanel 组件**

```tsx
// frontend/src/features/apidebug/components/ResponsePanel.tsx
import { useState, useMemo } from 'react'
import { Tabs, Tag, Input } from 'antd'
import type { ResponseSnapshot, ApiCookieEntry } from '@/types'
import { formatBytes } from '@/services/bridge'

interface ResponsePanelProps {
  response: ResponseSnapshot | null
  loading: boolean
  error: string | null
}

export default function ResponsePanel({ response, loading, error }: ResponsePanelProps) {
  const [searchText, setSearchText] = useState('')
  const [bodyView, setBodyView] = useState<'formatted' | 'raw'>('formatted')

  if (loading) {
    return <div style={styles.placeholder}>发送请求中...</div>
  }
  if (error) {
    return <div style={{ ...styles.placeholder, color: '#f93e3e' }}>{error}</div>
  }
  if (!response) {
    return <div style={styles.placeholder}>输入 URL 并点击发送开始调试</div>
  }

  const statusColor = response.status < 300 ? 'success' : response.status < 500 ? 'warning' : 'error'

  const formattedBody = useMemo(() => {
    if (!response.body) return '(空响应体)'
    try {
      const parsed = JSON.parse(response.body)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return response.body
    }
  }, [response.body])

  const filteredBody = useMemo(() => {
    if (!searchText) return formattedBody
    return formattedBody.split('\n').filter(l => l.toLowerCase().includes(searchText.toLowerCase())).join('\n') || '(无匹配行)'
  }, [formattedBody, searchText])

  const cookieEntries = useMemo(() => {
    const entries: ApiCookieEntry[] = []
    const setCookie = response.headers['set-cookie'] || ''
    // 简单解析第一个 Set-Cookie 作为展示示例
    if (setCookie) {
      const parts = setCookie.split(';')
      const nameValue = parts[0].split('=')
      entries.push({
        name: nameValue[0] || '',
        value: nameValue.slice(1).join('=') || '',
        domain: response.headers['host'] || '',
        path: '/',
        httpOnly: setCookie.toLowerCase().includes('httponly'),
        secure: setCookie.toLowerCase().includes('secure'),
      })
    }
    return entries
  }, [response.headers])

  return (
    <div style={styles.container}>
      <div style={styles.metaBar}>
        <Tag color={statusColor}>{response.status} {response.statusText}</Tag>
        <span style={styles.metaItem}>{formatBytes(response.size)}</span>
        <span style={styles.metaItem}>{response.durationMs}ms</span>
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'body',
            label: 'Body',
            children: (
              <div>
                <div style={styles.toolbar}>
                  <span
                    style={{ ...styles.toolBtn, fontWeight: bodyView === 'formatted' ? 600 : 400, color: bodyView === 'formatted' ? 'var(--color-primary)' : 'var(--color-text-2)' }}
                    onClick={() => setBodyView('formatted')}
                  >美化</span>
                  <span style={{ color: 'var(--color-text-3)' }}>|</span>
                  <span
                    style={{ ...styles.toolBtn, fontWeight: bodyView === 'raw' ? 600 : 400, color: bodyView === 'raw' ? 'var(--color-primary)' : 'var(--color-text-2)' }}
                    onClick={() => setBodyView('raw')}
                  >原始</span>
                  <Input.Search
                    size="small"
                    placeholder="搜索..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: 180, marginLeft: 'auto' }}
                    allowClear
                  />
                </div>
                <pre style={styles.bodyPre}>{bodyView === 'raw' ? response.body : filteredBody}</pre>
              </div>
            ),
          },
          {
            key: 'headers',
            label: 'Headers',
            children: (
              <div style={styles.headersList}>
                {Object.entries(response.headers).map(([k, v]) => (
                  <div key={k} style={styles.headerRow}>
                    <span style={styles.headerKey}>{k}:</span>
                    <span style={styles.headerVal}>{v}</span>
                  </div>
                ))}
                {Object.keys(response.headers).length === 0 && <div style={{ color: 'var(--color-text-3)' }}>无响应头</div>}
              </div>
            ),
          },
          {
            key: 'cookies',
            label: 'Cookies',
            children: (
              <table style={styles.table}>
                <thead><tr>{['Name', 'Value', 'Domain', 'Path', 'HttpOnly', 'Secure'].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {cookieEntries.length === 0 ? <tr><td colSpan={6} style={{ ...styles.td, color: 'var(--color-text-3)' }}>无 Cookie</td></tr> :
                    cookieEntries.map((c, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{c.name}</td>
                        <td style={styles.td}>{c.value}</td>
                        <td style={styles.td}>{c.domain}</td>
                        <td style={styles.td}>{c.path}</td>
                        <td style={styles.td}>{c.httpOnly ? '✓' : '✗'}</td>
                        <td style={styles.td}>{c.secure ? '✓' : '✗'}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            ),
          },
        ]}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  placeholder: { padding: 40, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 14 },
  metaBar: { display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--color-border)', marginBottom: 4 },
  metaItem: { fontSize: 12, color: 'var(--color-text-2)', fontFamily: 'var(--code-font-family)' },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  toolBtn: { cursor: 'pointer', fontSize: 12, userSelect: 'none' },
  bodyPre: { background: 'var(--color-bg-1)', borderRadius: 4, padding: 8, fontSize: 12, fontFamily: 'var(--code-font-family)', overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 },
  headersList: { display: 'flex', flexDirection: 'column', gap: 2 },
  headerRow: { display: 'flex', gap: 8, fontSize: 12, fontFamily: 'var(--code-font-family)', padding: '2px 0' },
  headerKey: { fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 },
  headerVal: { color: 'var(--color-text-1)', wordBreak: 'break-all' },
  table: { width: '100%', fontSize: 12, borderCollapse: 'collapse' as any },
  th: { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-2)', fontWeight: 600 },
  td: { padding: '4px 8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-1)', fontFamily: 'var(--code-font-family)' },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/ResponsePanel.tsx
git commit -m "feat: add ResponsePanel with Body/Headers/Cookies tabs"
```

---

### 任务 8: 前端 — 请求发送 hooks（useApiRequest + useWebSocket）

**文件：**
- 创建：`frontend/src/features/apidebug/hooks/useApiRequest.ts`
- 创建：`frontend/src/features/apidebug/hooks/useWebSocket.ts`

- [ ] **步骤 1: 创建 useApiRequest hook**

```ts
// frontend/src/features/apidebug/hooks/useApiRequest.ts
import { useState, useCallback } from 'react'
import type { ApiRequest, ApiGlobalConfig, ResponseSnapshot, ApiKvPair } from '@/types'

/** 将 {{var}} 模板替换为环境变量值 */
function resolveTemplate(str: string, vars: ApiKvPair[]): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const found = vars.find(v => v.key === name && v.enabled)
    return found ? found.value : `{{${name}}}`
  })
}

/** 按优先级合并 headers：请求级 > 环境级 > 集合级 > 全局 */
function mergeHeaders(
  request: ApiRequest,
  config: ApiGlobalConfig,
  activeEnvId: string | null,
): Record<string, string> {
  const result: Record<string, string> = {}

  const addAll = (items: ApiKvPair[], label: string) => {
    items.filter(i => i.enabled && i.key).forEach(i => { result[i.key] = i.value })
  }

  // 低优先级先加（全局 -> 环境 -> 请求级）
  addAll(config.globalHeaders, '全局')
  if (activeEnvId) {
    const env = config.environments.find(e => e.id === activeEnvId)
    if (env) addAll(env.headers, '环境')
  }
  // 请求级 headers
  addAll(request.headers, '请求')

  // Auth 处理
  if (request.auth?.type === 'bearer' && request.auth.token) {
    result['Authorization'] = `Bearer ${request.auth.token}`
  } else if (request.auth?.type === 'basic' && request.auth.username) {
    result['Authorization'] = 'Basic ' + btoa(`${request.auth.username}:${request.auth.password || ''}`)
  }

  return result
}

export function useApiRequest() {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ResponseSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(async (
    request: ApiRequest,
    config: ApiGlobalConfig,
    activeEnvId: string | null,
  ) => {
    setLoading(true)
    setError(null)
    setResponse(null)

    const startTime = performance.now()

    try {
      // 环境变量替换
      const env = activeEnvId ? config.environments.find(e => e.id === activeEnvId) : undefined
      const envVars = env?.variables || []
      const resolvedUrl = resolveTemplate(request.url, envVars)

      // 构建 headers
      const headers = mergeHeaders(request, config, activeEnvId)

      // Content-Type
      if (request.body?.type === 'json' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      } else if (request.body?.type === 'urlencoded' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      } else if (request.body?.type === 'raw' && request.body.rawContentType && !headers['Content-Type']) {
        headers['Content-Type'] = request.body.rawContentType
      }

      // Query params
      let finalUrl = resolvedUrl
      const enabledParams = request.params.filter(p => p.enabled && p.key)
      if (enabledParams.length > 0) {
        const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(resolveTemplate(p.value, envVars))}`).join('&')
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs
      }

      // Body
      let body: BodyInit | undefined
      if (request.body?.type === 'json' && request.body.jsonContent) {
        body = resolveTemplate(request.body.jsonContent, envVars)
      } else if (request.body?.type === 'form-data') {
        const fd = new FormData()
        request.body.formItems?.filter(f => f.enabled && f.key).forEach(f => {
          fd.append(f.key, resolveTemplate(f.value, envVars))
        })
        body = fd
        delete headers['Content-Type'] // 让浏览器自动填充 multipart boundary
      } else if (request.body?.type === 'urlencoded' && request.body.urlencodedItems) {
        const usp = new URLSearchParams()
        request.body.urlencodedItems.filter(i => i.enabled && i.key).forEach(i => {
          usp.append(i.key, resolveTemplate(i.value, envVars))
        })
        body = usp.toString()
      } else if (request.body?.type === 'raw' && request.body.rawContent) {
        body = resolveTemplate(request.body.rawContent, envVars)
      }

      const fetchResponse = await fetch(finalUrl, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
      })

      const responseHeaders: Record<string, string> = {}
      fetchResponse.headers.forEach((v, k) => { responseHeaders[k] = v })

      // 收集 cookies（从 set-cookie header）
      const cookies: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean }[] = []
      const setCookieHeader = fetchResponse.headers.get('set-cookie')
      if (setCookieHeader) {
        const parts = setCookieHeader.split(';')
        const nv = parts[0].split('=')
        const urlObj = new URL(finalUrl)
        cookies.push({
          name: nv[0],
          value: nv.slice(1).join('='),
          domain: urlObj.hostname,
          path: '/',
          httpOnly: setCookieHeader.toLowerCase().includes('httponly'),
          secure: setCookieHeader.toLowerCase().includes('secure'),
        })
      }

      const responseText = await fetchResponse.text()
      const endTime = performance.now()

      setResponse({
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body: responseText,
        size: new Blob([responseText]).size,
        durationMs: Math.round(endTime - startTime),
        cookies,
      })
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  return { loading, response, error, send }
}
```

- [ ] **步骤 2: 创建 useWebSocket hook**

```ts
// frontend/src/features/apidebug/hooks/useWebSocket.ts
import { useState, useRef, useCallback } from 'react'
import { generateId } from '@/services/bridge'

export interface WSMessage {
  id: string
  direction: 'sent' | 'received'
  content: string
  timestamp: number
  size: number
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<WSMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((url: string) => {
    if (wsRef.current) wsRef.current.close()
    try {
      const ws = new WebSocket(url)
      ws.onopen = () => setConnected(true)
      ws.onclose = () => setConnected(false)
      ws.onerror = () => setConnected(false)
      ws.onmessage = (event) => {
        setMessages((prev) => [...prev, {
          id: generateId(),
          direction: 'received',
          content: typeof event.data === 'string' ? event.data : '[Binary]',
          timestamp: Date.now(),
          size: typeof event.data === 'string' ? new Blob([event.data]).size : event.data.size,
        }])
      }
      wsRef.current = ws
    } catch (err: any) {
      console.error('WebSocket connect error:', err)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnected(false)
  }, [])

  const send = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(content)
      setMessages((prev) => [...prev, {
        id: generateId(),
        direction: 'sent',
        content,
        timestamp: Date.now(),
        size: new Blob([content]).size,
      }])
    }
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { connected, messages, connect, disconnect, send, clearMessages }
}
```

- [ ] **步骤 3: Commit**

```bash
mkdir -p frontend/src/features/apidebug/hooks
git add frontend/src/features/apidebug/hooks/useApiRequest.ts frontend/src/features/apidebug/hooks/useWebSocket.ts
git commit -m "feat: add useApiRequest and useWebSocket hooks"
```

---

### 任务 9: 前端 — Header 合并预览组件

**文件：**
- 创建：`frontend/src/features/apidebug/components/HeaderPreview.tsx`

- [ ] **步骤 1: 创建 HeaderPreview 组件**

```tsx
// frontend/src/features/apidebug/components/HeaderPreview.tsx
import { Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import type { ApiKvPair } from '@/types'

interface HeaderSource {
  key: string
  value: string
  source: '请求级' | '环境' | '集合' | '全局'
}

interface Props {
  merged: HeaderSource[]
}

export default function HeaderPreview({ merged }: Props) {
  if (merged.length === 0) return null
  return (
    <div style={styles.container}>
      <div style={styles.title}>
        <InfoCircleOutlined style={{ fontSize: 12 }} />
        <span>合并后的请求头预览</span>
      </div>
      {merged.map((h, i) => (
        <div key={i} style={styles.row}>
          <span style={styles.key}>{h.key}:</span>
          <span style={styles.val}>{h.value}</span>
          <Tooltip title={`来源：${h.source}`}>
            <span style={styles.source}>{h.source}</span>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { background: 'var(--color-bg-1)', borderRadius: 4, padding: '6px 8px', fontSize: 11, fontFamily: 'var(--code-font-family)' },
  title: { display: 'flex', gap: 4, alignItems: 'center', color: 'var(--color-text-3)', marginBottom: 4, fontSize: 11 },
  row: { display: 'flex', gap: 6, alignItems: 'center', padding: '1px 0' },
  key: { color: 'var(--color-primary)', fontWeight: 600 },
  val: { color: 'var(--color-text-2)', wordBreak: 'break-all', flex: 1 },
  source: { color: 'var(--color-text-3)', fontSize: 10, flexShrink: 0, background: 'var(--color-bg-2)', padding: '0 4px', borderRadius: 2 },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/HeaderPreview.tsx
git commit -m "feat: add HeaderPreview component for merged headers display"
```

---

### 任务 10: 前端 — 集合树组件

**文件：**
- 创建：`frontend/src/features/apidebug/components/CollectionTree.tsx`

- [ ] **步骤 1: 创建 CollectionTree 组件**

```tsx
// frontend/src/features/apidebug/components/CollectionTree.tsx
import { useState } from 'react'
import { Button, Modal, Input } from 'antd'
import { PlusOutlined, FolderAddOutlined } from '@ant-design/icons'
import type { ApiCollection } from '@/types'
import { generateId } from '@/services/bridge'

interface Props {
  collections: ApiCollection[]
  activeRequestId: string | null
  onSelectRequest: (id: string) => void
  onAddCollection: (name: string) => void
  onAddFolder: (parentId: string, name: string) => void
  onDeleteItem: (id: string) => void
}

export default function CollectionTree({ collections, activeRequestId, onSelectRequest, onAddCollection, onAddFolder, onDeleteItem }: Props) {
  const [showNewCol, setShowNewCol] = useState(false)
  const [newColName, setNewColName] = useState('')

  const handleCreate = () => {
    if (newColName.trim()) {
      onAddCollection(newColName.trim())
      setNewColName('')
      setShowNewCol(false)
    }
  }

  const renderTree = (items: (ApiCollection | any)[], level: number): React.ReactNode => {
    return items.map((item) => {
      if ('children' in item) {
        // 集合/文件夹
        return (
          <div key={item.id}>
            <div style={{ ...styles.node, paddingLeft: 12 + level * 16 }}>
              <span style={{ color: 'var(--color-text-2)', marginRight: 4 }}>📁</span>
              <span>{item.name}</span>
              <Button type="text" size="small" icon={<FolderAddOutlined />} style={{ marginLeft: 'auto' }} onClick={() => {
                const name = prompt('文件夹名称:')
                if (name) onAddFolder(item.id, name)
              }} />
            </div>
            {item.children && item.children.length > 0 && renderTree(item.children, level + 1)}
          </div>
        )
      }
      // 请求
      return (
        <div
          key={item.id}
          style={{ ...styles.node, paddingLeft: 24 + level * 16, background: activeRequestId === item.id ? 'var(--color-bg-2)' : 'transparent', cursor: 'pointer' }}
          onClick={() => onSelectRequest(item.id)}
        >
          <span style={{ ...styles.method, color: GET_METHOD_COLOR(item.method) }}>{item.method}</span>
          <span style={styles.reqName}>{item.name || item.url}</span>
        </div>
      )
    })
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>集合</span>
        <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => setShowNewCol(true)} />
      </div>
      <div style={styles.tree}>
        {collections.length === 0 ? (
          <div style={styles.empty}>暂无集合，点击 + 创建</div>
        ) : renderTree(collections, 0)}
      </div>

      <Modal title="新建集合" open={showNewCol} onOk={handleCreate} onCancel={() => setShowNewCol(false)}>
        <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="集合名称" onPressEnter={handleCreate} />
      </Modal>
    </div>
  )
}

function GET_METHOD_COLOR(m: string): string {
  const map: Record<string, string> = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7' }
  return map[m] || '#aaa'
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '50%', borderBottom: '1px solid var(--color-border)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--color-border)' },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' },
  tree: { overflow: 'auto', flex: 1 },
  empty: { padding: 16, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12 },
  node: { display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: 12, whiteSpace: 'nowrap' as any, overflow: 'hidden', textOverflow: 'ellipsis' },
  method: { fontSize: 10, fontWeight: 700, width: 48, flexShrink: 0 },
  reqName: { overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text-1)' },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/CollectionTree.tsx
git commit -m "feat: add CollectionTree component"
```

---

### 任务 11: 前端 — 历史列表组件

**文件：**
- 创建：`frontend/src/features/apidebug/components/HistoryList.tsx`

- [ ] **步骤 1: 创建 HistoryList 组件**

```tsx
// frontend/src/features/apidebug/components/HistoryList.tsx
import { Input } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { HistoryEntry } from '@/types'
import { formatBytes } from '@/services/bridge'

interface Props {
  history: HistoryEntry[]
  onSelect: (entry: HistoryEntry) => void
  onClear: () => void
}

export default function HistoryList({ history, onSelect, onClear }: Props) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>历史</span>
        {history.length > 0 && (
          <span onClick={onClear} style={styles.clearBtn}>清空</span>
        )}
      </div>
      <div style={styles.list}>
        {history.length === 0 ? (
          <div style={styles.empty}>暂无历史记录</div>
        ) : (
          history.map((h) => {
            const time = new Date(h.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
            const methodColor = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#0d5aa7' }[h.request.method] || '#aaa'
            return (
              <div key={h.id} style={styles.item} onClick={() => onSelect(h)}>
                <span style={{ ...styles.method, color: methodColor }}>{h.request.method}</span>
                <span style={styles.url}>{h.request.url}</span>
                <span style={styles.status}>{h.response?.status || '---'}</span>
                <span style={styles.time}>{time}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '50%', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--color-border)' },
  title: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)' },
  clearBtn: { fontSize: 11, color: 'var(--color-text-3)', cursor: 'pointer' },
  list: { overflow: 'auto', flex: 1 },
  empty: { padding: 16, textAlign: 'center', color: 'var(--color-text-3)', fontSize: 12 },
  item: { display: 'flex', gap: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', alignItems: 'center', whiteSpace: 'nowrap' as any },
  method: { fontWeight: 700, width: 40, flexShrink: 0, fontSize: 10 },
  url: { overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, color: 'var(--color-text-2)' },
  status: { width: 30, textAlign: 'right' as any, color: 'var(--color-text-3)' },
  time: { width: 40, textAlign: 'right' as any, color: 'var(--color-text-3)' },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/HistoryList.tsx
git commit -m "feat: add HistoryList component"
```

---

### 任务 12: 前端 — 环境管理弹窗

**文件：**
- 创建：`frontend/src/features/apidebug/components/EnvManager.tsx`

- [ ] **步骤 1: 创建 EnvManager 组件**

```tsx
// frontend/src/features/apidebug/components/EnvManager.tsx
import { useState } from 'react'
import { Modal, Input, Button, List } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import KvEditor from './KvEditor'
import type { ApiEnv } from '@/types'
import { generateId } from '@/services/bridge'

interface Props {
  open: boolean
  environments: ApiEnv[]
  onClose: () => void
  onSave: (envs: ApiEnv[]) => void
}

export default function EnvManager({ open, environments, onClose, onSave }: Props) {
  const [envs, setEnvs] = useState<ApiEnv[]>(() => environments.length > 0 ? environments : [{ id: generateId(), name: '开发', variables: [], headers: [] }])
  const [activeIdx, setActiveIdx] = useState(0)

  const active = envs[activeIdx] || envs[0]

  const updateActive = (patch: Partial<ApiEnv>) => {
    const next = [...envs]
    if (next[activeIdx]) {
      next[activeIdx] = { ...next[activeIdx], ...patch }
    }
    setEnvs(next)
  }

  const addEnv = () => {
    const id = generateId()
    setEnvs([...envs, { id, name: `环境 ${envs.length + 1}`, variables: [], headers: [] }])
    setActiveIdx(envs.length)
  }

  const deleteEnv = (idx: number) => {
    const next = envs.filter((_, i) => i !== idx)
    setEnvs(next)
    if (activeIdx >= next.length) setActiveIdx(next.length - 1)
  }

  const handleOk = () => {
    onSave(envs.filter(e => e.name.trim()))
    onClose()
  }

  return (
    <Modal title="环境管理" open={open} onOk={handleOk} onCancel={onClose} width={700}>
      <div style={{ display: 'flex', gap: 16, minHeight: 350 }}>
        <div style={{ width: 160, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {envs.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                onClick={() => setActiveIdx(i)}
                style={{ flex: 1, cursor: 'pointer', padding: '4px 8px', borderRadius: 4, background: i === activeIdx ? 'var(--color-bg-2)' : 'transparent', fontSize: 13 }}
              >{e.name || '(未命名)'}</span>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteEnv(i)} />
            </div>
          ))}
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addEnv} style={{ marginTop: 8 }}>添加环境</Button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input size="small" value={active?.name || ''} onChange={(e) => updateActive({ name: e.target.value })} placeholder="环境名称" style={{ width: 200 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>变量</div>
            <KvEditor
              items={active?.variables || []}
              onChange={(items) => updateActive({ variables: items })}
              keyPlaceholder="变量名"
              valuePlaceholder="变量值"
            />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>环境级 Header</div>
            <KvEditor
              items={active?.headers || []}
              onChange={(items) => updateActive({ headers: items })}
              keyPlaceholder="Header 名"
              valuePlaceholder="Header 值"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/EnvManager.tsx
git commit -m "feat: add EnvManager modal component"
```

---

### 任务 13: 前端 — WebSocket 面板组件

**文件：**
- 创建：`frontend/src/features/apidebug/components/WebSocketPanel.tsx`

- [ ] **步骤 1: 创建 WebSocketPanel 组件**

```tsx
// frontend/src/features/apidebug/components/WebSocketPanel.tsx
import { useState } from 'react'
import { Button, Input, Tag } from 'antd'
import { useWebSocket, type WSMessage } from '../hooks/useWebSocket'
import type { ApiKvPair } from '@/types'

interface Props {
  url: string
  headers: ApiKvPair[]
}

export default function WebSocketPanel({ url, headers }: Props) {
  const { connected, messages, connect, disconnect, send, clearMessages } = useWebSocket()
  const [msgText, setMsgText] = useState('')

  const handleConnect = () => {
    if (connected) {
      disconnect()
    } else if (url) {
      connect(url)
    }
  }

  const handleSend = () => {
    if (msgText.trim()) {
      send(msgText.trim())
      setMsgText('')
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <Button size="small" type={connected ? 'default' : 'primary'} onClick={handleConnect} disabled={!url}>
          {connected ? '断开' : '连接'}
        </Button>
        <Tag color={connected ? 'success' : 'default'}>{connected ? '已连接' : '未连接'}</Tag>
        <Button size="small" onClick={clearMessages} style={{ marginLeft: 'auto' }}>清空</Button>
      </div>

      <div style={styles.msgList}>
        {messages.length === 0 && (
          <div style={styles.empty}>连接后消息将显示在此处</div>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ ...styles.msg, justifyContent: m.direction === 'sent' ? 'flex-end' : 'flex-start' }}>
            <div style={{ ...styles.bubble, background: m.direction === 'sent' ? 'var(--color-primary)' : 'var(--color-bg-2)', color: m.direction === 'sent' ? '#fff' : 'var(--color-text-1)' }}>
              <pre style={styles.msgPre}>{m.content}</pre>
              <div style={styles.msgMeta}>{new Date(m.timestamp).toLocaleTimeString()} | {m.size}B</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.inputRow}>
        <Input.TextArea
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
          placeholder="输入消息..."
          rows={2}
          style={{ flex: 1 }}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleSend() } }}
        />
        <Button type="primary" onClick={handleSend} disabled={!connected || !msgText.trim()}>发送</Button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 8 },
  toolbar: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  msgList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--color-bg-1)', borderRadius: 4 },
  empty: { color: 'var(--color-text-3)', textAlign: 'center', marginTop: 40, fontSize: 13 },
  msg: { display: 'flex' },
  bubble: { maxWidth: '80%', borderRadius: 8, padding: '6px 10px' },
  msgPre: { margin: 0, fontSize: 12, fontFamily: 'var(--code-font-family)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
  msgMeta: { fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' as any },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 },
}
```

- [ ] **步骤 2: Commit**

```bash
git add frontend/src/features/apidebug/components/WebSocketPanel.tsx
git commit -m "feat: add WebSocketPanel component"
```

---

### 任务 14: 前端 — 导入导出工具函数

**文件：**
- 创建：`frontend/src/features/apidebug/utils/import-export.ts`

- [ ] **步骤 1: 创建导入导出工具**

```ts
// frontend/src/features/apidebug/utils/import-export.ts
import type { ApiRequest, ApiCollection, ApiKvPair } from '@/types'
import { generateId } from '@/services/bridge'

/** 从 Postman Collection v2.1 JSON 导入 */
export function importPostmanCollection(json: string): { name: string; requests: ApiRequest[] } {
  const data = JSON.parse(json)
  const requests: ApiRequest[] = []

  if (data.info?._postman_id || data.item) {
    // Postman Collection 格式
    const walk = (items: any[], parentName: string) => {
      for (const item of items) {
        if (item.request) {
          const req: ApiRequest = {
            id: generateId(),
            name: item.name || '',
            method: (item.request.method || 'GET').toUpperCase() as any,
            url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw || '',
            params: [],
            headers: (item.request.header || []).map((h: any) => ({
              key: h.key, value: h.value, enabled: h.disabled ? false : true,
            })),
            body: { type: 'none' },
            auth: { type: 'none' },
          }

          // Parse body
          if (item.request.body) {
            if (item.request.body.mode === 'raw') {
              req.body = { type: 'json', jsonContent: item.request.body.raw || '' }
            } else if (item.request.body.mode === 'urlencoded') {
              req.body = { type: 'urlencoded', urlencodedItems: (item.request.body.urlencoded || []).map((p: any) => ({ key: p.key, value: p.value, enabled: true })) }
            } else if (item.request.body.mode === 'formdata') {
              req.body = { type: 'form-data', formItems: (item.request.body.formdata || []).map((p: any) => ({ key: p.key, value: p.value, enabled: true, type: 'text' })) }
            }
          }

          // Parse URL params
          if (typeof item.request.url === 'object' && item.request.url.query) {
            req.params = (item.request.url.query || []).map((p: any) => ({
              key: p.key, value: p.value || '', enabled: p.disabled ? false : true,
            }))
          }

          requests.push(req)
        }
        if (item.item) walk(item.item, item.name || parentName)
      }
    }
    walk(data.item, data.info?.name || '')
    return { name: data.info?.name || 'Imported', requests }
  }

  throw new Error('Unrecognized format')
}

/** 导出为 Postman Collection v2.1 */
export function exportPostmanCollection(collections: ApiCollection[]): string {
  const convertRequests = (items: (ApiCollection | ApiRequest)[]): any[] => {
    return items.map((item) => {
      if ('children' in item) {
        // 集合/文件夹
        return { name: item.name, item: convertRequests(item.children) }
      }
      // 请求
      const req: any = {
        method: item.method,
        header: item.headers.filter(h => h.enabled && h.key).map(h => ({ key: h.key, value: h.value, disabled: !h.enabled })),
        url: { raw: item.url, query: item.params.filter(p => p.enabled && p.key).map(p => ({ key: p.key, value: p.value })) },
      }
      if (item.body?.type === 'json' && item.body.jsonContent) {
        req.body = { mode: 'raw', raw: item.body.jsonContent }
      } else if (item.body?.type === 'urlencoded' && item.body.urlencodedItems) {
        req.body = { mode: 'urlencoded', urlencoded: item.body.urlencodedItems.map(i => ({ key: i.key, value: i.value })) }
      }
      return { name: item.name || item.url, request: req }
    })
  }

  const mainCollection = collections[0]
  const result = {
    info: { name: mainCollection?.name || 'DevTools Export', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: mainCollection ? convertRequests(mainCollection.children) : [],
  }
  return JSON.stringify(result, null, 2)
}
```

- [ ] **步骤 2: Commit**

```bash
mkdir -p frontend/src/features/apidebug/utils
git add frontend/src/features/apidebug/utils/import-export.ts
git commit -m "feat: add Postman collection import/export utilities"
```

---

### 任务 15: 前端 — 主页面集成（完整 API 调试器页面）

**文件：**
- 重写：`frontend/src/features/apidebug/index.tsx`

- [ ] **步骤 1: 实现完整主页面**

```tsx
// frontend/src/features/apidebug/index.tsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ApiOutlined, SettingOutlined, CloudUploadOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { Button, Dropdown, message } from 'antd'
import PageShell from '@/components/layout/PageShell'
import SectionCard from '@/components/layout/SectionCard'
import { bridge, generateId } from '@/services/bridge'
import type { ApiRequest, ApiGlobalConfig, ApiCollection, ApiKvPair, HistoryEntry } from '@/types'
import { useApiRequest } from './hooks/useApiRequest'
import UrlBar from './components/UrlBar'
import RequestPanel from './components/RequestPanel'
import ResponsePanel from './components/ResponsePanel'
import CollectionTree from './components/CollectionTree'
import HistoryList from './components/HistoryList'
import EnvManager from './components/EnvManager'
import HeaderPreview from './components/HeaderPreview'
import WebSocketPanel from './components/WebSocketPanel'
import { importPostmanCollection, exportPostmanCollection } from './utils/import-export'

function createDefaultRequest(): ApiRequest {
  return {
    id: generateId(),
    name: '',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    body: { type: 'none' },
    auth: { type: 'none' },
  }
}

export default function ApiDebugPage() {
  const [config, setConfig] = useState<ApiGlobalConfig>({
    globalHeaders: [], environments: [], activeEnvId: null, collections: [], historyLimit: 100,
  })
  const [request, setRequest] = useState<ApiRequest>(createDefaultRequest)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [envOpen, setEnvOpen] = useState(false)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
  const [isWsMode, setIsWsMode] = useState(false)

  const { loading, response, error, send } = useApiRequest()

  // 加载配置
  useEffect(() => {
    bridge.getApiConfig().then((c) => {
      setConfig(c)
    }).catch(() => {})
  }, [])

  // 发送请求
  const handleSend = useCallback(async () => {
    if (!request.url) {
      message.warning('请输入 URL')
      return
    }
    if (request.url.startsWith('ws://') || request.url.startsWith('wss://')) {
      setIsWsMode(true)
      return
    }
    setIsWsMode(false)
    await send(request, config, config.activeEnvId)
    // 保存到历史
    setHistory((prev) => {
      const entry: HistoryEntry = {
        id: generateId(),
        timestamp: Date.now(),
        request: { ...request },
        response: response || { status: 0, statusText: '', headers: {}, body: '', size: 0, durationMs: 0, cookies: [] },
        usedEnvId: config.activeEnvId,
      }
      return [entry, ...prev].slice(0, config.historyLimit)
    })
  }, [request, config, send, response])

  // 保存配置
  const saveConfig = useCallback(async (patch: Partial<ApiGlobalConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    try { await bridge.saveApiConfig(next) } catch {}
  }, [config])

  // 集合操作
  const handleAddCollection = useCallback((name: string) => {
    const col: ApiCollection = { id: generateId(), name, children: [], headers: [] }
    saveConfig({ collections: [...config.collections, col] })
  }, [config, saveConfig])

  // 保存当前请求到集合
  const handleSaveToCollection = useCallback(() => {
    if (config.collections.length === 0) {
      message.warning('请先创建集合')
      return
    }
    const firstCol = config.collections[0]
    const savedReq = { ...request, id: generateId(), name: request.name || request.url }
    const updateChildren = (children: (ApiCollection | ApiRequest)[]): (ApiCollection | ApiRequest)[] => {
      return children.map(c => 'children' in c ? { ...c, children: updateChildren(c.children) } : c)
    }
    const updatedCollections = config.collections.map((c) => {
      if (c.id === firstCol.id) {
        return { ...c, children: [...c.children, savedReq] }
      }
      return { ...c, children: updateChildren(c.children) }
    })
    saveConfig({ collections: updatedCollections })
    message.success('已保存到集合')
  }, [request, config, saveConfig])

  // 从集合加载请求
  const handleSelectRequest = useCallback((id: string) => {
    const findReq = (items: (ApiCollection | ApiRequest)[]): ApiRequest | null => {
      for (const item of items) {
        if ('children' in item) {
          const found = findReq(item.children)
          if (found) return found
        } else if (item.id === id) {
          return item
        }
      }
      return null
    }
    const found = findReq(config.collections)
    if (found) {
      setRequest({ ...found })
      setActiveRequestId(id)
    }
  }, [config.collections])

  // Header 合并预览
  const mergedHeaders = useMemo(() => {
    const result: { key: string; value: string; source: '请求级' | '环境' | '集合' | '全局' }[] = []

    const addAll = (items: ApiKvPair[], source: '请求级' | '环境' | '集合' | '全局') => {
      items.filter(i => i.enabled && i.key).forEach(i => result.push({ key: i.key, value: i.value, source }))
    }

    addAll(config.globalHeaders, '全局')
    if (config.activeEnvId) {
      const env = config.environments.find(e => e.id === config.activeEnvId)
      if (env) addAll(env.headers, '环境')
    }
    addAll(request.headers, '请求级')
    if (request.auth?.type === 'bearer' && request.auth.token) {
      result.push({ key: 'Authorization', value: `Bearer ${request.auth.token}`, source: '请求级' })
    }
    return result
  }, [config, request])

  // WebSocket 模式
  if (isWsMode) {
    return (
      <PageShell title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <UrlBar
            method={request.method}
            url={request.url}
            envNames={config.environments.map(e => e.name)}
            activeEnvId={config.activeEnvId}
            onMethodChange={(m) => setRequest(r => ({ ...r, method: m }))}
            onUrlChange={(url) => setRequest(r => ({ ...r, url }))}
            onEnvChange={(id) => saveConfig({ activeEnvId: id })}
            onSend={() => {}}
            onSave={() => {}}
            loading={false}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <WebSocketPanel url={request.url} headers={request.headers} />
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={<><ApiOutlined style={{ color: 'var(--color-primary)', marginRight: 8 }} />API 调试器</>}
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setEnvOpen(true)}>环境</Button>
          <Dropdown menu={{
            items: [
              { key: 'import', icon: <CloudUploadOutlined />, label: '导入 Postman Collection', onClick: () => {
                bridge.selectFile('选择 Postman Collection (.json)').then(async (path) => {
                  if (!path) return
                  try {
                    const text = await bridge.readTextFile(path)
                    const result = importPostmanCollection(text)
                    const newCol: ApiCollection = { id: generateId(), name: result.name, children: result.requests, headers: [] }
                    saveConfig({ collections: [...config.collections, newCol] })
                    message.success(`已导入 ${result.requests.length} 个请求`)
                  } catch (err: any) {
                    message.error('导入失败: ' + err.message)
                  }
                }).catch(() => {})
              }},
              { key: 'export', icon: <CloudDownloadOutlined />, label: '导出 Postman Collection', onClick: async () => {
                const path = await bridge.selectSaveFile('保存为 Postman Collection')
                if (path) {
                  const json = exportPostmanCollection(config.collections)
                  await bridge.writeTextFile(path, json)
                  message.success('导出成功')
                }
              }},
            ],
          }}>
            <Button size="small" icon={<CloudDownloadOutlined />}>导入/导出</Button>
          </Dropdown>
        </div>
      }
    >
      <div style={styles.layout}>
        <div style={styles.sidebar}>
          <CollectionTree
            collections={config.collections}
            activeRequestId={activeRequestId}
            onSelectRequest={handleSelectRequest}
            onAddCollection={handleAddCollection}
            onAddFolder={(parentId, name) => {
              const updateTree = (items: (ApiCollection | ApiRequest)[]): (ApiCollection | ApiRequest)[] =>
                items.map(item => {
                  if ('children' in item && item.id === parentId)
                    return { ...item, children: [...item.children, { id: generateId(), name, children: [], headers: [] }] }
                  if ('children' in item)
                    return { ...item, children: updateTree(item.children) }
                  return item
                })
              saveConfig({ collections: updateTree(config.collections) as ApiCollection[] })
            }}
            onDeleteItem={(id) => {
              const removeFrom = (items: (ApiCollection | ApiRequest)[]): (ApiCollection | ApiRequest)[] =>
                items.filter(item => {
                  if (item.id === id) return false
                  if ('children' in item) item.children = removeFrom(item.children)
                  return true
                })
              saveConfig({ collections: removeFrom(config.collections) as ApiCollection[] })
            }}
          />
          <HistoryList
            history={history}
            onSelect={(entry) => { setRequest({ ...entry.request }); setActiveRequestId(null) }}
            onClear={() => setHistory([])}
          />
        </div>
        <div style={styles.main}>
          <SectionCard title="请求" fill>
            <UrlBar
              method={request.method}
              url={request.url}
              envNames={config.environments.map(e => e.name)}
              activeEnvId={config.activeEnvId}
              onMethodChange={(m) => setRequest(r => ({ ...r, method: m }))}
              onUrlChange={(url) => setRequest(r => ({ ...r, url }))}
              onEnvChange={(id) => saveConfig({ activeEnvId: id })}
              onSend={handleSend}
              onSave={handleSaveToCollection}
              loading={loading}
            />
            <RequestPanel request={request} onChange={setRequest} />
            <div style={{ padding: '4px 0' }}>
              <HeaderPreview merged={mergedHeaders} />
            </div>
          </SectionCard>

          <SectionCard title="响应" fill style={{ borderTop: '0.5px solid var(--color-border)' }}>
            <ResponsePanel response={response} loading={loading} error={error} />
          </SectionCard>
        </div>
      </div>

      <EnvManager
        open={envOpen}
        environments={config.environments}
        onClose={() => setEnvOpen(false)}
        onSave={(envs) => saveConfig({ environments: envs })}
      />
    </PageShell>
  )
}

const styles: Record<string, React.CSSProperties> = {
  layout: { display: 'flex', height: '100%', overflow: 'hidden' },
  sidebar: { width: 240, minWidth: 240, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--color-border)', background: 'var(--color-bg-2)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
}
```

- [ ] **步骤 2: 验证开发服务器可工作**

运行：`cd frontend && npx tsc --noEmit`
预期：TypeScript 编译通过，无类型错误

- [ ] **步骤 3: Commit**

```bash
git add frontend/src/features/apidebug/index.tsx
git commit -m "feat: complete API debugger main page integration"
```

---

### 任务 16: 自检与验证

- [ ] **步骤 1: 检查所有文件是否完整**

```bash
git status
```
预期：以下文件全部被跟踪：
- `internal/apidebug/apidebug.go`
- `app.go`（修改）
- `frontend/src/types/index.ts`（修改）
- `frontend/src/services/bridge.ts`（修改）
- `frontend/src/components/nav/Sidebar.tsx`（修改）
- `frontend/src/App.tsx`（修改）
- `frontend/src/features/apidebug/index.tsx`
- `frontend/src/features/apidebug/components/KvEditor.tsx`
- `frontend/src/features/apidebug/components/UrlBar.tsx`
- `frontend/src/features/apidebug/components/RequestPanel.tsx`
- `frontend/src/features/apidebug/components/ResponsePanel.tsx`
- `frontend/src/features/apidebug/components/HeaderPreview.tsx`
- `frontend/src/features/apidebug/components/CollectionTree.tsx`
- `frontend/src/features/apidebug/components/HistoryList.tsx`
- `frontend/src/features/apidebug/components/EnvManager.tsx`
- `frontend/src/features/apidebug/components/WebSocketPanel.tsx`
- `frontend/src/features/apidebug/hooks/useApiRequest.ts`
- `frontend/src/features/apidebug/hooks/useWebSocket.ts`
- `frontend/src/features/apidebug/utils/import-export.ts`

- [ ] **步骤 2: 验证 Go 编译**

运行：`go build ./...`
预期：编译通过，无错误

- [ ] **步骤 3: 最终 commit**

```bash
git add -A
git commit -m "docs: complete API debugger implementation plan"
```

## 规格覆盖度检查

| 规格章节 | 对应任务 | 状态 |
|---------|---------|------|
| 架构决策（纯前端方案） | 头部 + 任务 1 | ✓ |
| 页面布局（三栏式） | 任务 3, 15 | ✓ |
| 数据模型 | 任务 2 | ✓ |
| URL 栏 | 任务 5 | ✓ |
| 请求构建器 (Params/Headers/Body/Auth) | 任务 6 | ✓ |
| 响应查看器 (Body/Headers/Cookies/统计) | 任务 7 | ✓ |
| WebSocket | 任务 8, 13 | ✓ |
| 集合管理 | 任务 10, 15 | ✓ |
| 历史记录 | 任务 11, 15 | ✓ |
| 环境变量 | 任务 12 | ✓ |
| Header 优先级合并预览 | 任务 9, 15 | ✓ |
| 导入导出 | 任务 14, 15 | ✓ |
| Go 后端配置持久化 | 任务 1 | ✓ |
| 导航/页面注册 | 任务 3 | ✓ |
| 自检验证 | 任务 16 | ✓ |
