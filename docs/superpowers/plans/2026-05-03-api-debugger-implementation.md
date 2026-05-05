# API 调试器改造实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成 API 调试器的大文本编辑器替换、弹框统一、Auth 界面移除，以及集合请求的自动保存模型。

**架构：** 保持现有 API 调试器页面结构不变，在 `index.tsx` 中重构“当前请求”和“集合请求”的同步方式；在 `CollectionTree` 中补齐集合/文件夹/请求的创建与确认弹框；在请求与响应面板中把大文本区域替换为 Monaco Editor。

**技术栈：** React 18、TypeScript、Ant Design 5、Monaco Editor、Wails bridge

---

## 文件结构

- 修改：`frontend/src/features/apidebug/index.tsx` — 管理当前请求、选中请求和自动保存数据流
- 修改：`frontend/src/features/apidebug/components/CollectionTree.tsx` — 替换系统弹框，补充新建请求/新建文件夹/删除确认
- 修改：`frontend/src/features/apidebug/components/RequestPanel.tsx` — 移除 Auth，Body 文本区改用编辑器
- 修改：`frontend/src/features/apidebug/components/ResponsePanel.tsx` — 响应体改用编辑器展示
- 修改：`frontend/src/features/apidebug/components/UrlBar.tsx` — 去掉保存按钮
- 修改：`frontend/src/types/index.ts` — 如有需要补齐 API 调试器类型
- 测试：手工验证 API 调试器页面关键交互

### 任务 1：重构集合请求的数据流

**文件：**
- 修改：`frontend/src/features/apidebug/index.tsx`

- [ ] **步骤 1：定位当前“保存到集合”与“选中请求”逻辑**

```ts
const [request, setRequest] = useState<ApiRequest>(createDefaultRequest)
const [activeRequestId, setActiveRequestId] = useState<string | null>(null)
```

- [ ] **步骤 2：删除固定保存到第一个集合的逻辑**

```ts
// 删除 handleSaveToCollection
```

- [ ] **步骤 3：增加按请求 ID 写回集合树的方法**

```ts
const updateRequestInTree = (items: (ApiCollection | ApiRequest)[], requestId: string, updater: (req: ApiRequest) => ApiRequest): (ApiCollection | ApiRequest)[] =>
  items.map((item) => {
    if ('children' in item) {
      return { ...item, children: updateRequestInTree(item.children, requestId, updater) }
    }
    return item.id === requestId ? updater(item) : item
  })
```

- [ ] **步骤 4：封装统一的请求更新入口**

```ts
const handleRequestChange = useCallback((next: ApiRequest) => {
  setRequest(next)
  if (!activeRequestId) return
  const collections = updateRequestInTree(config.collections, activeRequestId, () => next) as ApiCollection[]
  saveConfig({ collections })
}, [activeRequestId, config.collections, saveConfig])
```

- [ ] **步骤 5：实现“在容器下新建请求并自动选中”**

```ts
const newRequest: ApiRequest = {
  ...createDefaultRequest(),
  name,
}
```

- [ ] **步骤 6：历史记录恢复时切回未绑定状态**

```ts
onSelect={(entry) => {
  setRequest({ ...entry.request })
  setActiveRequestId(null)
}}
```

### 任务 2：改造集合树交互与弹框

**文件：**
- 修改：`frontend/src/features/apidebug/components/CollectionTree.tsx`

- [ ] **步骤 1：删除系统 `prompt()` 调用**

```ts
// 删除 prompt('文件夹名称:')
```

- [ ] **步骤 2：新增受控弹框状态**

```ts
const [folderModal, setFolderModal] = useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null })
const [requestModal, setRequestModal] = useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null })
```

- [ ] **步骤 3：为集合/文件夹节点提供“新建文件夹”和“新建请求”操作**

```tsx
<Button type="text" size="small" onClick={() => setFolderModal({ open: true, parentId: item.id })} />
<Button type="text" size="small" onClick={() => setRequestModal({ open: true, parentId: item.id })} />
```

- [ ] **步骤 4：删除动作改为 `Modal.confirm`**

```ts
Modal.confirm({
  title: '确认删除',
  content: '删除后不可恢复。',
  onOk: () => onDeleteItem(id),
})
```

- [ ] **步骤 5：创建文件夹和请求后清空输入并关闭弹框**

```ts
setFolderName('')
setFolderModal({ open: false, parentId: null })
```

### 任务 3：移除保存按钮和 Auth 界面

**文件：**
- 修改：`frontend/src/features/apidebug/components/UrlBar.tsx`
- 修改：`frontend/src/features/apidebug/components/RequestPanel.tsx`
- 修改：`frontend/src/features/apidebug/index.tsx`

- [ ] **步骤 1：移除 UrlBar 的 `onSave` 参数和保存按钮**

```tsx
<Button type="primary" size="small" icon={<SendOutlined />} onClick={onSend} loading={loading}>
  发送
</Button>
```

- [ ] **步骤 2：删除 `RequestPanel` 中的 Auth 内容和 Tab**

```tsx
items={[
  { key: 'params', label: 'Params', children: ... },
  { key: 'headers', label: 'Headers', children: ... },
  { key: 'body', label: 'Body', children: ... },
]}
```

- [ ] **步骤 3：删除 Header 预览中基于 `request.auth` 注入的 Authorization 逻辑**

```ts
// 删除 bearer token 合并逻辑
```

### 任务 4：把大文本区域替换为 Monaco Editor

**文件：**
- 修改：`frontend/src/features/apidebug/components/RequestPanel.tsx`
- 修改：`frontend/src/features/apidebug/components/ResponsePanel.tsx`

- [ ] **步骤 1：为请求体编辑区引入 Monaco Editor**

```tsx
<Editor
  height="220px"
  language="json"
  theme="vs-dark"
  value={request.body?.jsonContent || ''}
  onChange={(value) => update({ body: { ...request.body!, jsonContent: value || '' } })}
/>
```

- [ ] **步骤 2：为 Raw Body 提供内容类型输入 + 编辑器组合**

```tsx
<Editor
  height="220px"
  defaultLanguage="plaintext"
  value={request.body?.rawContent || ''}
  onChange={(value) => update({ body: { ...request.body!, rawContent: value || '' } })}
/>
```

- [ ] **步骤 3：响应体改成只读编辑器展示**

```tsx
<Editor
  height="320px"
  language={bodyView === 'formatted' ? 'json' : 'plaintext'}
  value={bodyView === 'raw' ? response.body : filteredBody}
  options={{ readOnly: true, minimap: { enabled: false } }}
/>
```

- [ ] **步骤 4：整理编辑器样式，保证布局不挤压**

```ts
editorWrap: { border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }
```

### 任务 5：验证关键交互

**文件：**
- 手工验证：API 调试器页面

- [ ] **步骤 1：运行前端检查命令**

运行：`pnpm --dir frontend exec tsc --noEmit`
预期：PASS

- [ ] **步骤 2：启动页面并手工验证以下流程**

运行：`wails dev`
预期：应用可打开 API 调试器页面

- [ ] **步骤 3：验证集合请求自动保存**

```text
1. 新建集合
2. 在集合或文件夹下新建请求
3. 选中请求后修改 URL / Body / Headers
4. 切换走再切回，确认数据仍在
```

- [ ] **步骤 4：验证弹框与编辑器替换**

```text
1. 新建文件夹时不出现系统 prompt
2. 删除时走 Antd 确认弹框
3. Body / Raw / Response Body 为编辑器视图
4. 页面不再显示 Auth Tab 和保存按钮
```
