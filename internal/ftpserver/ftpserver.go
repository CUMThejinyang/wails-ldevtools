package ftpserver

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

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
	ctx       context.Context
	listener  net.Listener
	cfg       Config
	mu        sync.Mutex
	running   atomic.Bool
	startedAt time.Time
	connCount int32
	totalConn int64
}

func NewService(ctx context.Context) *Service {
	return &Service{ctx: ctx}
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
	s.totalConn = 0
	s.listener = listener
	s.mu.Unlock()

	s.running.Store(true)
	go s.serve()
	return nil
}

func (s *Service) Stop() error {
	if !s.running.Load() {
		return nil
	}
	s.running.Store(false)
	if s.listener != nil {
		s.listener.Close()
	}
	return nil
}

func (s *Service) serve() {
	for s.running.Load() {
		conn, err := s.listener.Accept()
		if err != nil {
			if s.running.Load() {
				time.Sleep(100 * time.Millisecond)
			}
			continue
		}
		atomic.AddInt64(&s.totalConn, 1)
		atomic.AddInt32(&s.connCount, 1)
		go s.handleConn(conn)
	}
}

// ftpConn tracks per-connection state
type ftpConn struct {
	ctrl          net.Conn
	root          string
	cwd           string // relative to root, always starts with "/"
	svc           *Service
	authenticated bool
	username      string
	transferType  string // "A" or "I"
	dataListener  net.Listener
	remoteIP      string // client IP for PASV response
}

func (s *Service) handleConn(conn net.Conn) {
	defer func() {
		atomic.AddInt32(&s.connCount, -1)
		conn.Close()
	}()

	s.mu.Lock()
	cfg := s.cfg
	s.mu.Unlock()

	host, _, _ := net.SplitHostPort(conn.RemoteAddr().String())

	fc := &ftpConn{
		ctrl:         conn,
		root:         cfg.Root,
		cwd:          "/",
		svc:          s,
		transferType: "I",
		remoteIP:     host,
	}

	fc.reply(220, "DevTools FTP Server ready")

	reader := newFTPReader(conn)
	for s.running.Load() {
		line, err := reader.ReadLine()
		if err != nil {
			return
		}

		parts := strings.SplitN(strings.TrimSpace(string(line)), " ", 2)
		cmd := strings.ToUpper(parts[0])
		args := ""
		if len(parts) > 1 {
			args = strings.TrimSpace(parts[1])
		}

		switch cmd {
		case "USER":
			fc.handleUSER(args, cfg)
		case "PASS":
			fc.handlePASS(args, cfg)
		case "SYST":
			fc.reply(215, "UNIX Type: L8")
		case "FEAT":
			fc.writeRaw("211-Features:\r\n PASV\r\n SIZE\r\n UTF8\r\n211 End\r\n")
		case "OPTS":
			if strings.ToUpper(args) == "UTF8 ON" {
				fc.reply(200, "UTF8 set to on")
			} else {
				fc.reply(501, "Option not understood")
			}
		case "PWD":
			fc.reply(257, "\"%s\" is current directory", fc.cwd)
		case "CWD":
			fc.handleCWD(args)
		case "CDUP":
			fc.handleCDUP()
		case "TYPE":
			fc.handleTYPE(args)
		case "PASV":
			fc.handlePASV()
		case "LIST", "NLST":
			fc.handleLIST(args)
		case "SIZE":
			fc.handleSIZE(args)
		case "RETR":
			fc.handleRETR(args)
		case "QUIT":
			fc.reply(221, "Goodbye")
			return
		case "NOOP":
			fc.reply(200, "NOOP ok")
		default:
			fc.reply(502, "Command not implemented")
		}
	}
}

func (fc *ftpConn) reply(code int, format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	line := fmt.Sprintf("%d %s\r\n", code, msg)
	fc.ctrl.Write([]byte(line))
	fc.svc.emitLog(fc.ctrl.RemoteAddr().String(), "", "", msg, code)
}

func (fc *ftpConn) writeRaw(s string) {
	fc.ctrl.Write([]byte(s))
}

