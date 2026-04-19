## Context

DevTools 是 Wails v2 桌面应用（Go + React，前端通过 `embed.FS` 打包）。当前 `frontend/` 存在以下问题：

- 页面/组件大量用 `React.CSSProperties` 内联样式，与 `styles/index.css` 里的 `.btn-*`、`.btn-icon-*` 等类混用，风格源头分散。
- 组件复用停留在 `Sidebar` / `TitleBar` / `Tooltip` 少量几个；Cleaner / Sync 两个主页面里大量重复的 "路径选择"、"模式输入"、"进度条"、"结果统计" 片段均是每页各写一份。
- 表单/表格/下拉/弹窗等交互全部手写，缺少键盘、a11y、loading、empty 状态的一致处理。
- 图标依赖 `lucide-react@0.263.1`（较老版本），部分业务图标靠自己拼 SVG。

项目整体代码量中等（三页面 + 两个 Go 模块），还没有测试覆盖；后端（Go + Wails bridge）保持稳定。现在是做前端重构的好时机：并行引入新目录 `frontend-antd/`，分阶段迁移页面，老目录作为对照参考留存。

**关键约束**：
- 视觉必须与现有一致（主色 `#00b96b`、三级深色背景、半透明边框、圆角、侧边栏 52px、标题栏 44px 等，详见 `frontend/src/styles/index.css` 中的 CSS 变量）。
- Go 侧绑定层（`window.go.main.App.*` 方法与 `cleaner:progress` / `cleaner:completed` 事件）保持不变。
- 平台为 Windows，构建工具 `wails build` 已经能跑通。

## Goals / Non-Goals

**Goals:**
- 搭建一个结构清晰、可持续扩展的新前端工程 `frontend-antd/`，用 Ant Design 5 承担基础控件、Tailwind v4 承担布局/间距微调。
- 产出一套可复用的项目内 UI 层（`components/`），让三个业务模块共享相同的容器、表单行、路径选择器、进度面板等。
- 保持与老版本像素级一致的外观，用户在不知情的情况下切换版本不应明显感知差异。
- 图标统一：优先用 `@ant-design/icons`，缺失再用自绘 SVG（放 `icons/` 下作为组件导出）。
- 老 `frontend/` 保留原样，不做任何破坏；通过 `wails.json` 和 `main.go` 的 embed 路径切换构建目标。

**Non-Goals:**
- 不改 Go 侧任何业务逻辑、API 签名、事件名。
- 不做功能增强（不加新页面、不改交互流程），重构期间任何"顺手优化"一律延后。
- 不接入国际化、不引入状态管理库（Redux / Zustand）——现有本地 `useState` 够用。
- 不写自动化测试（当前仓库无测试基础设施，本次不新建）。
- 不移除老 `frontend/` 目录；清理留给后续独立变更。

## Decisions

### D1：引入 Ant Design 5，而不是继续纯手写 / 换 shadcn / Arco

**决定**：使用 `antd@^5` + `@ant-design/icons`。

**理由**：
- Antd 控件最完整（Form、Table、Modal、Message、Notification、Tree、Drawer、Tabs、Progress），能立刻替换掉大量手写代码。
- ConfigProvider 支持 `theme.token` 精细覆盖，能把现有色板完整映射过去，不必重写视觉。
- 本项目是桌面工具类 UI，需要密度适中、成熟稳定，Antd 是业界更对口的选择；shadcn/radix 更偏"样式自助"，会损失掉"引入组件库"的收益。
- 团队熟悉度高（中文生态、文档齐全）。

**考虑过的替代**：
- shadcn/ui：需要手动 copy，组件覆盖不如 Antd 全；且与现在纯手写差别不大。
- Arco Design：可用但生态、图标库、dayjs 兼容度都弱于 Antd。

### D2：Tailwind v4 保留，用于布局与间距

**决定**：保留 `tailwindcss@^4` + `@tailwindcss/vite`，与 Antd 共存。

**理由**：
- Antd 擅长控件，Tailwind 擅长布局（flex/grid/gap/padding）。两者分工明确不会打架。
- 现有 `styles/index.css` 里的 CSS 变量 + `@import "tailwindcss"` 模式可以直接迁过来。
- 通过 `ConfigProvider.theme.token` 和 Tailwind CSS 变量双向共享同一组 token（主色、背景、边框），不会出现"两套颜色"的撕裂感。

