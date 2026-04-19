package httpserver

import (
	"archive/zip"
	"context"
	"crypto/subtle"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Config 前端传入的启动配置
type Config struct {
	Root        string `json:"root"`
	Port        int    `json:"port"`
	BindLocal   bool   `json:"bindLocal"`
	SpaMode     bool   `json:"spaMode"`
	SingleFile  bool   `json:"singleFile"`
	IndexName   string `json:"indexName"`
	AuthEnabled bool   `json:"authEnabled"`
	AuthUser    string `json:"authUser"`
	AuthPass    string `json:"authPass"`
}

// LogEntry 一条请求日志
type LogEntry struct {
	Time       string `json:"time"`
	RemoteAddr string `json:"remoteAddr"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	Status     int    `json:"status"`
	Bytes      int64  `json:"bytes"`
	DurationMs int64  `json:"durationMs"`
	UserAgent  string `json:"userAgent"`
}

// Stats 累计统计
type Stats struct {
	TotalRequests int64 `json:"totalRequests"`
	TotalBytes    int64 `json:"totalBytes"`
}

// FileItem 文件列表条目
type FileItem struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	IsDir   bool   `json:"isDir"`
	ModTime string `json:"modTime"`
}

// ServerStatus 服务状态
type ServerStatus struct {
	Running     bool     `json:"running"`
	Root        string   `json:"root"`
	Port        int      `json:"port"`
	BindLocal   bool     `json:"bindLocal"`
	Mode        string   `json:"mode"`
	AuthEnabled bool     `json:"authEnabled"`
	StartedAt   string   `json:"startedAt"`
	Stats       Stats    `json:"stats"`
	Urls        []string `json:"urls"`
}

// Service HTTP 服务单例
type Service struct {
	ctx       context.Context
	server    *http.Server
	cfg       Config
	logs      *RingBuffer
	mu        sync.Mutex
	running   atomic.Bool
	startedAt time.Time
	stats     Stats

	// 事件节流
	pendingLogs []LogEntry
	lastEmit    time.Time
	emitMu      sync.Mutex
}

func NewService(ctx context.Context) *Service {
	return &Service{
		ctx:  ctx,
		logs: NewRingBuffer(200),
	}
}

func (s *Service) IsRunning() bool {
	return s.running.Load()
}

func (s *Service) Status() ServerStatus {
	if !s.running.Load() {
		return ServerStatus{Running: false}
	}

	s.mu.Lock()
	cfg := s.cfg
	stats := s.stats
	startedAt := s.startedAt
	s.mu.Unlock()

	mode := "目录模式"
	if cfg.SpaMode {
		mode = "SPA 模式"
	} else if cfg.SingleFile {
		mode = "单文件模式"
	}

	urls := []string{fmt.Sprintf("http://127.0.0.1:%d", cfg.Port)}
	if !cfg.BindLocal {
		for _, ip := range ListLanAddresses() {
			urls = append(urls, fmt.Sprintf("http://%s:%d", ip, cfg.Port))
		}
	}

	return ServerStatus{
		Running:     true,
		Root:        cfg.Root,
		Port:        cfg.Port,
		BindLocal:   cfg.BindLocal,
		Mode:        mode,
		AuthEnabled: cfg.AuthEnabled,
		StartedAt:   startedAt.Format(time.RFC3339),
		Stats:       stats,
		Urls:        urls,
	}
}

func (s *Service) GetLogs(n int) []LogEntry {
	return s.logs.Snapshot(n)
}

// ListFiles 列出根目录下文件（供前端 FileExplorer 使用）
func (s *Service) ListFiles(subPath string) ([]FileItem, error) {
	s.mu.Lock()
	root := s.cfg.Root
	singleFile := s.cfg.SingleFile
	s.mu.Unlock()

	if root == "" {
		return nil, fmt.Errorf("服务未配置根目录")
	}

	target := root
	if subPath != "" && !singleFile {
		target = safeJoin(root, subPath)
	}

	if !withinRoot(target, root) {
		return nil, fmt.Errorf("路径越界")
	}

	if singleFile {
		info, err := os.Stat(root)
		if err != nil {
			return nil, err
		}
		return []FileItem{{
			Name:    info.Name(),
			Path:    info.Name(),
			Size:    info.Size(),
			IsDir:   false,
			ModTime: info.ModTime().Format(time.RFC3339),
		}}, nil
	}

	entries, err := os.ReadDir(target)
	if err != nil {
		return nil, err
	}

	items := make([]FileItem, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		relPath := filepath.Join(subPath, e.Name())
		items = append(items, FileItem{
			Name:    e.Name(),
			Path:    filepath.ToSlash(relPath),
			Size:    info.Size(),
			IsDir:   e.IsDir(),
			ModTime: info.ModTime().Format(time.RFC3339),
		})
	}
	return items, nil
}

// Start 启动服务
func (s *Service) Start(cfg Config) error {
	if s.running.Load() {
		return fmt.Errorf("服务已在运行")
	}

	if cfg.Root == "" {
		return fmt.Errorf("请选择根目录")
	}
	info, err := os.Stat(cfg.Root)
	if err != nil {
		return fmt.Errorf("根目录不存在")
	}
	if cfg.SingleFile {
		if info.IsDir() {
			return fmt.Errorf("单文件模式要求根路径为文件")
		}
	} else {
		if !info.IsDir() {
			return fmt.Errorf("目录模式要求根路径为目录")
		}
	}
	if cfg.Port < 1024 || cfg.Port > 65535 {
		return fmt.Errorf("端口超出范围（1024-65535）")
	}
	if cfg.AuthEnabled {
		if strings.TrimSpace(cfg.AuthUser) == "" || strings.TrimSpace(cfg.AuthPass) == "" {
			return fmt.Errorf("认证用户名/密码不能为空")
		}
	}

	addr := fmt.Sprintf("0.0.0.0:%d", cfg.Port)
	if cfg.BindLocal {
		addr = fmt.Sprintf("127.0.0.1:%d", cfg.Port)
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		if strings.Contains(err.Error(), "address already in use") || strings.Contains(err.Error(), "Only one usage of each socket address") {
			return fmt.Errorf("端口 %d 已被占用，请更换或检查占用进程", cfg.Port)
		}
		return fmt.Errorf("端口 %d 已被占用，请更换或检查占用进程", cfg.Port)
	}

	if cfg.IndexName == "" {
		cfg.IndexName = "index.html"
	}

	s.mu.Lock()
	s.cfg = cfg
	s.stats = Stats{}
	s.mu.Unlock()

	mux := http.NewServeMux()
	mux.HandleFunc("/__devtools_api/download", s.batchDownloadHandler)

	var fileHandler http.Handler
	if cfg.SingleFile {
		fileHandler = singleFileHandler(cfg.Root)
	} else if cfg.SpaMode {
		fileHandler = spaFileServerHandler(cfg.Root, cfg.IndexName)
	} else {
		fileHandler = customFileServerHandler(cfg.Root)
	}
	mux.Handle("/", fileHandler)

	handler := http.Handler(mux)
	handler = loggingMiddleware(s.onLogEntry, handler)
	if cfg.AuthEnabled {
		handler = authMiddleware(cfg.AuthUser, cfg.AuthPass, handler)
	}

	s.server = &http.Server{Handler: handler}
	s.running.Store(true)
	s.startedAt = time.Now()
	s.lastEmit = time.Now()

	go func() {
		if err := s.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("http server error: %v", err)
		}
		s.running.Store(false)
		runtime.EventsEmit(s.ctx, "server:status", map[string]interface{}{"running": false})
	}()

	return nil
}

// Stop 停止服务
func (s *Service) Stop() error {
	if !s.running.Load() {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := s.server.Shutdown(ctx)
	if err != nil {
		s.server.Close()
	}
	s.running.Store(false)
	return nil
}

// StopWithTimeout 用于 App.shutdown 的 best-effort 停止
func (s *Service) StopWithTimeout(timeout time.Duration) {
	if !s.running.Load() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	_ = s.server.Shutdown(ctx)
	s.running.Store(false)
}

// onLogEntry 日志回调：写入 ring buffer + 事件分发
func (s *Service) onLogEntry(entry LogEntry) {
	s.logs.Push(entry)

	s.mu.Lock()
	s.stats.TotalRequests++
	s.stats.TotalBytes += entry.Bytes
	s.mu.Unlock()

	s.emitMu.Lock()
	s.pendingLogs = append(s.pendingLogs, entry)
	elapsed := time.Since(s.lastEmit)
	if len(s.pendingLogs) >= 10 && elapsed < 100*time.Millisecond {
		s.lastEmit = time.Now()
		batch := make([]LogEntry, len(s.pendingLogs))
		copy(batch, s.pendingLogs)
		s.pendingLogs = s.pendingLogs[:0]
		s.emitMu.Unlock()
		runtime.EventsEmit(s.ctx, "server:log_batch", map[string]interface{}{"entries": batch})
		return
	}
	s.emitMu.Unlock()

	runtime.EventsEmit(s.ctx, "server:log", entry)
}

// ListLanAddresses 枚举 LAN IP 地址
func ListLanAddresses() []string {
	var addrs []string
	interfaces, err := net.Interfaces()
	if err != nil {
		return addrs
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		list, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range list {
			var ip net.IP
			switch v := a.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.To4() == nil {
				continue
			}
			if strings.HasPrefix(ip.String(), "169.254.") {
				continue
			}
			addrs = append(addrs, ip.String())
		}
	}
	return addrs
}

func (s *Service) batchDownloadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.Lock()
	root := s.cfg.Root
	singleFile := s.cfg.SingleFile
	s.mu.Unlock()

	if err := r.ParseForm(); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	paths := r.Form["files"]
	if len(paths) == 0 {
		http.Error(w, "No files specified", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\"download.zip\"")

	zw := zip.NewWriter(w)
	defer zw.Close()

	added := map[string]struct{}{}
	for _, p := range paths {
		if singleFile {
			if err := addPathToZip(zw, root, filepath.Base(root), added); err != nil {
				continue
			}
			continue
		}

		fullPath := safeJoin(root, p)
		if !withinRoot(fullPath, root) {
			continue
		}

		relPath, err := filepath.Rel(root, fullPath)
		if err != nil {
			continue
		}
		relPath = filepath.ToSlash(relPath)
		if relPath == "." || relPath == "" {
			continue
		}

		if err := addPathToZip(zw, fullPath, relPath, added); err != nil {
			continue
		}
	}
}

func spaFileServerHandler(root, indexName string) http.Handler {
	fs := http.FileServer(http.Dir(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := safeJoin(root, r.URL.Path)
		if withinRoot(path, root) {
			if info, err := os.Stat(path); err == nil {
				if !info.IsDir() {
					fs.ServeHTTP(w, r)
					return
				}
				idxPath := filepath.Join(path, indexName)
				if _, err := os.Stat(idxPath); err == nil {
					fs.ServeHTTP(w, r)
					return
				}
			}
		}
		idxPath := filepath.Join(root, indexName)
		data, err := os.ReadFile(idxPath)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(data)
	})
}

func singleFileHandler(filePath string) http.Handler {
	name := filepath.Base(filePath)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/"+name {
			http.NotFound(w, r)
			return
		}
		data, err := os.ReadFile(filePath)
		if err != nil {
			http.Error(w, "文件读取失败", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		_, _ = w.Write(data)
	})
}

func authMiddleware(user, pass string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok ||
			subtle.ConstantTimeCompare([]byte(u), []byte(user)) != 1 ||
			subtle.ConstantTimeCompare([]byte(p), []byte(pass)) != 1 {
			w.Header().Set("WWW-Authenticate", `Basic realm="DevTools"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (w *loggingResponseWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *loggingResponseWriter) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	w.bytes += int64(n)
	return n, err
}

func loggingMiddleware(onEntry func(LogEntry), next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(lw, r)
		duration := time.Since(start)

		onEntry(LogEntry{
			Time:       start.Format("15:04:05.000"),
			RemoteAddr: r.RemoteAddr,
			Method:     r.Method,
			Path:       r.URL.Path,
			Status:     lw.status,
			Bytes:      lw.bytes,
			DurationMs: duration.Milliseconds(),
			UserAgent:  r.UserAgent(),
		})
	})
}

