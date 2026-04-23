# Tasks: Add FTP/SFTP Service Tabs

## Phase 1: Backend - FTP Server

- [x] **T1.1** 创建 `internal/ftpserver/ftpserver.go`
- [x] **T1.2** 创建 `internal/ftpserver/ftp.go`
- [x] **T1.3** 创建 `internal/ftpserver/sftp.go`
- [x] **T1.4** 在 `app.go` 添加 FTP/SFTP 绑定方法
- [x] **T1.5** 添加配置持久化 (已嵌入 T1.4)

## Phase 2: Frontend - Types & Bridge

- [x] **T2.1** 更新 `frontend/src/types/index.ts`
- [x] **T2.2** 更新 `frontend/src/services/bridge.ts`

## Phase 3: Frontend - FTP/SFTP UI

- [x] **T3.1** 创建 `FTPConfigPanel.tsx`
- [x] **T3.2** 创建 `SFTPConfigPanel.tsx`
- [x] **T3.3** 更新 `index.tsx` Tabs 布局
- [x] **T3.4** 状态展示组件（已嵌入面板内）

## Phase 4: Integration

- [x] **T4.1** 添加 Wails 事件监听
- [x] **T4.2** 编译验证通过（`wails build` 成功）

## Dependencies

- T1.1 → T1.4（顺序）
- T2.1 → T2.2（顺序）
- T2.2 → T3.1, T3.2（T2 完成后再做 UI）
- T3.1, T3.2 → T3.3（组件完成后做整合）
- T1.4, T3.3 → T4.1

## Estimation

- Backend FTP: ~4 hours
- Backend SFTP: ~4 hours
- Frontend: ~6 hours
- Integration & Testing: ~2 hours
- **Total: ~16 hours**