func (fc *ftpConn) requireAuth() bool {
	if !fc.authenticated {
		fc.reply(530, "Please login first")
		return false
	}
	return true
}

func (fc *ftpConn) handleUSER(args string, cfg Config) {
	if !cfg.AuthEnabled || cfg.AllowAnonym {
		fc.authenticated = true
		fc.username = "anonymous"
		fc.reply(230, "Anonymous login ok")
		return
	}
	fc.username = args
	fc.reply(331, "Password required")
}

func (fc *ftpConn) handlePASS(args string, cfg Config) {
	if fc.authenticated {
		fc.reply(230, "Already logged in")
		return
	}
	if !cfg.AuthEnabled {
		fc.reply(503, "Login not required")
		return
	}
	if args == cfg.AuthPass {
		fc.authenticated = true
		fc.reply(230, "Login successful")
	} else {
		fc.reply(530, "Login incorrect")
	}
}

func (fc *ftpConn) handleTYPE(args string) {
	t := strings.ToUpper(args)
	if t == "A" || t == "A N" {
		fc.transferType = "A"
		fc.reply(200, "Type set to A")
	} else if t == "I" || t == "L 8" {
		fc.transferType = "I"
		fc.reply(200, "Type set to I")
	} else {
		fc.reply(504, "Type not supported")
	}
}

func (fc *ftpConn) resolvePath(rel string) string {
	var target string
	if strings.HasPrefix(rel, "/") {
		target = rel
	} else {
		target = pathJoin(fc.cwd, rel)
	}
	// clean
	target = filepath.Clean(target)
	if target == "." || target == "/" {
		target = "/"
	}
	return target
}

func (fc *ftpConn) handleCWD(args string) {
	if !fc.requireAuth() {
		return
	}
	target := fc.resolvePath(args)
	fullPath := filepath.Join(fc.root, filepath.FromSlash(target))
	if !withinRoot(fullPath, fc.root) {
		fc.reply(550, "Permission denied")
		return
	}
	info, err := os.Stat(fullPath)
	if err != nil || !info.IsDir() {
		fc.reply(550, "Directory not found")
		return
	}
	fc.cwd = target
	fc.reply(250, "CWD successful")
}

func (fc *ftpConn) handleCDUP() {
	if !fc.requireAuth() {
		return
	}
	parent := filepath.Dir(fc.cwd)
	if parent == "." || parent == "" {
		parent = "/"
	}
	parent = filepath.ToSlash(parent)
	fc.cwd = parent
	fc.reply(250, "CDUP successful")
}

func (fc *ftpConn) handlePASV() {
	if !fc.requireAuth() {
		return
	}
	// close previous data listener
	if fc.dataListener != nil {
		fc.dataListener.Close()
	}

	ln, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		fc.reply(425, "Cannot open passive connection")
		return
	}
	fc.dataListener = ln

	_, portStr, _ := net.SplitHostPort(ln.Addr().String())
	port, _ := strconv.Atoi(portStr)

	// Use server IP from control connection
	localIP := "127,0,0,1"
	localAddr := fc.ctrl.LocalAddr().String()
	if host, _, err := net.SplitHostPort(localAddr); err == nil {
		ip := net.ParseIP(host)
		if ip != nil && !ip.IsUnspecified() {
			localIP = strings.ReplaceAll(ip.String(), ".", ",")
		}
	}

	fc.reply(227, "Entering Passive Mode (%s,%d,%d)", localIP, port/256, port%256)
}

func (fc *ftpConn) getDataConn() (net.Conn, error) {
	if fc.dataListener == nil {
		return nil, fmt.Errorf("no PASV")
	}
	ln := fc.dataListener
	fc.dataListener = nil

	conn, err := ln.Accept()
	ln.Close()
	return conn, err
}

