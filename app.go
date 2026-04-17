package main

import (
	"context"
	"devtools/internal/cleaner"
	"devtools/internal/codec"

	"devtools/internal/syncer"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// AppConfig 整个应用的配置
type AppConfig struct {
	Cleaner cleaner.Settings `json:"cleaner"`
	Sync    syncer.Config    `json:"sync"`
	Theme   string           `json:"theme"`
}

// App 应用结构体
type App struct {
	ctx        context.Context
	config     AppConfig
	configPath string
	cleanerSvc *cleaner.Service
	syncerSvc  *syncer.Service
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
}

func (a *App) shutdown(ctx context.Context) {
	if a.cleanerSvc != nil {
		a.cleanerSvc.Stop()
	}
	if a.syncerSvc != nil {
		a.syncerSvc.Stop()
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
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择文件夹",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
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

func (a *App) GetDirSize(path string) (int64, error) {
	return cleaner.GetDirSize(path)
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
