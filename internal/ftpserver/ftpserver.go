package ftpserver

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	ftpserver "github.com/fclairamb/ftpserverlib"
	"github.com/spf13/afero"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Config struct {
	Root        string `json:"root"`
	Port        int    `json:"port"`
	BindLocal   bool   `json:"bindLocal"`
	AuthEnabled bool   `json:"authEnabled"`
	AuthUser    string `json:"authUser"`
	AuthPass    string `json:"authPass"`
	AllowAnonym bool   `json:"allowAnonymous"`
}

type Status struct {
	Running     bool     `json:"running"`
	Root        string   `json:"root"`
	Port        int      `json:"port"`
	BindLocal   bool     `json:"bindLocal"`
	AuthEnabled bool     `json:"authEnabled"`
	AllowAnonym bool     `json:"allowAnonymous"`
	StartedAt   string   `json:"startedAt"`
	ActiveConns int32    `json:"activeConns"`
	TotalConns  int64    `json:"totalConns"`
	Urls        []string `json:"urls"`
}

type LogEntry struct {
	Time       string `json:"time"`
	RemoteAddr string `json:"remoteAddr"`
	Command    string `json:"command"`
	Args       string `json:"args"`
	Response   string `json:"response"`
	Code       int    `json:"code"`
}

type Service struct {
	ctx         context.Context
	cfg         Config
	mu          sync.Mutex
	running     atomic.Bool
	startedAt   time.Time
	connCount   int32
	totalConn   int64
	server      *ftpserver.FtpServer
	driver      *ftpDriver
	serveDone   chan struct{}
	activeConns map[ftpserver.ClientContext]struct{}
}

func NewService(ctx context.Context) *Service {
	return &Service{ctx: ctx, activeConns: make(map[ftpserver.ClientContext]struct{})}
}

func (s *Service) IsRunning() bool {
	return s.running.Load()
}

func (s *Service) Status() Status {
	if !s.running.Load() {
		return Status{Running: false}
	}
	s.mu.Lock()
	cfg := s.cfg
	startedAt := s.startedAt
	connCount := s.connCount
	totalConn := s.totalConn
	s.mu.Unlock()

	port := cfg.Port
	if port == 0 {
		port = 21
	}

	urls := []string{}
	bindHost := "0.0.0.0"
	if cfg.BindLocal {
		bindHost = "127.0.0.1"
	}
	urls = append(urls, fmt.Sprintf("ftp://%s:%d", bindHost, port))
	if !cfg.BindLocal {
		for _, ip := range lanAddresses() {
			urls = append(urls, fmt.Sprintf("ftp://%s:%d", ip, port))
		}
	}

	return Status{
		Running:     true,
		Root:        cfg.Root,
		Port:        port,
		BindLocal:   cfg.BindLocal,
		AuthEnabled: cfg.AuthEnabled,
		AllowAnonym: cfg.AllowAnonym,
		StartedAt:   startedAt.Format(time.RFC3339),
		ActiveConns: connCount,
		TotalConns:  totalConn,
		Urls:        urls,
	}
}

func (s *Service) Start(cfg Config) error {
	if s.running.Load() {
		return fmt.Errorf("FTP服务已在运行")
	}
	if cfg.Root == "" {
		return fmt.Errorf("请选择根目录")
	}
	if info, err := os.Stat(cfg.Root); err != nil || !info.IsDir() {
		return fmt.Errorf("根目录不存在或不是目录")
	}
	if cfg.Port < 1 || cfg.Port > 65535 {
		return fmt.Errorf("端口超出范围（1-65535）")
	}
	if cfg.AuthEnabled {
		if strings.TrimSpace(cfg.AuthUser) == "" || strings.TrimSpace(cfg.AuthPass) == "" {
			return fmt.Errorf("认证用户名/密码不能为空")
		}
	}
	if cfg.Port == 0 {
		cfg.Port = 21
	}

	s.mu.Lock()
	s.cfg = cfg
	s.startedAt = time.Now()
	s.connCount = 0
	s.totalConn = 0
	s.activeConns = make(map[ftpserver.ClientContext]struct{})
	s.mu.Unlock()

	driver := &ftpDriver{svc: s, cfg: cfg}
	s.driver = driver

	server := ftpserver.NewFtpServer(driver)
	serveDone := make(chan struct{})
	s.server = server
	s.serveDone = serveDone
	s.running.Store(true)

	go func() {
		defer close(serveDone)
		if err := server.ListenAndServe(); err != nil && s.running.Load() {
			s.running.Store(false)
			runtime.EventsEmit(s.ctx, "server:ftp_status", map[string]interface{}{"running": false, "error": err.Error()})
		}
	}()

	return nil
}

