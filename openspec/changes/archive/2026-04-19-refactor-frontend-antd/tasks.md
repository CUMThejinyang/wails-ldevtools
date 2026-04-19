## 1. 工程脚手架

- [x] 1.1 新建 `frontend-antd/` 根目录，写 `.gitignore`（忽略 `node_modules`、`dist`）
- [x] 1.2 初始化 `package.json`：声明 `react@18.3.1`、`react-dom@18.3.1`、`typescript@5.7.3`、`vite@5.4.14`、`@vitejs/plugin-react`、`antd@^5`、`@ant-design/icons`、`dayjs`、`tailwindcss@^4`、`@tailwindcss/vite`、`clsx`、`tailwind-merge`、`react-activation`；`scripts: dev/build/preview`
- [x] 1.3 写 `vite.config.ts`：`@vitejs/plugin-react` + `@tailwindcss/vite`，`resolve.alias['@'] = '/src'`，`build.outDir = 'dist'`
- [x] 1.4 写 `tsconfig.json`：`strict: true`、`jsx: react-jsx`、`paths: { '@/*': ['src/*'] }`
- [x] 1.5 写 `index.html`：挂 `<div id="root"></div>`，`<title>DevTools</title>`，字体与 meta 对齐老版本
- [x] 1.6 在 `frontend-antd/` 下执行 `pnpm install`，确认依赖无冲突

## 2. 样式与主题基座

- [x] 2.1 将 `frontend/src/styles/index.css` 完整迁入 `frontend-antd/src/styles/index.css`，保留 CSS 变量与暗/亮主题
- [x] 2.2 新建 `frontend-antd/src/app/theme.ts`：导出 `buildAntdTheme(mode)`，映射 `colorPrimary`、`colorBgBase`、`colorBgContainer`、`colorBgElevated`、`colorBorder`、`borderRadius`、`fontFamily`、`controlHeight`；按组件微调（Button/Input/Select/Modal/Table）
- [x] 2.3 写 `src/main.tsx`：`ReactDOM.createRoot` + `<ConfigProvider theme=buildAntdTheme(mode) locale=zhCN><App /></ConfigProvider>`，`dayjs.locale('zh-cn')`
- [x] 2.4 写 `src/App.tsx` 壳：`TitleBar` + 主体（Sidebar + main），从 `bridge.getTheme()` 读初始主题并设 `body[theme-mode]`

## 3. 服务层与通用 hooks

- [x] 3.1 新建 `src/services/bridge.ts`：迁移 `frontend/src/hooks/bridge.ts` 中所有方法（`getTheme/setTheme/selectDirectory/selectFile/getCleanerSettings/saveCleanerSettings/cleanPreview/cleanStart/cleanCancel/getSyncConfig/saveSyncConfig/syncPreview/syncStart/syncCancel/syncAnswer` 等），严格照搬类型与签名
- [x] 3.2 新建 `src/types/index.ts`，把 `frontend/src/types/index.ts` 迁过来
- [x] 3.3 新建 `src/hooks/useWailsEvent.ts`：封装 `EventsOn` + cleanup 解绑
- [x] 3.4 新建 `src/app/keepalive.tsx`：封装 `react-activation` 的 `<AliveScope>` 与 `<KeepAlive>`，根组件用 `AliveScope` 包裹

## 4. 图标规范

- [x] 4.1 约定所有图标优先从 `@ant-design/icons` 引入
- [x] 4.2 新建 `src/icons/` 目录与 `IconProps` 类型；为老版本用到的非 antd-icons 图标补自绘 SVG 组件（命名导出）
- [x] 4.3 在 `src/icons/index.ts` 做 barrel 导出

## 5. 共享组件：导航层

- [x] 5.1 `components/nav/TitleBar.tsx`：44px 高，拖拽区 + 置顶按钮 + 最小化/最大化/关闭；样式对齐老 `TitleBar.tsx`
- [x] 5.2 `components/nav/Sidebar.tsx`：52px 宽，垂直 36×36 圆形图标按钮，激活项主色背景
- [x] 5.3 `components/nav/NavIconButton.tsx`：单个导航按钮，支持 `active` / `tooltip`
- [x] 5.4 Sidebar 的菜单配置 `NAV_ITEMS`（id/label/icon）放在 Sidebar 组件附近，易于扩展

## 6. 共享组件：布局层

- [x] 6.1 `components/layout/PageShell.tsx`：`{ title, actions?, children }`，顶部标题栏 + 内容区；样式对齐老版本页面框架
- [x] 6.2 `components/layout/SectionCard.tsx`：`{ title?, extra?, children }`，卡片容器，圆角 10px、边框 0.5px
- [x] 6.3 `components/layout/Toolbar.tsx`：横向按钮组容器

## 7. 共享组件：表单层

- [x] 7.1 `components/form/PathPicker.tsx`：受控 `{ value, onChange, mode: 'dir' | 'file', disabled? }`，内部调用 `bridge.selectDirectory` / `bridge.selectFile`
- [x] 7.2 `components/form/PatternInput.tsx`：受控 `{ value: string[], onChange }`，标签化输入，回车添加、点 × 删除
- [x] 7.3 `components/form/NumberStepper.tsx`：`{ value, onChange, min, max, step }`，两端带方向按钮

## 8. 共享组件：反馈层

