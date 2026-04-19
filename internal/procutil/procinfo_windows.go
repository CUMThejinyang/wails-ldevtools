//go:build windows

package procutil

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"

	"devtools/internal/netstat"
)

type ProcessInfo struct {
	Name    string `json:"name"`
	ExePath string `json:"exePath"`
	PID     uint32 `json:"pid"`
}

var (
	modkernel32                    = windows.NewLazySystemDLL("kernel32.dll")
	modpsapi                       = windows.NewLazySystemDLL("psapi.dll")
	procOpenProcess                = modkernel32.NewProc("OpenProcess")
	procQueryFullProcessImageNameW = modkernel32.NewProc("QueryFullProcessImageNameW")
	procGetModuleBaseNameW         = modpsapi.NewProc("GetModuleBaseNameW")
	procQueryDosDeviceW            = modkernel32.NewProc("QueryDosDeviceW")

	dosDeviceMap     map[string]string
	dosDeviceMapOnce sync.Once
)

const processQueryLimitedInfo = 0x1000

var systemProcessNames = map[uint32]string{
	0: "System Idle Process",
	4: "System",
}

func buildDosDeviceMap() {
	dosDeviceMap = make(map[string]string)
	for _, drive := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
		devName := string(drive) + ":"
		var target [512]uint16
		ret, _, _ := procQueryDosDeviceW.Call(
			uintptr(unsafe.Pointer(windows.StringToUTF16Ptr(devName))),
			uintptr(unsafe.Pointer(&target[0])),
			512,
		)
		if ret != 0 {
			dosDeviceMap[windows.UTF16ToString(target[:ret])] = devName
		}
	}
}

func ntPathToDosPath(ntPath string) string {
	dosDeviceMapOnce.Do(buildDosDeviceMap)
	for ntPrefix, driveLetter := range dosDeviceMap {
		if strings.HasPrefix(strings.ToLower(ntPath), strings.ToLower(ntPrefix)) {
			return driveLetter + ntPath[len(ntPrefix):]
		}
	}
	return ntPath
}

func QueryProcessInfo(pid uint32) ProcessInfo {
	if name, ok := systemProcessNames[pid]; ok {
		return ProcessInfo{Name: name, ExePath: "-", PID: pid}
	}

	handle, _, _ := procOpenProcess.Call(processQueryLimitedInfo, 0, uintptr(pid))
	if handle == 0 {
		return ProcessInfo{Name: fmt.Sprintf("PID %d", pid), ExePath: "-", PID: pid}
	}
	defer windows.CloseHandle(windows.Handle(handle))

	var exePath [1024]uint16
	exePathLen := uint32(1024)
	procQueryFullProcessImageNameW.Call(
		handle, 0,
		uintptr(unsafe.Pointer(&exePath[0])),
		uintptr(unsafe.Pointer(&exePathLen)),
	)
	path := windows.UTF16ToString(exePath[:exePathLen])
	if path != "" {
		path = ntPathToDosPath(path)
	}

	var baseName [256]uint16
	ret, _, _ := procGetModuleBaseNameW.Call(handle, 0, uintptr(unsafe.Pointer(&baseName[0])), 256)
	name := "unknown"
	if ret != 0 {
		name = windows.UTF16ToString(baseName[:ret])
	} else if path != "" && path != "-" {
		name = filepath.Base(path)
	}

	if path == "" {
		path = "-"
	}
	return ProcessInfo{Name: name, ExePath: path, PID: pid}
}

type PortEntryWithProc struct {
	Protocol    string `json:"protocol"`
	Family      string `json:"family"`
	LocalAddr   string `json:"localAddr"`
	LocalPort   uint16 `json:"localPort"`
	RemoteAddr  string `json:"remoteAddr"`
	RemotePort  uint16 `json:"remotePort"`
	State       string `json:"state"`
	PID         uint32 `json:"pid"`
	ProcessName string `json:"processName"`
	ExePath     string `json:"exePath"`
}

func EnrichPorts(entries []netstat.PortEntry) []PortEntryWithProc {
	cache := make(map[uint32]ProcessInfo)
	result := make([]PortEntryWithProc, len(entries))
	for i, e := range entries {
		info, ok := cache[e.PID]
		if !ok {
			info = QueryProcessInfo(e.PID)
			cache[e.PID] = info
		}
		result[i] = PortEntryWithProc{
			Protocol:    e.Protocol,
			Family:      e.Family,
			LocalAddr:   e.LocalAddr,
			LocalPort:   e.LocalPort,
			RemoteAddr:  e.RemoteAddr,
			RemotePort:  e.RemotePort,
			State:       e.State,
			PID:         e.PID,
			ProcessName: info.Name,
			ExePath:     info.ExePath,
		}
	}
	return result
}
