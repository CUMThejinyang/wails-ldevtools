# Design: Add FTP/SFTP Service Tabs

## 1. Architecture Overview

### 1.1 Component Structure

```
LocalServerPage (index.tsx)
├── TabLayout (HTTP | FTP | SFTP)
├── [Tab: HTTP]
│   ├── ControlPanel (现有)
│   ├── AddressList (现有)
│   ├── FileExplorer (现有)
│   └── LogTable (现有)
├── [Tab: FTP]
│   ├── FTPConfigPanel (新)
│   └── FTPStatusPanel (新)
└── [Tab: SFTP]
    ├── SFTPConfigPanel (新)
    └── SFTPStatusPanel (新)
```

### 2. Go Backend Modules

#### 2.1 internal/ftpserver/ftpserver.go

**Config:**
```go
type FTPConfig struct {
  Root        string `json:"root"`
  Port        int    `json:"port"`
  BindLocal   bool   `json:"bindLocal"`
  AuthEnabled bool   `json:"authEnabled"`
  AuthUser    string `json:"authUser"`
  AuthPass    string `json:"authPass"`
  Allow匿名   bool   `json:"allowAnonymous"`
}
```

**Service Interface:**
```go
type FTPService struct {
  // Start(cfg FTPConfig) error
  // Stop() error
  // Status() FTPStatus
  // GetConnectionCount() int
}
```

#### 2.2 internal/sftpserver/sftpserver.go

**Config:**
```go
type SFTPConfig struct {
  Root        string `json:"root"`
  Port        int    `json:"port"`
  BindLocal   bool   `json:"bindLocal"`
  AuthUser    string `json:"authUser"`
  AuthPass    string `json:"authPass"`
}
```

### 3. Frontend Design

#### 3.1 Tab Layout

使用 Ant Design `Tabs` 组件，样式与现有代码风格保持一致：
- Tab 样式：`segmented` 或 `card` 类型
- 默认选中 HTTP（现有功能）
- 每个 Tab 内封装独立的服务管理界面

#### 3.2 FTP Tab Content

```
┌─ FTP 配置 ─────────────────────────────────────────┐
│  根目录: [______________] [浏览]                   │
│  端口:   [____5801_____]                          │
│  ☑ 本地绑定 (127.0.0.1)                           │
│  ☑ 启用认证                                       │
│     用户名: [__________]  密码: [__________]       │
│  ☐ 允许匿名访问 (需要 匿名用户 目录配置)           │
│                                                     │
│  [保存配置]                    [启动] [停止]       │
└────────────────────────────────────────────────────┘

┌─ FTP 状态 ───────────────────────────────────────┐
│  ● 运行中 | 已连接 2 个客户端 | 启动于 10:23:45   │
│                                                     │
│  访问地址:                                          │
│  ftp://127.0.0.1:5801                              │
│  ftp://192.168.1.100:5801  (局域网)               │
└────────────────────────────────────────────────────┘
```

#### 3.3 SFTP Tab Content

```
┌─ SFTP 配置 ──────────────────────────────────────┐
│  根目录: [______________] [浏览]                   │
│  端口:   [____5802_____]                          │
│  ☑ 本地绑定 (127.0.0.1)                           │
│                                                     │
│  用户名: [__________]  密码: [__________]         │
│                                                     │
│  [保存配置]                    [启动] [停止]       │
└────────────────────────────────────────────────────┘

┌─ SFTP 状态 ───────────────────────────────────────┐
│  ● 运行中 | 启动于 10:23:45                       │
│                                                     │
│  访问地址:                                          │
│  sftp://127.0.0.1:5802                             │
│  sftp://192.168.1.100:5802  (局域网)              │
└────────────────────────────────────────────────────┘
```

### 4. UI Design Specifications

#### 4.1 Color Palette

沿用现有变量：
- Primary: `#00b96b`
- Background: `#181818` / `#222222` / `#2a2a2a`
- Border: `rgba(255,255,255,0.1)`
- Text: `#ffffff` / `#8c8c8c` / `#595959`

#### 4.2 Layout

- Tab 区域：页面顶部，12px 间距
- 每个 Tab 内采用 SectionCard 分组
- FTP/SFTP 配置和状态可上下或左右布局

### 5. Wails Events

```
server:ftp_status     - FTP 服务状态变化
server:ftp_log        - FTP 连接日志
server:sftp_status    - SFTP 服务状态变化
server:sftp_log       - SFTP 连接日志
```

### 6. Data Flow

```
User Action (Frontend)
    │
    ▼
window.go.main.App.StartFTP(config)
    │
    ▼
app.go (Wails binding)
    │
    ▼
ftpserver.Service.Start()
    │
    ▼
runtime.EventsEmit("server:ftp_status", status)
    │
    ▼
Frontend useWailsEvent → Update UI
```

### 7. Dependencies

- Go: golang.org/x/crypto/ssh (SFTP)
- Go: github.com/jlaffaye/ftp (FTP server)
- Frontend: Ant Design Tabs

### 8. Non-Goals

- 不实现 FTPS / SFTP over TLS
- 不实现用户管理界面（只支持单用户或匿名）
- 不实现主动模式 FTP（仅被动模式）

### 9. Configuration Persistence

- FTP/SFTP 配置通过 `bridge.saveFtpConfig` / `bridge.saveSftpConfig` 保存
- 存储位置：`~/.devtools/config.json` 内嵌字段
- 密码明文存储（未来可考虑加密）