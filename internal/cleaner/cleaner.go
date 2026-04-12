// Package cleaner 多线程文件夹清理，worker pool 模式。
package cleaner

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// ── 数据结构 ──

type FolderConfig struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Path            string   `json:"path"`
	Patterns        []string `json:"patterns"`
	Recursive       bool     `json:"recursive"`
	DeleteEmptyDirs bool     `json:"deleteEmptyDirs"`
	DeleteFolder    bool     `json:"deleteFolder"` // 清理完成后删除文件夹本身
	Enabled         bool     `json:"enabled"`
}

func NewFolderConfig(path string) FolderConfig {
	return FolderConfig{
		ID:              uuid.New().String(),
		Name:            filepath.Base(path),
		Path:            path,
		Patterns:        []string{},
		Recursive:       true,
		DeleteEmptyDirs: true,
		DeleteFolder:    true, // 默认删除文件夹本身
		Enabled:         true,
	}
}

type Settings struct {
	Folders     []FolderConfig `json:"folders"`
	ThreadCount int            `json:"threadCount"`
}

type Progress struct {
	FolderID     string `json:"folderId"`
	FolderName   string `json:"folderName"`
	CurrentFile  string `json:"currentFile"`
	DeletedFiles int64  `json:"deletedFiles"`
	DeletedSize  int64  `json:"deletedSize"`
	TotalFiles   int64  `json:"totalFiles"`
	Status       string `json:"status"` // scanning|deleting|done|error|cancelled
	Error        string `json:"error,omitempty"`
}

type FolderResult struct {
	FolderID     string `json:"folderId"`
	FolderName   string `json:"folderName"`
	Path         string `json:"path"`
	DeletedFiles int64  `json:"deletedFiles"`
	DeletedSize  int64  `json:"deletedSize"`
	Error        string `json:"error,omitempty"`
	Duration     string `json:"duration"`
}

type OverallResult struct {
	Results      []FolderResult `json:"results"`
	TotalDeleted int64          `json:"totalDeleted"`
	TotalSize    int64          `json:"totalSize"`
	Duration     string         `json:"duration"`
	Cancelled    bool           `json:"cancelled"`
}

type PreviewItem struct {
	FolderID   string `json:"folderId"`
	FolderName string `json:"folderName"`
	FilePath   string `json:"filePath"`
	Size       int64  `json:"size"`
	IsDir      bool   `json:"isDir"`
}

type deleteTask struct {
	folderID   string
	folderName string
	filePath   string
	size       int64
}

// ── Service ──

type Service struct {
	parentCtx context.Context
	cancel    context.CancelFunc
	running   atomic.Bool
	mu        sync.Mutex
}

func NewService(ctx context.Context) *Service {
	return &Service{parentCtx: ctx}
}

func (s *Service) IsRunning() bool { return s.running.Load() }

func (s *Service) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
}

func (s *Service) Start(
	settings Settings,
	onProgress func(Progress),
	onCompleted func(OverallResult),
) error {
	if s.running.Swap(true) {
		return fmt.Errorf("clean task is already running")
	}
	ctx, cancel := context.WithCancel(s.parentCtx)
	s.mu.Lock()
	s.cancel = cancel
	s.mu.Unlock()

	go func() {
		defer s.running.Store(false)
		defer cancel()
		result := run(ctx, settings, onProgress)
		onCompleted(result)
	}()
	return nil
}

// ── 核心清理逻辑 ──