func (s *Service) Stop() error {
	if !s.running.Load() {
		return nil
	}

	s.mu.Lock()
	server := s.server
	serveDone := s.serveDone
	activeConns := make([]ftpserver.ClientContext, 0, len(s.activeConns))
	for conn := range s.activeConns {
		activeConns = append(activeConns, conn)
	}
	s.mu.Unlock()

	s.running.Store(false)
	for _, conn := range activeConns {
		_ = conn.Close()
	}
	if server != nil {
		server.Stop()
	}
	if serveDone != nil {
		<-serveDone
	}

	s.mu.Lock()
	s.server = nil
	s.serveDone = nil
	s.activeConns = make(map[ftpserver.ClientContext]struct{})
	s.mu.Unlock()

	runtime.EventsEmit(s.ctx, "server:ftp_status", map[string]interface{}{"running": false})
	return nil
}

func (s *Service) addConn(cc ftpserver.ClientContext) {
	atomic.AddInt64(&s.totalConn, 1)
	atomic.AddInt32(&s.connCount, 1)
	s.mu.Lock()
	s.activeConns[cc] = struct{}{}
	s.mu.Unlock()
}

func (s *Service) removeConn(cc ftpserver.ClientContext) {
	atomic.AddInt32(&s.connCount, -1)
	s.mu.Lock()
	delete(s.activeConns, cc)
	s.mu.Unlock()
}

func (s *Service) emitLog(remoteAddr, cmd, args, resp string, code int) {
	entry := LogEntry{
		Time:       time.Now().Format("15:04:05.000"),
		RemoteAddr: remoteAddr,
		Command:    cmd,
		Args:       args,
		Response:   resp,
		Code:       code,
	}
	runtime.EventsEmit(s.ctx, "server:ftp_log", entry)
}

// ── ftpserverlib MainDriver implementation ──

type ftpDriver struct {
	svc *Service
	cfg Config
}

func (d *ftpDriver) GetSettings() (*ftpserver.Settings, error) {
	return &ftpserver.Settings{
		ListenAddr: d.listenAddr(),
		PassiveTransferPortRange: ftpserver.PortRange{
			Start: 50000,
			End:   50100,
		},
		DefaultTransferType: ftpserver.TransferTypeBinary,
	}, nil
}

func (d *ftpDriver) listenAddr() string {
	if d.cfg.BindLocal {
		return fmt.Sprintf("127.0.0.1:%d", d.cfg.Port)
	}
	return fmt.Sprintf("0.0.0.0:%d", d.cfg.Port)
}

func (d *ftpDriver) ClientConnected(cc ftpserver.ClientContext) (string, error) {
	d.svc.addConn(cc)
	return "Welcome to DevTools FTP Server", nil
}

func (d *ftpDriver) ClientDisconnected(cc ftpserver.ClientContext) {
	d.svc.removeConn(cc)
}

func (d *ftpDriver) AuthUser(cc ftpserver.ClientContext, user, pass string) (ftpserver.ClientDriver, error) {
	if !d.cfg.AuthEnabled || d.cfg.AllowAnonym {
		return afero.NewBasePathFs(afero.NewOsFs(), d.cfg.Root), nil
	}
	if user == d.cfg.AuthUser && pass == d.cfg.AuthPass {
		return afero.NewBasePathFs(afero.NewOsFs(), d.cfg.Root), nil
	}
	return nil, fmt.Errorf("invalid credentials")
}

func (d *ftpDriver) GetTLSConfig() (*tls.Config, error) {
	return nil, nil
}

func lanAddresses() []string {
	var addrs []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return addrs
	}
	for _, iface := range ifaces {
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
			s := ip.String()
			if strings.HasPrefix(s, "169.254.") {
				continue
			}
			addrs = append(addrs, s)
		}
	}
	return addrs
}
