## ADDED Requirements

### Requirement: 新前端工程目录结构

系统 SHALL 在仓库根目录下创建 `frontend-antd/` 作为独立工程，与既有 `frontend/` 并存互不影响。`frontend-antd/` MUST 包含 `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html` 与 `src/` 目录，`src/` 下 MUST 按照 `app/`、`components/`、`features/`、`services/`、`hooks/`、`icons/`、`styles/`、`types/` 进行分层。

#### Scenario: 初次克隆仓库后查看目录结构
- **WHEN** 开发者在仓库根目录执行 `ls`
- **THEN** 同时存在 `frontend/` 与 `frontend-antd/` 两个目录
- **AND** `frontend-antd/src/` 下存在 `app`、`components`、`features`、`services`、`hooks`、`icons`、`styles`、`types` 子目录

#### Scenario: 老前端目录保持不变
- **WHEN** 新工程搭建完成
- **THEN** `frontend/` 内的任何文件、依赖、产物均未被修改或删除

### Requirement: 技术栈依赖

`frontend-antd/package.json` MUST 声明如下关键依赖：`react@18`、`react-dom@18`、`typescript@5`、`vite@5`、`@vitejs/plugin-react`、`antd@^5`、`@ant-design/icons`、`dayjs`、`tailwindcss@^4`、`@tailwindcss/vite`、`clsx`、`tailwind-merge`、`react-activation`。包管理器 SHALL 为 `pnpm`。

#### Scenario: 安装依赖
- **WHEN** 开发者在 `frontend-antd/` 下执行 `pnpm install`
- **THEN** 安装过程成功完成
- **AND** `node_modules/antd`、`node_modules/@ant-design/icons`、`node_modules/tailwindcss` 都存在

#### Scenario: 未引入 lucide-react
- **WHEN** 查看 `frontend-antd/package.json`
- **THEN** `dependencies` 中不包含 `lucide-react`

### Requirement: Wails 构建产物切换

仓库的 `wails.json` 中 `frontend:install` / `frontend:build` / `frontend:dev:watcher` 字段 MUST 指向 `frontend-antd`；`main.go` 中 `//go:embed` 指令 MUST 引用 `frontend-antd/dist`。`wails build` SHALL 产出可运行的 `DevTools.exe`。

#### Scenario: 本地启动开发模式
- **WHEN** 开发者在项目根目录执行 `wails dev`
- **THEN** 新前端工程 `frontend-antd/` 被加载
- **AND** 热更新对 `frontend-antd/src/**` 下的改动生效

#### Scenario: 生产构建
- **WHEN** 开发者执行 `wails build`
- **THEN** 生成 `build/bin/DevTools.exe`
- **AND** 可执行文件启动后显示基于新前端的界面

### Requirement: 主题与 Token 映射

系统 MUST 通过 Ant Design `ConfigProvider` 提供主题，主题 token 从 `src/styles/index.css` 中的 CSS 变量（沿用老项目 `--color-primary`、`--color-background`、`--color-background-soft`、`--color-background-mute`、`--color-border` 等）派生。主题切换 SHALL 通过 `document.body.setAttribute('theme-mode', 'dark' | 'light')` 触发，同时影响 Antd 控件与 Tailwind 类。

#### Scenario: 切换暗色到亮色主题
- **WHEN** 用户点击主题切换按钮将主题从 `dark` 切到 `light`
- **THEN** `body[theme-mode]` 变为 `light`
- **AND** 所有 Antd 控件（按钮、输入框、表格、弹窗）即时切换到亮色
- **AND** Tailwind 通过 CSS 变量渲染的背景、文字、边框同步切换

#### Scenario: 主色保持一致
- **WHEN** 主题任意切换
- **THEN** 主色保持为 `#00b96b`
- **AND** 主按钮、激活态侧边栏图标、进度条均使用该主色

### Requirement: Wails Bridge 封装

所有对 `window.go.main.App.*` 方法的调用 MUST 经由 `src/services/bridge.ts` 封装暴露；业务层（`features/*`、`components/*`）不得直接访问 `window.go`。Wails 事件订阅 MUST 经由 `hooks/useWailsEvent` 封装，并在组件卸载时自动解绑。

#### Scenario: 通过 bridge 调用 Go 方法
- **WHEN** 一个 feature 组件需要调用 `CleanStart`
- **THEN** 代码通过 `import { bridge } from '@/services/bridge'` 调用 `bridge.cleanStart(...)`
- **AND** 组件源码中不出现 `window.go` 字样

#### Scenario: 事件订阅自动解绑
- **WHEN** 使用 `useWailsEvent('cleaner:progress', handler)` 的组件被卸载
- **THEN** 对应的 Wails 事件监听器被解除