func safeJoin(root, requestPath string) string {
	trimmed := strings.TrimPrefix(filepath.ToSlash(requestPath), "/")
	clean := filepath.Clean(trimmed)
	if clean == "." {
		return root
	}
	return filepath.Join(root, clean)
}

func withinRoot(target, root string) bool {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return rel == "." || (!strings.HasPrefix(rel, "..") && rel != "")
}

func addPathToZip(zw *zip.Writer, sourcePath, zipPath string, added map[string]struct{}) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}

	zipPath = filepath.ToSlash(strings.TrimPrefix(zipPath, "./"))
	if zipPath == "" || zipPath == "." {
		zipPath = info.Name()
	}

	if info.IsDir() {
		entries, err := os.ReadDir(sourcePath)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			nextSource := filepath.Join(sourcePath, entry.Name())
			nextZip := pathJoin(zipPath, entry.Name())
			if err := addPathToZip(zw, nextSource, nextZip, added); err != nil {
				continue
			}
		}
		return nil
	}

	if _, exists := added[zipPath]; exists {
		return nil
	}

	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer, err := zw.Create(zipPath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(writer, file); err != nil {
		return err
	}
	added[zipPath] = struct{}{}
	return nil
}

func pathJoin(base, name string) string {
	if base == "" {
		return name
	}
	return base + "/" + name
}
