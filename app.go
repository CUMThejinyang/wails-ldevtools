package main

import (
	"context"
	"devtools/internal/cleaner"
	"devtools/internal/codec"
	"devtools/internal/envreg"
	"devtools/internal/ftpserver"
	"devtools/internal/httpserver"
	"devtools/internal/netstat"
	"devtools/internal/procutil"
	"devtools/internal/syncer"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type PortViewerPrefs struct {
	PollInterval int      `json:"pollInterval"`
	Protocol     string   `json:"protocol"`
	Family       string   `json:"family"`
	States       []string `json:"states"`
}

// AppConfig 整个应用的配置
type AppConfig struct {
	Cleaner     cleaner.Settings     `json:"cleaner"`
	Sync        syncer.Config        `json:"sync"`
	Theme       string               `json:"theme"`
	LocalServer httpserver.Config    `json:"localServer"`
	FtpServer   ftpserver.Config     `json:"ftpServer"`
	SftpServer  ftpserver.SFTPConfig `json:"sftpServer"`
	PortViewer  PortViewerPrefs      `json:"portViewer"`
}

// App 应用结构体
type App struct {
	ctx        context.Context
	config     AppConfig
	configPath string
	cleanerSvc *cleaner.Service
	syncerSvc  *syncer.Service
	httpServer *httpserver.Service
	ftpServer  *ftpserver.Service
	sftpServer *ftpserver.SFTPService
	mu         sync.Mutex
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	configDir := filepath.Join(home, ".devtools")
	_ = os.MkdirAll(configDir, 0755)
	a.configPath = filepath.Join(configDir, "config.json")
	a.loadConfig()
	a.cleanerSvc = cleaner.NewService(ctx)
	a.syncerSvc = syncer.NewService(ctx)
	a.httpServer = httpserver.NewService(ctx)
	a.ftpServer = ftpserver.NewService(ctx)
	a.sftpServer = ftpserver.NewSFTPService(ctx)
}

func (a *App) shutdown(ctx context.Context) {
	if a.cleanerSvc != nil {
		a.cleanerSvc.Stop()
	}
	if a.syncerSvc != nil {
		a.syncerSvc.Stop()
	}
	if a.httpServer != nil {
		a.httpServer.StopWithTimeout(3 * time.Second)
	}
	if a.ftpServer != nil {
		a.ftpServer.Stop()
	}
	if a.sftpServer != nil {
		a.sftpServer.Stop()
	}
}

func (a *App) loadConfig() {
	data, err := os.ReadFile(a.configPath)
	if err != nil {
		a.config = defaultConfig()
		return
	}
	if err := json.Unmarshal(data, &a.config); err != nil {
		a.config = defaultConfig()
	}
}

func defaultConfig() AppConfig {
	return AppConfig{
		Theme: "dark",
		Cleaner: cleaner.Settings{
			Folders:     []cleaner.FolderConfig{},
			ThreadCount: 4,
		},
		Sync: syncer.Config{
			Conflict:  syncer.ConflictOverwrite,
			Recursive: true,
			Patterns:  []string{},
		},
		LocalServer: httpserver.Config{
			Port:      5800,
			IndexName: "index.html",
		},
		PortViewer: PortViewerPrefs{
			PollInterval: 0,
			Protocol:     "all",
			Family:       "all",
			States:       []string{},
		},
	}
}

func (a *App) saveConfig() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	data, err := json.MarshalIndent(a.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}

// ── 窗口控制 ──

func (a *App) WindowMinimise() {
	runtime.WindowMinimise(a.ctx)
}

func (a *App) WindowToggleMaximise() {
	runtime.WindowToggleMaximise(a.ctx)
}

func (a *App) WindowClose() {
	runtime.Quit(a.ctx)
}

func (a *App) WindowIsMaximised() bool {
	return runtime.WindowIsMaximised(a.ctx)
}

func (a *App) WindowSetAlwaysOnTop(on bool) {
	runtime.WindowSetAlwaysOnTop(a.ctx, on)
}

// ── 通用 ──

func (a *App) GetTheme() string { return a.config.Theme }

func (a *App) SetTheme(theme string) error {
	a.config.Theme = theme
	return a.saveConfig()
}

func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择文件夹"})
}

func (a *App) SelectFile(title string) (string, error) {
	if title == "" {
		title = "选择文件"
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: title})
}

func (a *App) SelectSaveFile(title string) (string, error) {
	if title == "" {
		title = "保存文件"
	}
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: title})
}

func (a *App) GetDirSize(path string) (int64, error) {
	return cleaner.GetDirSize(path)
}

func (a *App) HashText(text, algo string) (string, error) {
	return codec.HashText(text, algo)
}