**踩坑预防**：Antd v5 默认使用 CSS-in-JS，要注意 `hashed: false` 或保留默认，防止 SSR 样式冲突（本项目是 SPA，不存在 SSR，默认即可）。

### D3：目录结构——feature-first + 共享层分离

**决定**：采用如下结构：

```
frontend-antd/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ tailwind.config.ts        # v4 可选配置
└─ src/
   ├─ main.tsx               # 入口，挂 ConfigProvider / App
   ├─ App.tsx                # 壳：TitleBar + Sidebar + 页面路由
   ├─ app/
   │   ├─ router.tsx         # activePage 切换（保持 useState 方案，不引 react-router）
   │   ├─ theme.ts           # antd token + CSS var 映射
   │   └─ keepalive.tsx      # 封装 react-activation 的 KeepAlive
   ├─ components/            # 跨 feature 共享的展示层组件
   │   ├─ layout/            # PageShell, SectionCard, Toolbar
   │   ├─ form/              # PathPicker, PatternInput, NumberStepper
   │   ├─ feedback/          # ProgressPanel, EmptyState, StatRow, StatusTag
   │   ├─ nav/               # Sidebar, TitleBar, NavIconButton
   │   └─ common/            # IconButton, ConfirmModal
   ├─ features/              # 业务模块，每个自治
   │   ├─ cleaner/
   │   │   ├─ index.tsx      # 模块入口页
   │   │   ├─ components/    # 仅此模块使用
   │   │   ├─ hooks/
   │   │   └─ types.ts
   │   ├─ sync/
   │   │   └─ ...
   │   └─ settings/
   │       └─ ...
   ├─ services/
   │   └─ bridge.ts          # 迁自 hooks/bridge.ts，集中封装 window.go.main.App.*
   ├─ hooks/                 # 通用 hooks：useWailsEvent, useDebouncedValue
   ├─ icons/                 # 自绘 SVG（仅在 antd-icons 没有时补充）
   │   └─ index.ts           # 命名导出：<FolderSyncIcon />, ...
   ├─ types/
   │   └─ index.ts           # 对齐 Go 结构体的 TS 类型
   └─ styles/
       ├─ index.css          # tailwind + 全局 CSS 变量（迁自老项目）
       └─ scrollbar.css      # 滚动条定制
```

**理由**：
- `components/` = 通用层，`features/` = 业务层，清晰二分；新同事看目录就知道去哪改。
- feature 内部自治（子组件/hooks/types 就近），不污染全局 `components/`。
- `services/bridge.ts` 作为 Go 层唯一入口，所有 `window.go.main.App.*` 调用都从这里走，不再直接裸调。

### D4：主题与 token 映射

**决定**：单一真源在 `styles/index.css` 的 CSS 变量。`app/theme.ts` 读取 CSS 变量并生成 Antd 的 `theme.token`；`document.body.setAttribute('theme-mode', 'dark'|'light')` 依然是切换开关。

```ts
// app/theme.ts（示意）
export const buildAntdTheme = (mode: 'dark' | 'light'): ThemeConfig => ({
  algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: '#00b96b',
    colorBgBase: mode === 'dark' ? '#181818' : '#efefef',
    colorBgContainer: mode === 'dark' ? '#222' : '#fff',
    colorBgElevated: mode === 'dark' ? '#2a2a2a' : '#fff',
    colorBorder: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.14)',
    borderRadius: 7,
    fontFamily: 'var(--font-family)',
    controlHeight: 32,
  },
  components: {
    Button: { controlHeight: 30, borderRadius: 7 },
    Input: { controlHeight: 30 },
    // ...
  },
})
```

这样 Antd 控件默认就对齐视觉；Tailwind 类（如 `bg-[var(--color-background-soft)]`）继续用 CSS 变量，主题切换零延迟。

### D5：图标策略

