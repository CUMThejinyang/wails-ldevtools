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
- `main.go` — window config (frameless, 1280×800, dark bg)
- `app.go` — all methods exposed to JS via Wails binding; handles config persistence at `~/.devtools/config.json`
- `internal/cleaner/cleaner.go` — worker-pool concurrent deletion engine; emits `cleaner:progress` and `cleaner:completed` Wails events

**Frontend layer (`frontend/src/`):**
- `hooks/bridge.ts` — single file wrapping all `window.go.main.App.*` calls; use this for any Go↔JS interop
- `App.tsx` — root layout: Sidebar (50px icon rail) + Navbar + page area
- `pages/Cleaner/` — only current module
- `styles/index.css` — CSS variable system; theme driven by `body[theme-mode='dark|light']`
- `types/index.ts` — TS types mirroring Go structs; `PageId` union type gates routing in `App.tsx`

**Stack:** React 18, TypeScript, Vite, Tailwind CSS v4, Radix UI tooltips, lucide-react icons.

## Adding a new module

1. `internal/<module>/<module>.go` — Go logic
2. `app.go` — add methods on `*App`; Wails auto-binds them to `window.go.main.App`
3. `frontend/src/pages/<Module>/index.tsx` — React page
4. `frontend/src/components/Sidebar.tsx` — add entry to `NAV_ITEMS`
5. `frontend/src/App.tsx` — add `{activePage === '<id>' && <ModulePage />}`
6. `frontend/src/types/index.ts` — extend `PageId` union

## UI conventions

- Primary accent: `#00b96b` (green), used only for active state and primary buttons
- Dark backgrounds: `#181818` / `#222222` / `#2a2a2a` (three depth levels)
- Borders: `0.5px solid rgba(255,255,255,0.1)`
- Sidebar: 50px wide, circular icon buttons (36×36px)
- Animations: only state feedback (spinner, progress bar, fade-in) — no decorative motion
