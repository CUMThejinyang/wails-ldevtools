// Package syncer 文件夹同步，支持覆盖/跳过/询问冲突策略。
package syncer

import (
	"context"
	"crypto/md5"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ── 数据结构 ──

type ConflictMode string

const (
	ConflictOverwrite ConflictMode = "overwrite"
	ConflictSkip      ConflictMode = "skip"
	ConflictAsk       ConflictMode = "ask"
)

type Config struct {
	Src         string       `json:"src"`
	Dst         string       `json:"dst"`
	Conflict    ConflictMode `json:"conflict"`
	Recursive   bool         `json:"recursive"`
	Patterns    []string     `json:"patterns"`
	ThreadCount int          `json:"threadCount"`
}

type FileStatus string

const (
	StatusNew       FileStatus = "new"
	StatusModified  FileStatus = "modified"
	StatusIdentical FileStatus = "identical"
	StatusSynced    FileStatus = "synced"
	StatusSyncing   FileStatus = "syncing"
	StatusSkipped   FileStatus = "skipped"
	StatusError     FileStatus = "error"
	StatusPending   FileStatus = "pending"
)

type PreviewItem struct {
	RelativePath string     `json:"relativePath"`
	SrcPath      string     `json:"srcPath"`
	DstPath      string     `json:"dstPath"`
	Size         int64      `json:"size"`
	Status       FileStatus `json:"status"`
	Error        string     `json:"error,omitempty"`
}

type Progress struct {
	RelativePath string     `json:"relativePath"`
	Status       FileStatus `json:"status"`
	BytesCopied  int64      `json:"bytesCopied"`
	TotalBytes   int64      `json:"totalBytes"`
	Error        string     `json:"error,omitempty"`
}

type OverallResult struct {
	Synced    int    `json:"synced"`
	Skipped   int    `json:"skipped"`
	Errors    int    `json:"errors"`
	TotalSize int64  `json:"totalSize"`
	Duration  string `json:"duration"`
	Cancelled bool   `json:"cancelled"`
}

type ConflictRequest struct {
	RelativePath string `json:"relativePath"`
	SrcPath      string `json:"srcPath"`
	DstPath      string `json:"dstPath"`
	SrcSize      int64  `json:"srcSize"`
	DstSize      int64  `json:"dstSize"`
}

// ── Service ──

type Service struct {
	parentCtx  context.Context
	cancel     context.CancelFunc
	running    atomic.Bool
	mu         sync.Mutex
	conflictCh chan string
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

// ResolveConflict 由前端调用，传入 "overwrite" 或 "skip"。
func (s *Service) ResolveConflict(decision string) {
	s.mu.Lock()
	ch := s.conflictCh
	s.mu.Unlock()
	if ch != nil {
		select {
		case ch <- decision:
		default:
		}
	}
}

func (s *Service) Start(
	config Config,
	onProgress func(Progress),
	onCompleted func(OverallResult),
	onConflict func(ConflictRequest),
) error {
	if s.running.Swap(true) {
		return fmt.Errorf("sync task is already running")
	}
	ctx, cancel := context.WithCancel(s.parentCtx)
	ch := make(chan string, 1)
	s.mu.Lock()
	s.cancel = cancel
	s.conflictCh = ch
	s.mu.Unlock()

	go func() {
		defer s.running.Store(false)
		defer cancel()
		result := run(ctx, config, onProgress, onConflict, ch)
		onCompleted(result)
	}()
	return nil
}

// ── 预览 ──

func Preview(config Config) ([]PreviewItem, error) {
	var items []PreviewItem
	err := walkSrc(config, func(rel, src string, info fs.FileInfo) error {
		dst := filepath.Join(config.Dst, rel)
		dstInfo, statErr := os.Stat(dst)
		if os.IsNotExist(statErr) {
			items = append(items, PreviewItem{
				RelativePath: rel, SrcPath: src, DstPath: dst,
				Size: info.Size(), Status: StatusNew,
			})
			return nil
		}
		if statErr != nil {
			return nil
		}
		if info.Size() == dstInfo.Size() {
			if same, _ := sameContent(src, dst); same {
				items = append(items, PreviewItem{
					RelativePath: rel, SrcPath: src, DstPath: dst,
					Size: info.Size(), Status: StatusIdentical,
				})
				return nil
			}
		}
		items = append(items, PreviewItem{
			RelativePath: rel, SrcPath: src, DstPath: dst,
			Size: info.Size(), Status: StatusModified,
		})
		return nil
	})
	return items, err
}

// ── 核心同步逻辑（worker pool） ──

type syncTask struct {
	rel  string
	src  string
	size int64
}

func run(
	ctx context.Context,
	config Config,
	onProgress func(Progress),
	onConflict func(ConflictRequest),
	conflictCh chan string,
) OverallResult {
	start := time.Now()

	threadCount := config.ThreadCount
	if threadCount <= 0 {
		threadCount = 4
	}
	if threadCount > 32 {
		threadCount = 32
	}

	// 第一阶段：扫描收集所有文件任务
	var tasks []syncTask
	_ = walkSrc(config, func(rel, src string, info fs.FileInfo) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		tasks = append(tasks, syncTask{rel: rel, src: src, size: info.Size()})
		return nil
	})

	if ctx.Err() != nil {
		return OverallResult{Cancelled: true, Duration: time.Since(start).Truncate(time.Millisecond).String()}
	}

	// 第二阶段：快速检查阶段——先标出内容相同的文件（不进 worker pool）
	// 同时在 worker pool 里并行做实际复制。
	taskCh := make(chan syncTask, threadCount*4)

	var (
		synced, skipped, identSkip, errors int
		totalSize                          int64
		countMu                            sync.Mutex
	)

	// Worker pool
	var wg sync.WaitGroup
	for i := 0; i < threadCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range taskCh {
				select {
				case <-ctx.Done():
					return
				default:
				}
				dst := filepath.Join(config.Dst, t.rel)

				// 确保目标父目录存在
				if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
					countMu.Lock()
					onProgress(Progress{RelativePath: t.rel, Status: StatusError, Error: err.Error()})
					errors++
					countMu.Unlock()
					continue
				}

				dstInfo, statErr := os.Stat(dst)
				dstExists := statErr == nil

				// 内容相同则跳过
				if dstExists && t.size == dstInfo.Size() {
					if same, _ := sameContent(t.src, dst); same {
						countMu.Lock()
						onProgress(Progress{RelativePath: t.rel, Status: StatusIdentical, TotalBytes: t.size})
						identSkip++
						skipped++
						countMu.Unlock()
						continue
					}
				}

				// 处理冲突
				if dstExists {
					switch config.Conflict {
					case ConflictSkip:
						countMu.Lock()
						onProgress(Progress{RelativePath: t.rel, Status: StatusSkipped, TotalBytes: t.size})
						skipped++
						countMu.Unlock()
						continue
					case ConflictAsk:
						onConflict(ConflictRequest{
							RelativePath: t.rel, SrcPath: t.src, DstPath: dst,
							SrcSize: t.size, DstSize: dstInfo.Size(),
						})
						select {
						case decision := <-conflictCh:
							if decision == "skip" {
								countMu.Lock()
								onProgress(Progress{RelativePath: t.rel, Status: StatusSkipped, TotalBytes: t.size})
								skipped++
								countMu.Unlock()
								continue
							}
						case <-ctx.Done():
							return
						}
					}
					// overwrite: fall through
				}

				// 开始复制
				onProgress(Progress{RelativePath: t.rel, Status: StatusSyncing, TotalBytes: t.size})
				if err := copyFile(ctx, t.src, dst, func(written int64) {
					onProgress(Progress{RelativePath: t.rel, Status: StatusSyncing, BytesCopied: written, TotalBytes: t.size})
				}); err != nil {
					if ctx.Err() != nil {
						return
					}
					countMu.Lock()
					onProgress(Progress{RelativePath: t.rel, Status: StatusError, Error: err.Error()})
					errors++
					countMu.Unlock()
					continue
				}

				countMu.Lock()
				onProgress(Progress{RelativePath: t.rel, Status: StatusSynced, BytesCopied: t.size, TotalBytes: t.size})
				synced++
				totalSize += t.size
				countMu.Unlock()
			}
		}()
	}

	// 发送任务
	for _, t := range tasks {
		select {
		case <-ctx.Done():
			break
		case taskCh <- t:
		}
	}
	close(taskCh)
	wg.Wait()

	return OverallResult{
		Synced:    synced,
		Skipped:   skipped,
		Errors:    errors,
		TotalSize: totalSize,
		Duration:  time.Since(start).Truncate(time.Millisecond).String(),
		Cancelled: ctx.Err() != nil,
	}
}

