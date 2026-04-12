# DevTools - 程序员开发工具箱

> 基于 Wails v2 + React + Go 构建的桌面工具箱，Cherry Studio 风格 UI，支持扩展新功能模块。

---

## 功能列表

| 模块 | 状态 | 说明 |
|------|------|------|
| 📁 文件夹清理 | ✅ 已实现 | 多线程并发删除，支持 glob 匹配、递归、配置持久化 |
| 更多工具 | 🔜 可扩展 | 在 Sidebar + pages/ 中添加新模块即可 |

---

## 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Go | ≥ 1.21 | https://go.dev/dl |
| Node.js | ≥ 18 | https://nodejs.org |
| Wails CLI | v2.9+ | `go install github.com/wailsapp/wails/v2/cmd/wails@latest` |
| 平台依赖 | - | 见下方说明 |

### Linux 额外依赖

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  build-essential libssl-dev libxdo-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

### macOS 额外依赖

```bash
xcode-select --install
```

---

## 快速开始

```bash
# 1. 克隆 / 进入项目
cd devtools

# 2. 安装前端依赖
cd frontend && npm install && cd ..

# 3. 开发模式（热重载）
wails dev

# 4. 生产构建
wails build
# 输出：build/bin/DevTools（Linux/macOS）或 DevTools.exe（Windows）
```

---

## 项目结构

```
devtools/
├── main.go                      # Wails 入口，窗口配置
├── app.go                       # 暴露给前端的所有 Go 方法
├── go.mod
├── wails.json
│
├── internal/
│   └── cleaner/
│       └── cleaner.go           # 多线程清理核心逻辑（worker pool）
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx             # React 入口
        ├── App.tsx              # 根布局（Sidebar + Navbar + 页面区）
        ├── styles/
        │   └── index.css        # Cherry Studio 风格 CSS 变量系统
        ├── types/
        │   └── index.ts         # 与 Go 对应的 TypeScript 类型
        ├── hooks/
        │   └── bridge.ts        # 封装所有 Go ↔ JS 调用
        ├── components/
        │   └── Sidebar.tsx      # 左侧图标导航栏
        └── pages/
            └── Cleaner/
                └── index.tsx    # 文件夹清理页面
```

---

## 文件夹清理功能说明

### 核心特性

- **多线程并发删除**：Worker Pool 模式，可配置 1~16 个线程
- **多文件夹管理**：添加任意数量文件夹，独立开关控制
- **Glob 文件匹配**：支持 `*.log`、`*.tmp`、`temp_*` 等模式，空=删除全部文件
- **递归/非递归**：可选是否进入子目录
- **删除空目录**：文件删除后可选清理空文件夹
- **实时进度**：通过 Wails 事件推送，逐文件显示进度条
- **随时取消**：Stop 按钮立即发送 cancel 信号，已发出的任务继续完成
- **配置持久化**：保存至 `~/.devtools/config.json`

### 线程模型

```
扫描 Goroutine × N（每个文件夹一个）
         │
         ▼  filepath.WalkDir
    taskChannel（带缓冲）
         │
         ▼
Worker Goroutine × ThreadCount
    os.Remove(file)
         │
         ▼
进度回调 → Wails EventsEmit → 前端更新 UI
```

---

## 扩展新功能模块

### 1. 添加 Go 后端逻辑

```
internal/
└── mymodule/
    └── mymodule.go   # 新功能的 Go 实现
```

### 2. 在 app.go 中暴露方法

```go
// 在 App struct 上添加新方法，Wails 会自动绑定到前端
func (a *App) MyNewFeature(param string) (string, error) {
    return mymodule.DoSomething(param)
}
```

### 3. 添加前端页面

```
frontend/src/pages/
└── MyModule/
    └── index.tsx
```

### 4. 注册到 Sidebar

```tsx
// frontend/src/components/Sidebar.tsx
const NAV_ITEMS = [
  { id: 'cleaner', icon: <Trash2 size={18} />, label: '文件夹清理' },
  { id: 'mymodule', icon: <Code size={18} />, label: '我的新工具' }, // 新增
]
```

### 5. 挂载路由

```tsx
// frontend/src/App.tsx
{activePage === 'cleaner'  && <CleanerPage />}
{activePage === 'mymodule' && <MyModulePage />}  // 新增
```

同时在 `types/index.ts` 的 `PageId` 中加入新 ID：

```ts
export type PageId = 'cleaner' | 'mymodule'
```

---

## 配置文件位置

| 系统 | 路径 |
|------|------|
| macOS / Linux | `~/.devtools/config.json` |
| Windows | `C:\Users\<用户名>\.devtools\config.json` |

---

## UI 设计规范（Cherry Studio 风格）

- **主色调**：`#00b96b`（绿色），仅用于激活态和主按钮
- **暗色背景**：`#181818` / `#222222` / `#2a2a2a` 三层深度
- **边框**：`0.5px solid rgba(255,255,255,0.1)` 极细极淡
- **侧边栏**：50px 宽，圆形图标按钮（36×36px）
- **主题切换**：通过 `body[theme-mode='dark/light']` CSS 属性选择器驱动，`0.25s` 过渡
- **动画**：仅状态反馈（旋转加载、进度条、淡入），不做纯装饰动画
