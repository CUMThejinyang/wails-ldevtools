package ftpserver

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

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
	ctx       context.Context
	listener  net.Listener
	cfg       SFTPConfig
	mu        sync.Mutex
	running   atomic.Bool
	startedAt time.Time
	connCount int32
}

func NewSFTPService(ctx context.Context) *SFTPService {
	return &SFTPService{ctx: ctx}
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
	s.mu.Unlock()

	s.running.Store(true)

	sshConfig := &ssh.ServerConfig{
		PasswordCallback: func(conn ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if conn.User() == cfg.AuthUser && string(password) == cfg.AuthPass {
				return nil, nil
			}
			return nil, errors.New("invalid credentials")
		},
	}

	go s.acceptLoop(listener, sshConfig)
	return nil
}

func (s *SFTPService) Stop() error {
	if !s.running.Load() {
		return nil
	}
	s.running.Store(false)
	if s.listener != nil {
		s.listener.Close()
	}
	return nil
}

func (s *SFTPService) acceptLoop(listener net.Listener, config *ssh.ServerConfig) {
	for s.running.Load() {
		conn, err := listener.Accept()
		if err != nil {
			if s.running.Load() {
				time.Sleep(100 * time.Millisecond)
			}
			continue
		}
		atomic.AddInt32(&s.connCount, 1)
		go s.handleSSHConn(conn, config)
	}
}

