//go:build windows

package netstat

import (
	"encoding/binary"
	"fmt"
	"net"
	"unsafe"

	"golang.org/x/sys/windows"
)

type PortEntry struct {
	Protocol   string `json:"protocol"`
	Family     string `json:"family"`
	LocalAddr  string `json:"localAddr"`
	LocalPort  uint16 `json:"localPort"`
	RemoteAddr string `json:"remoteAddr"`
	RemotePort uint16 `json:"remotePort"`
	State      string `json:"state"`
	PID        uint32 `json:"pid"`
}

var (
	modiphlpapi             = windows.NewLazySystemDLL("iphlpapi.dll")
	procGetExtendedTcpTable = modiphlpapi.NewProc("GetExtendedTcpTable")
	procGetExtendedUdpTable = modiphlpapi.NewProc("GetExtendedUdpTable")
)

const (
	tcpTableOwnerPIDAll = 5
	udpTableOwnerPID    = 1

	mibTcpStateClosed    = 1
	mibTcpStateListen    = 2
	mibTcpStateSynSent   = 3
	mibTcpStateSynRcvd   = 4
	mibTcpStateEstab     = 5
	mibTcpStateFinWait1  = 6
	mibTcpStateFinWait2  = 7
	mibTcpStateCloseWait = 8
	mibTcpStateClosing   = 9
	mibTcpStateLastAck   = 10
	mibTcpStateTimeWait  = 11
	mibTcpStateDeleteTcb = 12
)

var tcpStateMap = map[uint32]string{
	mibTcpStateClosed:    "CLOSED",
	mibTcpStateListen:    "LISTEN",
	mibTcpStateSynSent:   "SYN_SENT",
	mibTcpStateSynRcvd:   "SYN_RCVD",
	mibTcpStateEstab:     "ESTABLISHED",
	mibTcpStateFinWait1:  "FIN_WAIT_1",
	mibTcpStateFinWait2:  "FIN_WAIT_2",
	mibTcpStateCloseWait: "CLOSE_WAIT",
	mibTcpStateClosing:   "CLOSING",
	mibTcpStateLastAck:   "LAST_ACK",
	mibTcpStateTimeWait:  "TIME_WAIT",
	mibTcpStateDeleteTcb: "DELETE_TCB",
}

func tcpStateName(state uint32) string {
	if name, ok := tcpStateMap[state]; ok {
		return name
	}
	return fmt.Sprintf("UNKNOWN(%d)", state)
}

type mibTcpRowOwnerPID struct {
	State      uint32
	LocalAddr  uint32
	LocalPort  uint32
	RemoteAddr uint32
	RemotePort uint32
	OwningPid  uint32
}

// mibTcp6RowOwnerPID — IPv6 TCP row (24 + 16 + 16 = 56 bytes)
type mibTcp6RowOwnerPID struct {
	LocalAddr     [16]byte
	LocalScopeId  uint32
	LocalPort     uint32
	RemoteAddr    [16]byte
	RemoteScopeId uint32
	RemotePort    uint32
	State         uint32
	OwningPid     uint32
}

type mibUdpRowOwnerPID struct {
	LocalAddr uint32
	LocalPort uint32
	OwningPid uint32
}

// mibUdp6RowOwnerPID — IPv6 UDP row
type mibUdp6RowOwnerPID struct {
	LocalAddr    [16]byte
	LocalScopeId uint32
	LocalPort    uint32
	OwningPid    uint32
}

func callTableAPI(proc *windows.LazyProc, family uintptr, tableClass uintptr) ([]byte, error) {
	var size uint32
	proc.Call(0, uintptr(unsafe.Pointer(&size)), 0, family, tableClass, 0)
	if size == 0 {
		return nil, nil
	}

	buf := make([]byte, size)
	for {
		ret, _, err := proc.Call(
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(&size)),
			0,
			family,
			tableClass,
			0,
		)
		if ret == 0 {
			return buf, nil
		}
		if ret == uintptr(windows.ERROR_INSUFFICIENT_BUFFER) {
			buf = make([]byte, size)
			continue
		}
		return nil, err
	}
}

func parseRows(buf []byte, rowSize int) (uint32, []byte) {
	if len(buf) < 4 {
		return 0, nil
	}
	numEntries := *(*uint32)(unsafe.Pointer(&buf[0]))
	return numEntries, buf[4:]
}

func portFromNetOrder(port uint32) uint16 {
	return binary.BigEndian.Uint16((*[2]byte)(unsafe.Pointer(&port))[:])
}

func ipv4Str(ip uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d", byte(ip), byte(ip>>8), byte(ip>>16), byte(ip>>24))
}

