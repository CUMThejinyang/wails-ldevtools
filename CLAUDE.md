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
- `main.go` — window config (frameless, 1280×800, dark bg); embeds `frontend-antd/dist`
- `app.go` — all methods exposed to JS via Wails binding; handles config persistence at `~/.devtools/config.json`
- `internal/cleaner/cleaner.go` — worker-pool concurrent deletion engine; emits `cleaner:progress` and `cleaner:completed` Wails events

**Frontend layer (`frontend-antd/src/`):**
- `services/bridge.ts` — single file wrapping all `window.go.main.App.*` calls; use this for any Go↔JS interop
- `App.tsx` — root layout: TitleBar + Sidebar (52px icon rail) + page area with KeepAlive
- `main.tsx` — entry point with Antd ConfigProvider + theme + zhCN locale
- `app/theme.ts` — `buildAntdTheme(mode)` maps CSS variables to Antd tokens
- `features/` — business modules (cleaner, sync, settings), each self-contained
- `components/` — shared UI: layout (PageShell, SectionCard), form (PathPicker, PatternInput, NumberStepper), feedback (ProgressPanel, EmptyState, StatusTag), nav (TitleBar, Sidebar), common (IconButton, ConfirmModal)
- `hooks/useWailsEvent.ts` — `EventsOn` + cleanup wrapper
- `styles/index.css` — CSS variable system; theme driven by `body[theme-mode='dark|light']`
- `types/index.ts` — TS types mirroring Go structs; `PageId` union type gates routing in `App.tsx`

**Stack:** React 18, TypeScript, Vite, Ant Design 5, Tailwind CSS v4, @ant-design/icons, dayjs, react-activation.

**Legacy:** `frontend/` is the old version kept for reference. Active frontend is `frontend-antd/`.

## Adding a new module

1. `internal/<module>/<module>.go` — Go logic
2. `app.go` — add methods on `*App`; Wails auto-binds them to `window.go.main.App`
3. `frontend-antd/src/features/<module>/index.tsx` — React page
4. `frontend-antd/src/components/nav/Sidebar.tsx` — add entry to `NAV_ITEMS`
5. `frontend-antd/src/App.tsx` — add `{activePage === '<id>' && <KeepAlive id="<id>"><ModulePage /></KeepAlive>}`
6. `frontend-antd/src/types/index.ts` — extend `PageId` union

## UI conventions

- Primary accent: `#00b96b` (green), used only for active state and primary buttons
- Dark backgrounds: `#181818` / `#222222` / `#2a2a2a` (three depth levels)
- Borders: `0.5px solid rgba(255,255,255,0.1)`
- Sidebar: 50px wide, circular icon buttons (36×36px)
- Animations: only state feedback (spinner, progress bar, fade-in) — no decorative motion