func (fc *ftpConn) handleLIST(args string) {
	if !fc.requireAuth() {
		return
	}

	// ignore flags like -la, -a, etc
	dir := args
	for strings.HasPrefix(dir, "-") {
		parts := strings.SplitN(dir, " ", 2)
		if len(parts) > 1 {
			dir = parts[1]
		} else {
			dir = ""
			break
		}
	}
	if dir == "" {
		dir = fc.cwd
	} else {
		dir = fc.resolvePath(dir)
	}

	fullPath := filepath.Join(fc.root, filepath.FromSlash(dir))
	if !withinRoot(fullPath, fc.root) {
		fc.reply(550, "Permission denied")
		return
	}

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		fc.reply(550, "Cannot list directory")
		return
	}

	dataConn, err := fc.getDataConn()
	if err != nil {
		fc.reply(425, "Cannot open data connection")
		return
	}
	defer dataConn.Close()

	fc.reply(150, "Opening data connection for directory listing")

	var buf strings.Builder
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		modTime := info.ModTime().Format("Jan  2 15:04")
		if e.IsDir() {
			fmt.Fprintf(&buf, "drwxr-xr-x 1 owner group %12d %s %s\r\n", 0, modTime, e.Name())
		} else {
			fmt.Fprintf(&buf, "-rw-r--r-- 1 owner group %12d %s %s\r\n", info.Size(), modTime, e.Name())
		}
	}
	dataConn.Write([]byte(buf.String()))
	dataConn.Close()

	fc.reply(226, "Transfer complete")
}

func (fc *ftpConn) handleSIZE(args string) {
	if !fc.requireAuth() {
		return
	}
	if args == "" {
		fc.reply(501, "Missing argument")
		return
	}

	target := fc.resolvePath(args)
	fullPath := filepath.Join(fc.root, filepath.FromSlash(target))
	if !withinRoot(fullPath, fc.root) {
		fc.reply(550, "Permission denied")
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil {
		fc.reply(550, "File not found")
		return
	}
	fc.reply(213, "%d", info.Size())
}

func (fc *ftpConn) handleRETR(args string) {
	if !fc.requireAuth() {
		return
	}
	if args == "" {
		fc.reply(501, "Missing argument")
		return
	}

	target := fc.resolvePath(args)
	fullPath := filepath.Join(fc.root, filepath.FromSlash(target))
	if !withinRoot(fullPath, fc.root) {
		fc.reply(550, "Permission denied")
		return
	}

	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		fc.reply(550, "File not found")
		return
	}

	dataConn, err := fc.getDataConn()
	if err != nil {
		fc.reply(425, "Cannot open data connection")
		return
	}

	fc.reply(150, "Opening data connection for %s (%d bytes)", args, info.Size())

	f, err := os.Open(fullPath)
	if err != nil {
		dataConn.Close()
		fc.reply(550, "Cannot open file")
		return
	}

	_, err = io.Copy(dataConn, f)
	f.Close()
	dataConn.Close()

	if err != nil {
		fc.reply(426, "Transfer aborted")
	} else {
		fc.reply(226, "Transfer complete")
	}
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

func withinRoot(target, root string) bool {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return rel == "." || (!strings.HasPrefix(rel, "..") && rel != "")
}

func pathJoin(base, rel string) string {
	if base == "/" {
		return "/" + strings.TrimPrefix(rel, "/")
	}
	return base + "/" + strings.TrimPrefix(rel, "/")
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

type ftpReader struct {
	conn     net.Conn
	buf      []byte
	readPos  int
	writePos int
}

func newFTPReader(conn net.Conn) *ftpReader {
	return &ftpReader{conn: conn, buf: make([]byte, 8192)}
}

func (r *ftpReader) ReadLine() ([]byte, error) {
	for {
		for i := r.readPos; i < r.writePos; i++ {
			if r.buf[i] == '\n' {
				line := r.buf[r.readPos:i]
				r.readPos = i + 1
				if len(line) > 0 && line[len(line)-1] == '\r' {
					line = line[:len(line)-1]
				}
				return line, nil
			}
		}
		if r.writePos >= len(r.buf) {
			return nil, fmt.Errorf("buffer full")
		}
		n, err := r.conn.Read(r.buf[r.writePos:])
		if err != nil {
			return nil, err
		}
		r.writePos += n
	}
}