func ipv6Str(addr [16]byte) string {
	return net.IP(addr[:]).String()
}

func ListPorts() ([]PortEntry, error) {
	var entries []PortEntry

	// TCP v4
	tcp4Buf, err := callTableAPI(procGetExtendedTcpTable, windows.AF_INET, tcpTableOwnerPIDAll)
	if err != nil {
		return nil, fmt.Errorf("TCP v4: %w", err)
	}
	if tcp4Buf != nil {
		n, data := parseRows(tcp4Buf, int(unsafe.Sizeof(mibTcpRowOwnerPID{})))
		rowSz := int(unsafe.Sizeof(mibTcpRowOwnerPID{}))
		for i := uint32(0); i < n; i++ {
			off := i * uint32(rowSz)
			if int(off)+rowSz > len(data)+4 {
				break
			}
			row := *(*mibTcpRowOwnerPID)(unsafe.Pointer(&data[off]))
			entries = append(entries, PortEntry{
				Protocol:   "TCP",
				Family:     "v4",
				LocalAddr:  ipv4Str(row.LocalAddr),
				LocalPort:  portFromNetOrder(row.LocalPort),
				RemoteAddr: ipv4Str(row.RemoteAddr),
				RemotePort: portFromNetOrder(row.RemotePort),
				State:      tcpStateName(row.State),
				PID:        row.OwningPid,
			})
		}
	}

	// TCP v6
	tcp6Buf, err := callTableAPI(procGetExtendedTcpTable, windows.AF_INET6, tcpTableOwnerPIDAll)
	if err != nil {
		return nil, fmt.Errorf("TCP v6: %w", err)
	}
	if tcp6Buf != nil {
		n, data := parseRows(tcp6Buf, int(unsafe.Sizeof(mibTcp6RowOwnerPID{})))
		rowSz := int(unsafe.Sizeof(mibTcp6RowOwnerPID{}))
		for i := uint32(0); i < n; i++ {
			off := i * uint32(rowSz)
			if int(off)+rowSz > len(data)+4 {
				break
			}
			row := *(*mibTcp6RowOwnerPID)(unsafe.Pointer(&data[off]))
			entries = append(entries, PortEntry{
				Protocol:   "TCP",
				Family:     "v6",
				LocalAddr:  ipv6Str(row.LocalAddr),
				LocalPort:  portFromNetOrder(row.LocalPort),
				RemoteAddr: ipv6Str(row.RemoteAddr),
				RemotePort: portFromNetOrder(row.RemotePort),
				State:      tcpStateName(row.State),
				PID:        row.OwningPid,
			})
		}
	}

	// UDP v4
	udp4Buf, err := callTableAPI(procGetExtendedUdpTable, windows.AF_INET, udpTableOwnerPID)
	if err != nil {
		return nil, fmt.Errorf("UDP v4: %w", err)
	}
	if udp4Buf != nil {
		n, data := parseRows(udp4Buf, int(unsafe.Sizeof(mibUdpRowOwnerPID{})))
		rowSz := int(unsafe.Sizeof(mibUdpRowOwnerPID{}))
		for i := uint32(0); i < n; i++ {
			off := i * uint32(rowSz)
			if int(off)+rowSz > len(data)+4 {
				break
			}
			row := *(*mibUdpRowOwnerPID)(unsafe.Pointer(&data[off]))
			entries = append(entries, PortEntry{
				Protocol:  "UDP",
				Family:    "v4",
				LocalAddr: ipv4Str(row.LocalAddr),
				LocalPort: portFromNetOrder(row.LocalPort),
				State:     "STATELESS",
				PID:       row.OwningPid,
			})
		}
	}

	// UDP v6
	udp6Buf, err := callTableAPI(procGetExtendedUdpTable, windows.AF_INET6, udpTableOwnerPID)
	if err != nil {
		return nil, fmt.Errorf("UDP v6: %w", err)
	}
	if udp6Buf != nil {
		n, data := parseRows(udp6Buf, int(unsafe.Sizeof(mibUdp6RowOwnerPID{})))
		rowSz := int(unsafe.Sizeof(mibUdp6RowOwnerPID{}))
		for i := uint32(0); i < n; i++ {
			off := i * uint32(rowSz)
			if int(off)+rowSz > len(data)+4 {
				break
			}
			row := *(*mibUdp6RowOwnerPID)(unsafe.Pointer(&data[off]))
			entries = append(entries, PortEntry{
				Protocol:  "UDP",
				Family:    "v6",
				LocalAddr: ipv6Str(row.LocalAddr),
				LocalPort: portFromNetOrder(row.LocalPort),
				State:     "STATELESS",
				PID:       row.OwningPid,
			})
		}
	}

	return entries, nil
}
