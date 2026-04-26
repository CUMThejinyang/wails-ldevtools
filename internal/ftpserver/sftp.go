package ftpserver

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

type SFTPConfig struct {
	Root      string `json:"root"`
	Port      int    `json:"port"`
	BindLocal bool   `json:"bindLocal"`
	AuthUser  string `json:"authUser"`
	AuthPass  string `json:"authPass"`
}

type SFTPStatus struct {
	Running     bool     `json:"running"`
	Root        string   `json:"root"`
	Port        int      `json:"port"`
	BindLocal   bool     `json:"bindLocal"`
	StartedAt   string   `json:"startedAt"`
	ActiveConns int32    `json:"activeConns"`
	Urls        []string `json:"urls"`
}

type SFTPService struct {
	ctx         context.Context
	listener    net.Listener
	cfg         SFTPConfig
	mu          sync.Mutex
	running     atomic.Bool
	startedAt   time.Time
	connCount   int32
	connWG      sync.WaitGroup
	acceptWG    sync.WaitGroup
	activeConns map[net.Conn]struct{}
}

func NewSFTPService(ctx context.Context) *SFTPService {
	return &SFTPService{ctx: ctx, activeConns: make(map[net.Conn]struct{})}
}

func (s *SFTPService) IsRunning() bool {
	return s.running.Load()
}

func (s *SFTPService) Status() SFTPStatus {
	if !s.running.Load() {
		return SFTPStatus{Running: false}
	}
	s.mu.Lock()
	cfg := s.cfg
	startedAt := s.startedAt
	connCount := s.connCount
	s.mu.Unlock()

	port := cfg.Port
	if port == 0 {
		port = 22
	}

	addrs := []string{}
	bindHost := "0.0.0.0"
	if cfg.BindLocal {
		bindHost = "127.0.0.1"
	}
	addrs = append(addrs, fmt.Sprintf("sftp://%s:%d", bindHost, port))
	if !cfg.BindLocal {
		for _, ip := range lanAddresses() {
			addrs = append(addrs, fmt.Sprintf("sftp://%s:%d", ip, port))
		}
	}

	return SFTPStatus{
		Running:     true,
		Root:        cfg.Root,
		Port:        port,
		BindLocal:   cfg.BindLocal,
		StartedAt:   startedAt.Format(time.RFC3339),
		ActiveConns: connCount,
		Urls:        addrs,
	}
}

func (s *SFTPService) Start(cfg SFTPConfig) error {
	if s.running.Load() {
		return fmt.Errorf("SFTP服务已在运行")
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
	if cfg.AuthUser == "" || cfg.AuthPass == "" {
		return fmt.Errorf("用户名/密码不能为空")
	}
	if cfg.Port == 0 {
		cfg.Port = 22
	}

	addr := fmt.Sprintf("0.0.0.0:%d", cfg.Port)
	if cfg.BindLocal {
		addr = fmt.Sprintf("127.0.0.1:%d", cfg.Port)
	}

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("端口 %d 已被占用", cfg.Port)
	}

	s.mu.Lock()
	s.cfg = cfg
	s.startedAt = time.Now()
	s.connCount = 0
	s.listener = listener
	s.activeConns = make(map[net.Conn]struct{})
	s.mu.Unlock()

	s.running.Store(true)

	hostKey, err := loadOrGenerateHostKey()
	if err != nil {
		s.running.Store(false)
		listener.Close()
		return fmt.Errorf("生成SSH主机密钥失败: %w", err)
	}

	sshConfig := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if conn.User() == cfg.AuthUser && string(password) == cfg.AuthPass {
				return nil, nil
			}
			return nil, errors.New("invalid credentials")
		},
	}
	sshConfig.AddHostKey(hostKey)

	go s.acceptLoop(listener, sshConfig, cfg.Root)
	return nil
}

func (s *SFTPService) Stop() error {
	if !s.running.Load() {
		return nil
	}

	s.running.Store(false)

	s.mu.Lock()
	listener := s.listener
	activeConns := make([]net.Conn, 0, len(s.activeConns))
	for conn := range s.activeConns {
		activeConns = append(activeConns, conn)
	}
	s.mu.Unlock()

	if listener != nil {
		listener.Close()
	}
	for _, conn := range activeConns {
		conn.Close()
	}

	s.acceptWG.Wait()
	s.connWG.Wait()

	s.mu.Lock()
	s.listener = nil
	s.activeConns = make(map[net.Conn]struct{})
	s.mu.Unlock()

	runtime.EventsEmit(s.ctx, "server:sftp_status", map[string]interface{}{"running": false})
	return nil
}

func (s *SFTPService) acceptLoop(listener net.Listener, config *ssh.ServerConfig, root string) {
	s.acceptWG.Add(1)
	defer s.acceptWG.Done()

	for s.running.Load() {
		conn, err := listener.Accept()
		if err != nil {
			if s.running.Load() {
				time.Sleep(100 * time.Millisecond)
			}
			continue
		}
		atomic.AddInt32(&s.connCount, 1)
		s.trackConn(conn)
		s.connWG.Add(1)
		go s.handleSSHConn(conn, config, root)
	}
}

func (s *SFTPService) handleSSHConn(netConn net.Conn, config *ssh.ServerConfig, root string) {
	defer s.connWG.Done()
	defer func() {
		s.untrackConn(netConn)
		atomic.AddInt32(&s.connCount, -1)
		netConn.Close()
	}()

	sshConn, chans, reqs, err := ssh.NewServerConn(netConn, config)
	if err != nil {
		return
	}
	defer sshConn.Close()

	go ssh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() == "session" {
			ch, reqs, err := newChannel.Accept()
			if err != nil {
				continue
			}
			go s.handleSession(ch, reqs, root)
		} else {
			newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
		}
	}
}

func (s *SFTPService) handleSession(ch ssh.Channel, reqs <-chan *ssh.Request, root string) {
	defer ch.Close()

	for req := range reqs {
		if req.Type == "subsystem" {
			if len(req.Payload) >= 4 {
				nameLen := uint32(req.Payload[0])<<24 | uint32(req.Payload[1])<<16 | uint32(req.Payload[2])<<8 | uint32(req.Payload[3])
				if int(4+nameLen) <= len(req.Payload) {
					name := string(req.Payload[4 : 4+nameLen])
					if name == "sftp" {
						req.Reply(true, nil)
						srv, err := sftp.NewServer(ch, sftp.WithServerWorkingDirectory(root))
						if err != nil {
							return
						}
						srv.Serve()
						return
					}
				}
			}
			req.Reply(false, nil)
			continue
		}
		if req.WantReply {
			req.Reply(false, nil)
		}
	}
}

func (s *SFTPService) trackConn(conn net.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.activeConns[conn] = struct{}{}
}

func (s *SFTPService) untrackConn(conn net.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.activeConns, conn)
}

func loadOrGenerateHostKey() (ssh.Signer, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	keyPath := filepath.Join(home, ".devtools", "sftp_host_key")

	data, err := os.ReadFile(keyPath)
	if err == nil {
		signer, err := ssh.ParsePrivateKey(data)
		if err == nil {
			return signer, nil
		}
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("generate RSA key: %w", err)
	}

	keyDER := x509.MarshalPKCS1PrivateKey(key)
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: keyDER})

	os.MkdirAll(filepath.Dir(keyPath), 0755)
	os.WriteFile(keyPath, keyPEM, 0600)

	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		return nil, fmt.Errorf("create signer: %w", err)
	}
	return signer, nil
}
