# API 调试器改造设计

## 目标

在 API 调试器页面完成四项改造：
1. 所有大文本字符串展示/编辑区域统一改为当前项目已引入的编辑器承载。
2. 全部弹框统一使用 Ant Design 组件，不再使用系统原生 `prompt/confirm`。
3. 移除 `Auth` 交互界面。
4. 修复集合保存模型：请求必须先在集合/文件夹中创建，选中后右侧所有编辑自动保存。

## 现状问题

- `frontend/src/features/apidebug/components/RequestPanel.tsx` 仍用原生 `textarea` 编辑 JSON / Raw Body，并保留 `Auth` Tab。
- `frontend/src/features/apidebug/components/ResponsePanel.tsx` 仍用 `pre` 展示响应体。
- `frontend/src/features/apidebug/components/CollectionTree.tsx` 使用系统 `prompt()` 新建文件夹。
- `frontend/src/features/apidebug/index.tsx` 的“保存到集合”逻辑固定保存到第一个集合，不符合“先建请求，再选中请求自动保存”的交互。

## 设计范围

本次采用方案 1：
- 仅替换大文本展示/编辑区为编辑器。
- 保留 URL、集合名、文件夹名、Content-Type 等短字段使用 Antd `Input`。
- 保留现有整体两栏布局，不做无关重构。

## 设计方案

### 1. 编辑器替换范围

大文本区域统一使用项目已引入的 Monaco Editor：
- 请求面板中的 JSON Body 编辑区。
- 请求面板中的 Raw Body 编辑区。
- 响应面板中的 Body 展示区。
- 响应头不改成全编辑器页面，继续保留结构化展示；仅正文类长文本走编辑器。

这样能满足“字符串展示统一由编辑器承载”的核心诉求，同时避免把 URL、集合名等短字段也强行编辑器化，保证布局紧凑。

### 2. Auth 界面移除

`RequestPanel` 删除 `Auth` Tab 及相关输入控件。
`ApiRequest` 数据结构暂时保留 `auth` 字段以兼容已有配置和 bridge 数据流，但页面不再暴露任何 Auth 编辑入口，也不再基于页面状态拼接 `Authorization` 头。

### 3. 集合与请求的数据流

将右侧当前请求区分为两种状态：
- **未绑定请求**：仅存在于当前编辑态，不写入集合。
- **已绑定请求**：来自集合树中的具体请求节点；选中后进入自动保存模式。

行为约束：
- 页面提供“新建请求”入口，但必须挂在某个集合或文件夹下创建。
- 新建请求后自动选中该请求，右侧进入绑定编辑。
- 绑定编辑时，Method / URL / Params / Headers / Body 的所有修改直接写回集合树中的目标请求，并触发配置保存。
- 历史记录选中后只恢复到未绑定编辑态，不覆盖集合中的请求。
- 删除“保存到集合”按钮，避免和自动保存模型冲突。

### 4. 集合树交互

集合树中的容器节点（集合、文件夹）提供明确的新增操作：
- 新建子文件夹
- 新建请求

请求节点职责单一：
- 点击即选中
- 选中后右侧编辑自动保存

新增请求时至少输入请求名称，默认带一个空白 `ApiRequest`。名称为空时可回退为“新请求”。

### 5. 弹框统一规范

全部新增/确认交互使用 Antd 组件：
- 新建集合：继续使用 `Modal`。
- 新建文件夹：新增受控 `Modal`。
- 新建请求：新增受控 `Modal`。
- 删除确认：使用 `Modal.confirm`。

交互状态在关闭弹框时统一清理，避免旧输入残留。

### 6. 页面布局调整

保持左侧“集合 + 历史”、右侧“请求 + 响应”的主布局。
细节调整：
- `UrlBar` 去掉保存按钮，只保留方法、URL、环境、发送。
- `RequestPanel` 的 Body 区使用编辑器，给编辑器固定最小高度，避免挤压布局。
- `ResponsePanel` 的 Body 区用编辑器承载 formatted/raw 两种视图，搜索栏保持在顶部工具区。
- 集合树节点操作按钮只在节点右侧呈现，避免视觉噪音。

## 影响文件

- `frontend/src/features/apidebug/index.tsx`
- `frontend/src/features/apidebug/components/UrlBar.tsx`
- `frontend/src/features/apidebug/components/RequestPanel.tsx`
- `frontend/src/features/apidebug/components/ResponsePanel.tsx`
- `frontend/src/features/apidebug/components/CollectionTree.tsx`
- `frontend/src/types/index.ts`

## 验证要求

- 能在集合或文件夹下新建请求，并自动选中。
- 选中集合请求后，修改 URL / Body / Headers 会立即持久化，刷新后仍存在。
- 页面中不再出现系统原生 `prompt/confirm`。
- 页面中不再显示 `Auth` Tab。
- JSON / Raw Body / Response Body 使用 Monaco Editor 展示。
