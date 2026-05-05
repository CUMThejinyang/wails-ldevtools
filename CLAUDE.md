# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install frontend dependencies (uses pnpm)
cd frontend && pnpm install && cd ..

# Development mode with hot reload
wails dev

# Production build → build/bin/DevTools.exe (Windows)
wails build
```

## Architecture

This is a **Wails v2** desktop app (Go backend + React frontend, embedded via `embed.FS`).

**Go layer:**
- `main.go` — window config (frameless, 1280×800, dark bg); embeds `frontend/dist`
- `app.go` — all methods exposed to JS via Wails binding; handles config persistence at `~/.devtools/config.json`
- `internal/cleaner/` — worker-pool concurrent deletion engine; emits `cleaner:progress` and `cleaner:completed` Wails events
- `internal/syncer/` — file sync engine; emits `sync:progress`, `sync:completed`, `sync:conflict` Wails events
- `internal/codec/` — hash computation (MD5/SHA1/SHA256/SHA512) for text and files
- `internal/httpserver/` — HTTP file server with SPA/single-file mode, Basic Auth, ring buffer logging; emits `server:log`, `server:log_batch`, `server:status` Wails events
- `internal/netstat/` — Windows port enumeration via `GetExtendedTcpTable`/`GetExtendedUdpTable` (IPv4+IPv6); build-tag gated, non-Windows stubs return `ErrUnsupported`
- `internal/procutil/` — process info query (`QueryFullProcessImageNameW`), kill with UAC elevation (`ShellExecuteW runas`), browser open (`ShellExecute`); build-tag gated

**Frontend layer (`frontend/src/`):**
- `services/bridge.ts` — single file wrapping all `window.go.main.App.*` calls; use this for any Go↔JS interop
- `App.tsx` — root layout: TitleBar + Sidebar + page area with KeepAlive; pages are hidden via `display:none` (not unmounted)
- `app/theme.ts` — `buildAntdTheme(mode)` maps CSS variables to Antd tokens
- `features/` — business modules (cleaner, sync, codec, localserver, ports, settings), each self-contained
- `components/` — shared UI: layout (PageShell, SectionCard), form (PathPicker, PatternInput, NumberStepper), feedback (ProgressPanel, EmptyState, StatusTag), nav (TitleBar, Sidebar), common (IconButton, ConfirmModal)
- `hooks/useWailsEvent.ts` — `EventsOn` + cleanup wrapper
- `styles/index.css` — CSS variable system; theme driven by `body[theme-mode='dark|light']`
- `types/index.ts` — TS types mirroring Go structs; `PageId` union type gates routing in `App.tsx`

**Stack:** React 18, TypeScript, Vite, Ant Design 5, Tailwind CSS v4, @ant-design/icons, Monaco Editor, react-activation.

## Adding a new module

1. `internal/<module>/<module>.go` — Go logic
2. `app.go` — add methods on `*App`; Wails auto-binds them to `window.go.main.App`
3. `frontend/src/features/<module>/index.tsx` — React page
4. `frontend/src/components/nav/Sidebar.tsx` — add entry to `NAV_ITEMS`
5. `frontend/src/App.tsx` — add hidden page slot with `<KeepAlive id="<id>"><ModulePage /></KeepAlive>`
6. `frontend/src/types/index.ts` — extend `PageId` union

## UI conventions

- Primary accent: `#00b96b` (green), used only for active state and primary buttons
- Dark backgrounds: `#181818` / `#222222` / `#2a2a2a` (three depth levels)
- Borders: `0.5px solid rgba(255,255,255,0.1)`
- Sidebar: 50px wide, circular icon buttons (36×36px)
- Animations: only state feedback (spinner, progress bar, fade-in) — no decorative motion


# Superpowers-ZH 中文增强版

本项目已安装 superpowers-zh 技能框架（20 个 skills）。

## 核心规则

1. **收到任务时，先检查是否有匹配的 skill** — 哪怕只有 1% 的可能性也要检查
2. **设计先于编码** — 收到功能需求时，先用 brainstorming skill 做需求分析
3. **测试先于实现** — 写代码前先写测试（TDD）
4. **验证先于完成** — 声称完成前必须运行验证命令

## 可用 Skills

Skills 位于 `.claude/skills/` 目录，每个 skill 有独立的 `SKILL.md` 文件。

- **brainstorming**: 在任何创造性工作之前必须使用此技能——创建功能、构建组件、添加功能或修改行为。在实现之前先探索用户意图、需求和设计。
- **chinese-code-review**: 中文代码审查规范——在保持专业严谨的同时，用符合国内团队文化的方式给出有效反馈
- **chinese-commit-conventions**: 中文 Git 提交规范 — 适配国内团队的 commit message 规范和 changelog 自动化
- **chinese-documentation**: 中文技术文档写作规范——排版、术语、结构一步到位，告别机翻味
- **chinese-git-workflow**: 适配国内 Git 平台和团队习惯的工作流规范——Gitee、Coding、极狐 GitLab、CNB 全覆盖
- **dispatching-parallel-agents**: 当面对 2 个以上可以独立进行、无共享状态或顺序依赖的任务时使用
- **executing-plans**: 当你有一份书面实现计划需要在单独的会话中执行，并设有审查检查点时使用
- **finishing-a-development-branch**: 当实现完成、所有测试通过、需要决定如何集成工作时使用——通过提供合并、PR 或清理等结构化选项来引导开发工作的收尾
- **mcp-builder**: MCP 服务器构建方法论 — 系统化构建生产级 MCP 工具，让 AI 助手连接外部能力
- **receiving-code-review**: 收到代码审查反馈后、实施建议之前使用，尤其当反馈不明确或技术上有疑问时——需要技术严谨性和验证，而非敷衍附和或盲目执行
- **requesting-code-review**: 完成任务、实现重要功能或合并前使用，用于验证工作成果是否符合要求
- **subagent-driven-development**: 当在当前会话中执行包含独立任务的实现计划时使用
- **systematic-debugging**: 遇到任何 bug、测试失败或异常行为时使用，在提出修复方案之前执行
- **test-driven-development**: 在实现任何功能或修复 bug 时使用，在编写实现代码之前
- **using-git-worktrees**: 当需要开始与当前工作区隔离的功能开发或执行实现计划之前使用——创建具有智能目录选择和安全验证的隔离 git 工作树
- **using-superpowers**: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
- **verification-before-completion**: 在宣称工作完成、已修复或测试通过之前使用，在提交或创建 PR 之前——必须运行验证命令并确认输出后才能声称成功；始终用证据支撑断言
- **workflow-runner**: 在 Claude Code / OpenClaw / Cursor 中直接运行 agency-orchestrator YAML 工作流——无需 API key，使用当前会话的 LLM 作为执行引擎。当用户提供 .yaml 工作流文件或要求多角色协作完成任务时触发。
- **writing-plans**: 当你有规格说明或需求用于多步骤任务时使用，在动手写代码之前
- **writing-skills**: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用

## 如何使用

当任务匹配某个 skill 时，使用 `Skill` 工具加载对应 skill 并严格遵循其流程。绝不要用 Read 工具读取 SKILL.md 文件。

如果你认为哪怕只有 1% 的可能性某个 skill 适用于你正在做的事情，你必须调用该 skill 检查。