func run(ctx context.Context, settings Settings, onProgress func(Progress)) OverallResult {
	start := time.Now()

	var enabledFolders []FolderConfig
	for _, f := range settings.Folders {
		if f.Enabled && f.Path != "" {
			enabledFolders = append(enabledFolders, f)
		}
	}

	threadCount := settings.ThreadCount
	if threadCount <= 0 {
		threadCount = 4
	}
	if threadCount > 32 {
		threadCount = 32
	}

	taskCh := make(chan deleteTask, threadCount*4)

	type folderCounter struct {
		deletedFiles atomic.Int64
		deletedSize  atomic.Int64
		totalFiles   atomic.Int64
		errMsg       string
		mu           sync.Mutex
	}
	counters := make(map[string]*folderCounter, len(enabledFolders))
	for _, f := range enabledFolders {
		counters[f.ID] = &folderCounter{}
	}

	// Worker pool
	var workerWg sync.WaitGroup
	for i := 0; i < threadCount; i++ {
		workerWg.Add(1)
		go func() {
			defer workerWg.Done()
			for {
				select {
				case <-ctx.Done():
					for range taskCh {
					}
					return
				case task, ok := <-taskCh:
					if !ok {
						return
					}
					counter := counters[task.folderID]
					err := os.Remove(task.filePath)
					if err != nil && !os.IsNotExist(err) {
						counter.mu.Lock()
						counter.errMsg = err.Error()
						counter.mu.Unlock()
					} else {
						counter.deletedFiles.Add(1)
						counter.deletedSize.Add(task.size)
					}
					onProgress(Progress{
						FolderID:     task.folderID,
						FolderName:   task.folderName,
						CurrentFile:  task.filePath,
						DeletedFiles: counter.deletedFiles.Load(),
						DeletedSize:  counter.deletedSize.Load(),
						TotalFiles:   counter.totalFiles.Load(),
						Status:       "deleting",
					})
				}
			}
		}()
	}

	// 扫描阶段
	var scanWg sync.WaitGroup
	for _, folder := range enabledFolders {
		f := folder
		counter := counters[f.ID]
		scanWg.Add(1)
		go func() {
			defer scanWg.Done()
			onProgress(Progress{FolderID: f.ID, FolderName: f.Name, Status: "scanning"})

			if f.Recursive {
				_ = filepath.WalkDir(f.Path, func(path string, d fs.DirEntry, err error) error {
					select {
					case <-ctx.Done():
						return filepath.SkipAll
					default:
					}
					if err != nil || path == f.Path || d.IsDir() {
						return nil
					}
					if !matchPatterns(d.Name(), f.Patterns) {
						return nil
					}
					info, _ := d.Info()
					size := int64(0)
					if info != nil {
						size = info.Size()
					}
					counter.totalFiles.Add(1)
					select {
					case <-ctx.Done():
						return filepath.SkipAll
					case taskCh <- deleteTask{f.ID, f.Name, path, size}:
					}
					return nil
				})
			} else {
				entries, err := os.ReadDir(f.Path)
				if err != nil {
					counter.mu.Lock()
					counter.errMsg = err.Error()
					counter.mu.Unlock()
					return
				}
				for _, entry := range entries {
					if entry.IsDir() {
						continue
					}
					if !matchPatterns(entry.Name(), f.Patterns) {
						continue
					}
					info, _ := entry.Info()
					size := int64(0)
					if info != nil {
						size = info.Size()
					}
					counter.totalFiles.Add(1)
					select {
					case <-ctx.Done():
						return
					case taskCh <- deleteTask{f.ID, f.Name, filepath.Join(f.Path, entry.Name()), size}:
					}
				}
			}
		}()
	}

	scanWg.Wait()
	close(taskCh)
	workerWg.Wait()

	cancelled := ctx.Err() != nil

	// 删除空目录 + 删除文件夹本身（串行，等 worker 完成后）
	for _, f := range enabledFolders {
		if cancelled {
			break
		}
		if f.DeleteEmptyDirs || f.DeleteFolder {
			_ = removeEmptyDirs(f.Path)
		}
		if f.DeleteFolder && ctx.Err() == nil {
			// 尝试删除文件夹本身（只有为空时才能删除）
			_ = os.Remove(f.Path)
		}
	}

	// 汇总
	var results []FolderResult
	var totalDeleted, totalSize int64

	for _, f := range enabledFolders {
		counter := counters[f.ID]
		counter.mu.Lock()
		errMsg := counter.errMsg
		counter.mu.Unlock()

		status := "done"
		if cancelled {
			status = "cancelled"
		}

		df := counter.deletedFiles.Load()
		ds := counter.deletedSize.Load()
		totalDeleted += df
		totalSize += ds

		results = append(results, FolderResult{
			FolderID:     f.ID,
			FolderName:   f.Name,
			Path:         f.Path,
			DeletedFiles: df,
			DeletedSize:  ds,
			Error:        errMsg,
			Duration:     time.Since(start).Truncate(time.Millisecond).String(),
		})

		onProgress(Progress{
			FolderID:     f.ID,
			FolderName:   f.Name,
			DeletedFiles: df,
			DeletedSize:  ds,
			TotalFiles:   counter.totalFiles.Load(),
			Status:       status,
			Error:        errMsg,
		})
	}

	return OverallResult{
		Results:      results,
		TotalDeleted: totalDeleted,
		TotalSize:    totalSize,
		Duration:     time.Since(start).Truncate(time.Millisecond).String(),
		Cancelled:    cancelled,
	}
}

func matchPatterns(name string, patterns []string) bool {
	if len(patterns) == 0 {
		return true
	}
	for _, pattern := range patterns {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		matched, err := filepath.Match(pattern, name)
		if err == nil && matched {
			return true
		}
	}
	return false
}

func removeEmptyDirs(root string) error {
	// 自底向上删除空目录
	var dirs []string
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() && path != root {
			dirs = append(dirs, path)
		}
		return nil
	})
	// 反序删除（叶子节点先删）
	for i := len(dirs) - 1; i >= 0; i-- {
		entries, err := os.ReadDir(dirs[i])
		if err == nil && len(entries) == 0 {
			_ = os.Remove(dirs[i])
		}
	}
	return nil
}

func Preview(settings Settings) ([]PreviewItem, error) {
	var items []PreviewItem
	var mu sync.Mutex
	for _, f := range settings.Folders {
		if !f.Enabled || f.Path == "" {
			continue
		}
		_ = filepath.WalkDir(f.Path, func(path string, d fs.DirEntry, err error) error {
			if err != nil || path == f.Path || d.IsDir() {
				return nil
			}
			if !f.Recursive {
				rel, _ := filepath.Rel(f.Path, filepath.Dir(path))
				if rel != "." {
					return filepath.SkipDir
				}
			}
			if !matchPatterns(d.Name(), f.Patterns) {
				return nil
			}
			info, _ := d.Info()
			size := int64(0)
			if info != nil {
				size = info.Size()
			}
			mu.Lock()
			items = append(items, PreviewItem{
				FolderID: f.ID, FolderName: f.Name, FilePath: path, Size: size,
			})
			mu.Unlock()
			return nil
		})
	}
	return items, nil
}

func GetDirSize(path string) (int64, error) {
	var size int64
	err := filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, e := d.Info()
		if e == nil {
			size += info.Size()
		}
		return nil
	})
	return size, err
}