func (s *SFTPService) handleSSHConn(netConn net.Conn, config *ssh.ServerConfig) {
	defer func() {
		atomic.AddInt32(&s.connCount, -1)
		netConn.Close()
	}()

	s.mu.Lock()
	root := s.cfg.Root
	s.mu.Unlock()

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
		if req.Type == "subsystem" && len(req.Payload) >= 4 {
			nameLen := binary.BigEndian.Uint32(req.Payload[:4])
			if int(4+nameLen) <= len(req.Payload) {
				name := string(req.Payload[4 : 4+nameLen])
				if name == "sftp" {
					req.Reply(true, nil)
					serveSFTP(ch, root)
					return
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

// ── SFTP protocol constants ──

const (
	sftpPktInit     = 1
	sftpPktVersion  = 2
	sftpPktOpen     = 3
	sftpPktClose    = 4
	sftpPktRead     = 5
	sftpPktLstat    = 7
	sftpPktFstat    = 8
	sftpPktOpendir  = 11
	sftpPktReaddir  = 12
	sftpPktRealpath = 16
	sftpPktStat     = 17
	sftpPktData     = 103
	sftpPktHandle   = 102
	sftpPktName     = 104
	sftpPktAttrs    = 105
	sftpPktStatus   = 101
)

const (
	sshFxOk               = 0
	sshFxEOF              = 1
	sshFxNoSuchFile       = 2
	sshFxPermissionDenied = 3
	sshFxFailure          = 4
	sshFxBadMessage       = 5
	sshFxOpUnsupported    = 8
)

type sftpFile struct {
	*os.File
	path string
}

func serveSFTP(ch ssh.Channel, root string) {
	handles := make(map[string]*sftpFile)
	var mu sync.Mutex

	for {
		pkt, err := readPacket(ch)
		if err != nil {
			return
		}
		if len(pkt) < 5 {
			continue
		}
		typ := pkt[0]
		id := binary.BigEndian.Uint32(pkt[1:5])
		payload := pkt[5:]

		switch typ {
		case sftpPktInit:
			ver := uint32(3)
			if len(payload) >= 4 {
				v := binary.BigEndian.Uint32(payload[:4])
				if v < 3 {
					ver = v
				}
			}
			sendPacket(ch, sftpPktVersion, 0, putU32(ver))

		case sftpPktRealpath:
			p := getString(payload)
			fp := safePath(root, p)
			info, err := os.Stat(fp)
			if err != nil {
				sendStatus(ch, id, sshFxNoSuchFile, "No such file")
				continue
			}
			var d []byte
			d = append(d, putU32(1)...)
			d = append(d, marshalAttrs(p, info)...)
			sendPacket(ch, sftpPktName, id, d)

		case sftpPktStat, sftpPktLstat:
			p := getString(payload)
			fp := safePath(root, p)
			info, err := os.Stat(fp)
			if err != nil {
				sendStatus(ch, id, sshFxNoSuchFile, "No such file")
				continue
			}
			sendPacket(ch, sftpPktAttrs, id, marshalAttrs("", info))

		case sftpPktOpendir:
			p := getString(payload)
			fp := safePath(root, p)
			handle := "d:" + p
			mu.Lock()
			handles[handle] = &sftpFile{path: fp}
			mu.Unlock()
			sendPacket(ch, sftpPktHandle, id, putStr(handle))

		case sftpPktReaddir:
			handle := getString(payload)
			mu.Lock()
			f, ok := handles[handle]
			mu.Unlock()
			if !ok {
				sendStatus(ch, id, sshFxEOF, "End of dir")
				continue
			}
			entries, err := os.ReadDir(f.path)
			if err != nil {
				sendStatus(ch, id, sshFxFailure, "Cannot read dir")
				continue
			}
			if len(entries) == 0 {
				mu.Lock()
				delete(handles, handle)
				mu.Unlock()
				sendStatus(ch, id, sshFxEOF, "End of dir")
				continue
			}
			n := len(entries)
			if n > 100 {
				n = 100
			}
			var d []byte
			d = append(d, putU32(uint32(n))...)
			for i := 0; i < n; i++ {
				e := entries[i]
				info, err := e.Info()
				if err != nil {
					continue
				}
				d = append(d, marshalAttrs(e.Name(), info)...)
			}
			sendPacket(ch, sftpPktName, id, d)
			if n >= len(entries) {
				mu.Lock()
				delete(handles, handle)
				mu.Unlock()
			}

		case sftpPktOpen:
			if len(payload) < 4 {
				sendStatus(ch, id, sshFxBadMessage, "Bad message")
				continue
			}
			flags := binary.BigEndian.Uint32(payload[:4])
			p := getString(payload[4:])
			fp := safePath(root, p)

			var file *os.File
			var err error
			switch flags & 0x03 {
			case 0x01:
				file, err = os.Open(fp)
			case 0x02:
				file, err = os.OpenFile(fp, os.O_WRONLY|os.O_CREATE, 0644)
			default:
				file, err = os.Open(fp)
			}
			if err != nil {
				sendStatus(ch, id, sshFxNoSuchFile, "Cannot open")
				continue
			}
			handle := "f:" + p
			mu.Lock()
			handles[handle] = &sftpFile{File: file, path: fp}
			mu.Unlock()
			sendPacket(ch, sftpPktHandle, id, putStr(handle))

		case sftpPktRead:
			handle := getString(payload)
			rest := payload[len(handle)+4:]
			if len(rest) < 12 {
				sendStatus(ch, id, sshFxBadMessage, "Bad message")
				continue
			}
			offset := int64(binary.BigEndian.Uint64(rest[:8]))
			length := binary.BigEndian.Uint32(rest[8:12])
			if length > 32768 {
				length = 32768
			}

			mu.Lock()
			f, ok := handles[handle]
			mu.Unlock()
			if !ok {
				sendStatus(ch, id, sshFxEOF, "Invalid handle")
				continue
			}

			buf := make([]byte, length)
			n, err := f.ReadAt(buf, offset)
			if err != nil && err != io.EOF {
				sendStatus(ch, id, sshFxFailure, "Read error")
				continue
			}
			if n == 0 {
				sendStatus(ch, id, sshFxEOF, "EOF")
				continue
			}
			var d []byte
			d = append(d, putU32(uint32(n))...)
			d = append(d, buf[:n]...)
			sendPacket(ch, sftpPktData, id, d)

		case sftpPktClose:
			handle := getString(payload)
			mu.Lock()
			f, ok := handles[handle]
			if ok {
				delete(handles, handle)
			}
			mu.Unlock()
			if ok && f.File != nil {
				f.File.Close()
			}
			sendStatus(ch, id, sshFxOk, "OK")

		default:
			sendStatus(ch, id, sshFxOpUnsupported, "Not supported")
		}
	}
}

func safePath(root, rel string) string {
	rel = strings.TrimPrefix(rel, "/")
	rel = filepath.Clean(rel)
	if rel == "." {
		return root
	}
	p := filepath.Join(root, rel)
	if !withinRoot(p, root) {
		return root
	}
	return p
}

// ── Wire helpers ──

func readPacket(r io.Reader) ([]byte, error) {
	hdr := make([]byte, 4)
	if _, err := io.ReadFull(r, hdr); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint32(hdr)
	if n > 256*1024 {
		return nil, fmt.Errorf("packet too large")
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

func sendPacket(w io.Writer, typ byte, id uint32, data []byte) error {
	length := uint32(1 + 4 + len(data))
	buf := make([]byte, 4+1+4+len(data))
	binary.BigEndian.PutUint32(buf, length)
	buf[4] = typ
	binary.BigEndian.PutUint32(buf[5:9], id)
	copy(buf[9:], data)
	_, err := w.Write(buf)
	return err
}

func sendStatus(ch ssh.Channel, id, code uint32, msg string) {
	var d []byte
	d = append(d, putU32(id)...)
	d = append(d, putU32(code)...)
	d = append(d, putStr(msg)...)
	d = append(d, putStr("")...)
	sendPacket(ch, sftpPktStatus, 0, d)
}

func putU32(v uint32) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, v)
	return b
}

func putU64(v uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, v)
	return b
}

func putStr(s string) []byte {
	b := make([]byte, 4+len(s))
	binary.BigEndian.PutUint32(b, uint32(len(s)))
	copy(b[4:], s)
	return b
}

func getString(data []byte) string {
	if len(data) < 4 {
		return ""
	}
	n := binary.BigEndian.Uint32(data[:4])
	if int(4+n) > len(data) {
		return string(data[4:])
	}
	return string(data[4 : 4+n])
}

func marshalAttrs(name string, info os.FileInfo) []byte {
	var d []byte
	d = append(d, putStr(name)...) // filename
	d = append(d, putStr(name)...) // longname

	// attrs flags: size(0x01) + uidgid(0x02) + perms(0x04) + times(0x08)
	d = append(d, putU32(0x0F)...)

	var mode uint32
	if info.IsDir() {
		mode = 0x4000FFF
	} else {
		mode = 0x8000FFF
	}
	d = append(d, putU32(mode)...)
	d = append(d, putU32(0)...)                             // uid
	d = append(d, putU32(0)...)                             // gid
	d = append(d, putU64(uint64(info.Size()))...)           // size
	d = append(d, putU32(uint32(info.ModTime().Unix()))...) // atime
	d = append(d, putU32(uint32(info.ModTime().Unix()))...) // mtime
	return d
}