func (a *App) HashFile(path, algo string) (string, error) {
	return codec.HashFile(path, algo)
}

// ── Cleaner ──

func (a *App) GetCleanerSettings() cleaner.Settings {
	return a.config.Cleaner
}

func (a *App) SaveCleanerSettings(settings cleaner.Settings) error {
	a.config.Cleaner = settings
	return a.saveConfig()
}

func (a *App) PreviewClean(settings cleaner.Settings) ([]cleaner.PreviewItem, error) {
	return cleaner.Preview(settings)
}

func (a *App) StartClean(settings cleaner.Settings) error {
	a.config.Cleaner = settings
	_ = a.saveConfig()

	onProgress := func(p cleaner.Progress) {
		runtime.EventsEmit(a.ctx, "cleaner:progress", p)
	}
	onCompleted := func(result cleaner.OverallResult) {
		runtime.EventsEmit(a.ctx, "cleaner:completed", result)
	}
	return a.cleanerSvc.Start(settings, onProgress, onCompleted)
}

func (a *App) StopClean() {
	a.cleanerSvc.Stop()
}

func (a *App) IsCleanRunning() bool {
	return a.cleanerSvc.IsRunning()
}

// ── Syncer ──

func (a *App) GetSyncConfig() syncer.Config {
	return a.config.Sync
}

func (a *App) SaveSyncConfig(config syncer.Config) error {
	a.config.Sync = config
	return a.saveConfig()
}

func (a *App) PreviewSync(config syncer.Config) ([]syncer.PreviewItem, error) {
	return syncer.Preview(config)
}

func (a *App) StartSync(config syncer.Config) error {
	a.config.Sync = config
	_ = a.saveConfig()

	onProgress := func(p syncer.Progress) {
		runtime.EventsEmit(a.ctx, "sync:progress", p)
	}
	onCompleted := func(r syncer.OverallResult) {
		runtime.EventsEmit(a.ctx, "sync:completed", r)
	}
	onConflict := func(req syncer.ConflictRequest) {
		runtime.EventsEmit(a.ctx, "sync:conflict", req)
	}
	return a.syncerSvc.Start(config, onProgress, onCompleted, onConflict)
}

func (a *App) StopSync() {
	a.syncerSvc.Stop()
}

func (a *App) IsSyncRunning() bool {
	return a.syncerSvc.IsRunning()
}

func (a *App) ResolveSyncConflict(decision string) {
	a.syncerSvc.ResolveConflict(decision)
}

// ── Env editor ──

func (a *App) ListEnv(scope string) ([]envreg.EnvEntry, error) {
	return envreg.ListEnv(scope)
}

func (a *App) GetEnv(scope, name string) (envreg.EnvEntry, error) {
	return envreg.GetEnv(scope, name)
}

func (a *App) SetEnv(scope, name, value, valueType string) envreg.BatchSaveResult {
	return envreg.SaveEnvBatch([]envreg.EnvChange{{
		Name:  name,
		Value: value,
		Type:  valueType,
		Scope: envreg.NormalizeScope(scope),
	}})
}

func (a *App) DeleteEnv(scope, name string) envreg.BatchSaveResult {
	return envreg.SaveEnvBatch([]envreg.EnvChange{{
		Name:   name,
		Scope:  envreg.NormalizeScope(scope),
		Delete: true,
	}})
}

func (a *App) SaveEnvBatch(changes []envreg.EnvChange) envreg.BatchSaveResult {
	return envreg.SaveEnvBatch(changes)
}

func (a *App) ParsePath(scope string) ([]envreg.PathSegment, error) {
	return envreg.ParsePath(scope)
}

func (a *App) ParseAllPathSegments() ([]envreg.PathSegment, error) {
	return envreg.CurrentPathSegments()
}

func (a *App) SavePath(segments []envreg.PathSegment) envreg.BatchSaveResult {
	return envreg.SavePathSegments(segments)
}

func (a *App) ValidatePath(paths []string) []envreg.PathValidation {
	return envreg.ValidatePath(paths)
}

func (a *App) Snapshot(note string) (envreg.BackupMeta, error) {
	return envreg.Snapshot(note)
}

func (a *App) ListBackups() ([]envreg.BackupMeta, error) {
	return envreg.ListBackups()
}

func (a *App) RestoreBackup(id string) envreg.BatchSaveResult {
	return envreg.RestoreBackup(id)
}

func (a *App) DeleteBackup(id string) envreg.OperationResult {
	return envreg.ResultFromError(envreg.DeleteBackup(id))
}

func (a *App) LoadBackup(id string) (envreg.BackupSnapshot, error) {
	return envreg.LoadBackup(id)
}