**决定**：
1. 首选 `@ant-design/icons`（~700 个图标，大部分业务场景够用）。
2. `@ant-design/icons` 里没有的，放 `src/icons/` 下做成命名 React 组件（内联 SVG，props 支持 `size` / `color` / `className`）。
3. 不再用 `lucide-react`（减少一份图标库依赖）；如果有 antd-icons 找不到但 lucide 有的少量图标，按规则 2 手绘迁过来。

**约束**：所有自绘 SVG 必须有统一接口（`IconProps { size?: number; color?: string; className?: string }`），默认 `currentColor` 以便跟随文字色。

### D6：状态与事件

**决定**：
- 继续 `useState` + `react-activation` 的 `KeepAlive` 做页面级状态保留，不引全局状态库。
- Wails 事件（`cleaner:progress`、`cleaner:completed`、`sync:progress`、`sync:completed` 等）统一走 `hooks/useWailsEvent(name, handler)`，内部 `EventsOn` + 卸载时 `EventsOff`。

### D7：切换与回滚

**决定**：
- `wails.json` 的 `frontend:install` / `frontend:build` / `frontend:dev:watcher` 三项路径从 `frontend` 改到 `frontend-antd`；`main.go` 中 `//go:embed frontend/dist` 改为 `frontend-antd/dist`。
- 老 `frontend/` 目录暂不动；回滚只需把上面两处改回来。
- 提供一次性迁移 checklist（在 tasks.md 中体现）。

## Risks / Trade-offs

- **[Antd 与 Tailwind 样式优先级冲突]** → Antd 的 CSS-in-JS 会在运行时注入；Tailwind v4 通过 `@layer` 控制优先级。约定：**控件默认样式交给 Antd，布局/间距才用 Tailwind**；不要用 Tailwind 覆盖 Antd 控件内部细节，遇到需要深度定制就走 `theme.token` 或 `className` + `:where()` 选择器。
- **[视觉走样]** → 改动完成后需要人工逐页面（Cleaner / Sync / Settings）比对老版本截图，特别关注：按钮高度与圆角、侧边栏宽度、空状态、进度条颜色、表格行高。把"视觉核对"列为 tasks.md 里显式一步。
- **[依赖体积增加]** → Antd + dayjs 会让首次打包体积显著增大（~300KB gzip）。桌面应用内嵌场景可以接受；必要时用 Antd 的 babel-plugin-import 或 tree-shaking 验证。
- **[react-activation 兼容性]** → 新工程继续使用 `react-activation@^0.13.4` 做 KeepAlive。Antd Modal/Drawer 的 Portal 与其无冲突（之前已在老项目验证），但需在迁移后快速冒烟。
- **[图标迁移成本]** → 老项目当前 lucide 使用点数量有限（预估 < 30 处），逐个搜索替换即可；缺口交给 `src/icons/` 自绘。
- **[构建配置]** → Vite 需要配 `alias: { '@': '/src' }` 和 `@tailwindcss/vite` 插件；Antd 5 在 Vite 下开箱即用，无需 babel-plugin。

## Migration Plan

1. **脚手架阶段**：`frontend-antd/` 初始化（`package.json`、Vite、TS、Tailwind、Antd、ConfigProvider、styles）——能跑空壳 App。
2. **共享层**：迁 TitleBar / Sidebar / Tooltip，建 layout/feedback/form/common 下的基础组件。
3. **Cleaner 迁移**：对照老页面逐块重写；完成后人工对比外观与事件行为。
4. **Sync 迁移**：同上。
5. **Settings 迁移**：同上。
6. **切换构建**：改 `wails.json` + `main.go` embed 路径；`wails dev` 本地冒烟；`wails build` 验证产物。
7. **发布后观察一个迭代**：若稳定，后续变更再删老 `frontend/`。

**回滚**：步骤 6 的两处路径改回，`wails build` 即退回老版本。老 `frontend/` 未被触碰。

## Open Questions

- 是否在新工程中改用 `pnpm` 保留原设定（CLAUDE.md 中已说明用 pnpm），还是允许 `npm`？→ **默认 pnpm**，与现状一致。
- 是否需要在 `wails.json` 里保留一个双构建产物的开关（同时生成 old / new，再用 Go flag 切入口）？→ 暂不，徒增复杂度；按 D7 的简单切换策略即可。