// ── 工具函数 ──

func walkSrc(config Config, fn func(rel, src string, info fs.FileInfo) error) error {
	return filepath.WalkDir(config.Src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if path == config.Src {
				return nil
			}
			if !config.Recursive {
				return filepath.SkipDir
			}
			return nil
		}

		rel, err := filepath.Rel(config.Src, path)
		if err != nil {
			return nil
		}

		// 文件模式过滤
		if len(config.Patterns) > 0 {
			matched := false
			for _, p := range config.Patterns {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				if ok, _ := filepath.Match(p, d.Name()); ok {
					matched = true
					break
				}
			}
			if !matched {
				return nil
			}
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		return fn(rel, path, info)
	})
}

func sameContent(a, b string) (bool, error) {
	ha, err := hashFile(a)
	if err != nil {
		return false, err
	}
	hb, err := hashFile(b)
	if err != nil {
		return false, err
	}
	return ha == hb, nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

func copyFile(ctx context.Context, src, dst string, onProgress func(int64)) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	// 先写临时文件，完成后原子 rename，避免写到一半留下损坏文件
	tmp := dst + ".synctmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}

	buf := make([]byte, 64*1024)
	var written int64
	for {
		select {
		case <-ctx.Done():
			out.Close()
			os.Remove(tmp)
			return ctx.Err()
		default:
		}
		nr, er := in.Read(buf)
		if nr > 0 {
			nw, ew := out.Write(buf[:nr])
			written += int64(nw)
			if ew != nil {
				out.Close()
				os.Remove(tmp)
				return ew
			}
			if onProgress != nil {
				onProgress(written)
			}
		}
		if er == io.EOF {
			break
		}
		if er != nil {
			out.Close()
			os.Remove(tmp)
			return er
		}
	}

	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}
