//go:build windows

package procutil

import (
	"fmt"
	"os"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modshell32        = windows.NewLazySystemDLL("shell32.dll")
	procShellExecuteW = modshell32.NewProc("ShellExecuteW")
)

var ErrUserCancelled = fmt.Errorf("用户取消了权限请求")

// IsElevated checks if the current process is running as administrator.
func IsElevated() bool {
	var sid *windows.SID
	err := windows.AllocateAndInitializeSid(
		&windows.SECURITY_NT_AUTHORITY,
		2,
		windows.SECURITY_BUILTIN_DOMAIN_RID,
		windows.DOMAIN_ALIAS_RID_ADMINS,
		0, 0, 0, 0, 0, 0,
		&sid,
	)
	if err != nil {
		return false
	}
	defer windows.FreeSid(sid)
	token := windows.Token(0)
	member, err := token.IsMember(sid)
	if err != nil {
		return false
	}
	return member
}

func KillProcess(pid uint32) error {
	if IsElevated() {
		p, err := os.FindProcess(int(pid))
		if err != nil {
			return fmt.Errorf("进程不存在 (PID %d): %w", pid, err)
		}
		if err := p.Kill(); err != nil {
			return fmt.Errorf("结束进程失败 (PID %d): %w", pid, err)
		}
		return nil
	}
	return shellExecuteRunas("taskkill.exe", fmt.Sprintf("/F /PID %d", pid))
}

func KillProcesses(pids []uint32) error {
	if IsElevated() {
		var errs []string
		for _, pid := range pids {
			p, err := os.FindProcess(int(pid))
			if err != nil {
				errs = append(errs, fmt.Sprintf("PID %d: 进程不存在", pid))
				continue
			}
			if err := p.Kill(); err != nil {
				errs = append(errs, fmt.Sprintf("PID %d: %v", pid, err))
			}
		}
		if len(errs) > 0 {
			return fmt.Errorf("部分失败: %s", strings.Join(errs, "; "))
		}
		return nil
	}

	const batchSize = 200
	var errs []string
	for i := 0; i < len(pids); i += batchSize {
		end := i + batchSize
		if end > len(pids) {
			end = len(pids)
		}
		args := "/F"
		for _, pid := range pids[i:end] {
			args += fmt.Sprintf(" /PID %d", pid)
		}
		if err := shellExecuteRunas("taskkill.exe", args); err != nil {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("部分失败: %s", strings.Join(errs, "; "))
	}
	return nil
}

func shellExecuteRunas(exe, args string) error {
	verbPtr, _ := windows.UTF16PtrFromString("runas")
	exePtr, _ := windows.UTF16PtrFromString(exe)
	argsPtr, _ := windows.UTF16PtrFromString(args)

	ret, _, err := procShellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verbPtr)),
		uintptr(unsafe.Pointer(exePtr)),
		uintptr(unsafe.Pointer(argsPtr)),
		0,
		windows.SW_HIDE,
	)
	if ret <= 32 {
		if err != nil {
			if errno, ok := err.(windows.Errno); ok && errno == 1223 {
				return ErrUserCancelled
			}
		}
		return fmt.Errorf("ShellExecute 失败: %v (ret=%d)", err, ret)
	}
	return nil
}

func OpenInBrowser(url string) error {
	openPtr, _ := windows.UTF16PtrFromString("open")
	urlPtr, _ := windows.UTF16PtrFromString(url)

	ret, _, err := procShellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(openPtr)),
		uintptr(unsafe.Pointer(urlPtr)),
		0, 0,
		windows.SW_SHOWNORMAL,
	)
	if ret <= 32 {
		return fmt.Errorf("打开浏览器失败: %v", err)
	}
	return nil
}