func (a *App) ExportEnvFile(scope, outPath string) envreg.OperationResult {
	return envreg.ResultFromError(envreg.ExportEnvFile(scope, outPath))
}

func (a *App) ImportEnvFilePreview(path, scope string) (envreg.ImportPreview, error) {
	return envreg.ImportEnvFile(path, scope)
}

func (a *App) ImportEnvFileCommit(preview envreg.ImportPreview) envreg.BatchSaveResult {
	return envreg.ImportEnvFileCommit(preview)
}

func (a *App) IsElevated() bool {
	return envreg.IsElevated()
}

func (a *App) BroadcastEnvChange() envreg.OperationResult {
	_ = envreg.BroadcastEnvChange()
	return envreg.OperationResult{Ok: true}
}

func (a *App) GetHighRiskVariables() []string {
	return envreg.HighRiskVariables()
}

// ── Local Server ──

func (a *App) StartServer(cfg httpserver.Config) error {
	if cfg.Port == 0 {
		cfg.Port = 5800
	}
	if cfg.IndexName == "" {
		cfg.IndexName = "index.html"
	}
	return a.httpServer.Start(cfg)
}

func (a *App) StopServer() error {
	return a.httpServer.Stop()
}

func (a *App) GetServerStatus() httpserver.ServerStatus {
	return a.httpServer.Status()
}

func (a *App) GetServerLogs(n int) []httpserver.LogEntry {
	return a.httpServer.GetLogs(n)
}

func (a *App) ListLanAddresses() []string {
	return httpserver.ListLanAddresses()
}

func (a *App) GetLocalServerConfig() httpserver.Config {
	cfg := a.config.LocalServer
	if cfg.Port == 0 {
		cfg.Port = 5800
	}
	if cfg.IndexName == "" {
		cfg.IndexName = "index.html"
	}
	return cfg
}

func (a *App) SaveLocalServerConfig(cfg httpserver.Config) error {
	if cfg.Port == 0 {
		cfg.Port = 5800
	}
	if cfg.IndexName == "" {
		cfg.IndexName = "index.html"
	}
	a.config.LocalServer = cfg
	return a.saveConfig()
}

func (a *App) ListServerFiles(subPath string) []httpserver.FileItem {
	items, err := a.httpServer.ListFiles(subPath)
	if err != nil {
		return []httpserver.FileItem{}
	}
	return items
}

// ── FTP Server ──

func (a *App) StartFTP(cfg ftpserver.Config) error {
	return a.ftpServer.Start(cfg)
}

func (a *App) StopFTP() error {
	return a.ftpServer.Stop()
}

func (a *App) GetFTPStatus() ftpserver.Status {
	return a.ftpServer.Status()
}

func (a *App) GetFTPLogs(n int) []ftpserver.LogEntry {
	return nil
}

func (a *App) GetFtpConfig() ftpserver.Config {
	return a.config.FtpServer
}

func (a *App) SaveFtpConfig(cfg ftpserver.Config) error {
	a.config.FtpServer = cfg
	return a.saveConfig()
}

// ── SFTP Server ──

func (a *App) StartSFTP(cfg ftpserver.SFTPConfig) error {
	return a.sftpServer.Start(cfg)
}

func (a *App) StopSFTP() error {
	return a.sftpServer.Stop()
}

func (a *App) GetSFTPStatus() ftpserver.SFTPStatus {
	return a.sftpServer.Status()
}

func (a *App) GetSftpConfig() ftpserver.SFTPConfig {
	return a.config.SftpServer
}

func (a *App) SaveSftpConfig(cfg ftpserver.SFTPConfig) error {
	a.config.SftpServer = cfg
	return a.saveConfig()
}

// ── Port Viewer ──

func (a *App) ListPorts() ([]procutil.PortEntryWithProc, error) {
	entries, err := netstat.ListPorts()
	if err != nil {
		return nil, err
	}
	return procutil.EnrichPorts(entries), nil
}

func (a *App) KillPortProcess(pid uint32) error {
	return procutil.KillProcess(pid)
}

func (a *App) KillPortProcesses(pids []uint32) error {
	return procutil.KillProcesses(pids)
}

func (a *App) IsPortElevated() bool {
	return procutil.IsElevated()
}

func (a *App) OpenInBrowser(url string) error {
	return procutil.OpenInBrowser(url)
}

func (a *App) GetPortViewerPrefs() PortViewerPrefs {
	return a.config.PortViewer
}

func (a *App) SavePortViewerPrefs(prefs PortViewerPrefs) error {
	a.config.PortViewer = prefs
	return a.saveConfig()
}
