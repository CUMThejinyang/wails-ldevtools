# Add FTP/SFTP Service Tabs to Local Server Module

## Summary

在本地服务模块现有 HTTP 服务基础上，新增 FTP 和 SFTP 两个 Tab 页，支持一键启动文件传输服务。

## Problem Statement

当前本地服务模块仅支持 HTTP 服务，用户需要共享文件时缺乏 FTP/SFTP 支持。添加 FTP/SFTP 服务可以满足：
- 跨平台文件传输需求
- 匿名或认证访问场景
- 与现有 HTTP 服务统一管理

## Proposed Solution

在本地服务页面增加三个 Tab：
1. **HTTP 服务** — 现有功能，保持不变
2. **FTP 服务** — 支持匿名访问、用户认证、端口配置
3. **SFTP 服务** — 基于 SSH 的安全文件传输，支持用户认证

### 新增功能点

| 功能 | FTP | SFTP |
|------|-----|------|
| 端口配置 | ✅ | ✅ |
| 根目录选择 | ✅ | ✅ |
| 用户认证 | ✅ (可选) | ✅ |
| 匿名访问 | ✅ | ❌ |
| 启动/停止控制 | ✅ | ✅ |
| 状态显示 | ✅ | ✅ |
| 访问地址展示 | ✅ | ✅ |

### UI 结构

```
┌─────────────────────────────────────────────────────┐
│  [HTTP] [FTP] [SFTP]  ← Tab 切换                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  (各 Tab 内容根据选择的服务类型显示对应配置项)        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Impact

- Frontend: 新增 FTP/SFTP 配置 UI，修改 Tab 布局
- Backend: 新增 `internal/ftpserver/` 和 `internal/sftpserver/` 模块
- 无破坏性变更，现有 HTTP 服务不受影响

## Status

- [ ] Approved
- [ ] Designed
- [ ] Implemented