- [x] 8.1 `components/feedback/ProgressPanel.tsx`：`{ current, total, currentFile?, status }`，带进度条 / 当前文件（hover tooltip 显示完整路径）
- [x] 8.2 `components/feedback/EmptyState.tsx`：`{ icon, title, description?, action? }`
- [x] 8.3 `components/feedback/StatRow.tsx`：`{ label, value, highlight? }`
- [x] 8.4 `components/feedback/StatusTag.tsx`：枚举 `pending/scanning/deleting/syncing/done/error/cancelled/skipped/new/modified/identical` 映射颜色

## 9. 通用组件

- [x] 9.1 `components/common/IconButton.tsx`：28×28 方形图标按钮，可选 `danger` 变体
- [x] 9.2 `components/common/ConfirmModal.tsx`：封装 Antd Modal，`{ title, content, onOk, onCancel, danger? }`

## 10. Cleaner 模块迁移

- [x] 10.1 新建 `features/cleaner/` 目录与 `index.tsx` 入口；仅渲染 `PageShell` 空壳，能通过 Sidebar 路由切入
- [x] 10.2 迁移配置列表视图：新增/编辑/删除/启用切换/拖拽排序（若老版本有）
- [x] 10.3 把每个配置项的表单字段用 `PathPicker` / `PatternInput` / Antd `Switch` / Antd `InputNumber` 重写
- [x] 10.4 "线程数" 使用 `NumberStepper`
- [x] 10.5 "预览" 弹窗：Antd `Modal` + `Table`（或 `Tree`）列出 `PreviewItem[]`，支持全选/反选/按文件夹折叠
- [x] 10.6 "开始清理"：订阅 `cleaner:progress` 走 `useWailsEvent`，用 `ProgressPanel` 显示；"取消"按钮走 `bridge.cleanCancel`
- [x] 10.7 "清理完成"：订阅 `cleaner:completed`，展示 `OverallResult` 汇总与每个 `FolderResult`；错误行用 `StatusTag`
- [x] 10.8 用 `KeepAlive` 包裹 Cleaner 页面保留状态
- [x] 10.9 人工对照老 Cleaner 页面截图做视觉走查（空态、列表、预览弹窗、进行中、完成态、错误态）

## 11. Sync 模块迁移

- [x] 11.1 新建 `features/sync/` 目录与 `index.tsx` 入口
- [x] 11.2 源/目标路径用 `PathPicker`；模式用 `PatternInput`；线程数用 `NumberStepper`
- [x] 11.3 冲突策略用 Antd `Radio.Group`（overwrite / skip / ask）
- [x] 11.4 "预览"：调用 `bridge.syncPreview`，用 Antd `Table` 列出 `SyncPreviewItem[]`，状态列用 `StatusTag`；默认仅勾选 `new` + `modified`
- [x] 11.5 "开始同步"：`useWailsEvent('sync:progress', ...)` 逐条更新；用 Antd `Table.rowClassName` 或状态列显示过程态
- [x] 11.6 `ask` 冲突弹窗：Antd `Modal.confirm` 询问"覆盖 / 跳过 / 覆盖全部 / 跳过全部"，结果回传 `bridge.syncAnswer`
- [x] 11.7 "同步完成"：订阅 `sync:completed`，显示成功/跳过/失败计数与耗时
- [x] 11.8 用 `KeepAlive` 包裹 Sync 页面
- [x] 11.9 人工对照老 Sync 页面做视觉走查

## 12. Settings 模块迁移

- [x] 12.1 新建 `features/settings/` 目录与 `index.tsx` 入口
- [x] 12.2 左侧分类侧栏（当前仅"外观"），用 `btn-settings-item` 同等样式；预留扩展位
- [x] 12.3 "外观"分类右侧主题切换：dark / light 两个按钮，激活态同老版 `.btn-theme.active`；切换调用 `bridge.setTheme`
- [x] 12.4 用 `KeepAlive` 包裹 Settings 页面
- [x] 12.5 人工对照老 Settings 页面做视觉走查

## 13. 构建切换

- [x] 13.1 修改 `wails.json`：`frontend:install` / `frontend:build` / `frontend:dev:watcher` 指向 `frontend-antd`
- [x] 13.2 修改 `main.go`：`//go:embed frontend/dist` → `//go:embed all:frontend-antd/dist`（保持 embed 变量名）
- [x] 13.3 本地执行 `wails dev` 冒烟：三个页面能打开、主题能切换、Cleaner 空态能新增配置
- [x] 13.4 本地执行 `wails build` 冒烟：产物 `build/bin/DevTools.exe` 能启动并正常工作

## 14. 验收与收尾

- [x] 14.1 视觉回归清单：对 Cleaner / Sync / Settings 各做一次"与老版本并排截图"的对比记录（保存到本变更目录）
- [x] 14.2 交互回归清单：新增配置 → 预览 → 清理 → 取消 / 完成；同步预览 → 同步 → 冲突弹窗 → 完成；主题切换持久化
- [x] 14.3 `frontend/` 目录原样保留，`git status` 中新增仅来自 `frontend-antd/` 与 `wails.json` / `main.go` 的小幅改动
- [x] 14.4 更新 `CLAUDE.md` 中"Architecture"与"Adding a new module"段落以反映新目录结构
