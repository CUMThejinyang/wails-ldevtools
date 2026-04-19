//go:build windows

package envreg

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	userEnvKey   = `Environment`
	systemEnvKey = `SYSTEM\CurrentControlSet\Control\Session Manager\Environment`
)

var (
	kernel32DLL            = windows.NewLazySystemDLL("kernel32.dll")
	user32DLL              = windows.NewLazySystemDLL("user32.dll")
	shell32DLL             = windows.NewLazySystemDLL("shell32.dll")
	procExpandEnvironment  = kernel32DLL.NewProc("ExpandEnvironmentStringsW")
	procSendMessageTimeout = user32DLL.NewProc("SendMessageTimeoutW")
	procShellExecuteEx     = shell32DLL.NewProc("ShellExecuteExW")
	procIsUserAnAdmin      = shell32DLL.NewProc("IsUserAnAdmin")
)

type shellExecuteInfo struct {
	cbSize       uint32
	fMask        uint32
	hwnd         uintptr
	lpVerb       *uint16
	lpFile       *uint16
	lpParameters *uint16
	lpDirectory  *uint16
	nShow        int32
	hInstApp     uintptr
	lpIDList     uintptr
	lpClass      *uint16
	hkeyClass    uintptr
	dwHotKey     uint32
	hIcon        uintptr
	hProcess     windows.Handle
}

func registryKeyForScope(scope string) (registry.Key, string, error) {
	switch NormalizeScope(scope) {
	case ScopeUser:
		return registry.CURRENT_USER, userEnvKey, nil
	case ScopeSystem:
		return registry.LOCAL_MACHINE, systemEnvKey, nil
	default:
		return 0, "", fmt.Errorf("unsupported env scope: %s", scope)
	}
}

func ListEnv(scope string) ([]EnvEntry, error) {
	base, path, err := registryKeyForScope(scope)
	if err != nil {
		return nil, err
	}

	key, err := registry.OpenKey(base, path, registry.QUERY_VALUE)
	if err != nil {
		return nil, err
	}
	defer key.Close()

	names, err := key.ReadValueNames(0)
	if err != nil {
		return nil, err
	}

	entries := make([]EnvEntry, 0, len(names))
	for _, name := range names {
		value, valueType, err := readValue(key, name)
		if err != nil {
			continue
		}
		entries = append(entries, EnvEntry{
			Name:  name,
			Value: value,
			Type:  valueType,
			Scope: NormalizeScope(scope),
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries, nil
}

func GetEnv(scope, name string) (EnvEntry, error) {
	base, path, err := registryKeyForScope(scope)
	if err != nil {
		return EnvEntry{}, err
	}

	key, err := registry.OpenKey(base, path, registry.QUERY_VALUE)
	if err != nil {
		return EnvEntry{}, err
	}
	defer key.Close()

	value, valueType, err := readValue(key, name)
	if err != nil {
		return EnvEntry{}, err
	}

	return EnvEntry{
		Name:  name,
		Value: value,
		Type:  valueType,
		Scope: NormalizeScope(scope),
	}, nil
}

func SetEnvUser(name, value, valueType string) error {
	key, err := registry.OpenKey(registry.CURRENT_USER, userEnvKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()

	switch NormalizeType(valueType) {
	case TypeExpandSZ:
		return key.SetExpandStringValue(name, value)
	default:
		return key.SetStringValue(name, value)
	}
}

func DeleteEnvUser(name string) error {
	key, err := registry.OpenKey(registry.CURRENT_USER, userEnvKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	return key.DeleteValue(name)
}

func SetEnvSystemBatch(changes []EnvChange) error {
	if len(changes) == 0 {
		return nil
	}

	regFile, err := writeSystemRegFile(changes)
	if err != nil {
		return err
	}
	defer os.Remove(regFile)

	verb, err := windows.UTF16PtrFromString("runas")
	if err != nil {
		return err
	}
	file, err := windows.UTF16PtrFromString("regedit.exe")
	if err != nil {
		return err
	}
	params, err := windows.UTF16PtrFromString(`/s "` + regFile + `"`)
	if err != nil {
		return err
	}

	const (
		seeMaskNoCloseProcess = 0x00000040
		swHide                = 0
	)
	info := shellExecuteInfo{
		cbSize:       uint32(unsafe.Sizeof(shellExecuteInfo{})),
		fMask:        seeMaskNoCloseProcess,
		lpVerb:       verb,
		lpFile:       file,
		lpParameters: params,
		nShow:        swHide,
	}

	ret, _, callErr := procShellExecuteEx.Call(uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		if errno, ok := callErr.(windows.Errno); ok && errno == 1223 {
			return ErrUserCancelled
		}
		if callErr != windows.ERROR_SUCCESS && callErr != nil {
			return callErr
		}
		return fmt.Errorf("failed to elevate system env update")
	}
	if info.hProcess == 0 {
		return fmt.Errorf("failed to capture elevated process handle")
	}
	defer windows.CloseHandle(info.hProcess)

	if _, err := windows.WaitForSingleObject(info.hProcess, windows.INFINITE); err != nil {
		return err
	}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(info.hProcess, &exitCode); err != nil {
		return err
	}
	if exitCode != 0 {
		return fmt.Errorf("regedit exited with code %d", exitCode)
	}
	return nil
}

func BroadcastEnvChange() error {
	msg, err := windows.UTF16PtrFromString("Environment")
	if err != nil {
		return err
	}
	const (
		hwndBroadcast   = 0xffff
		wmSettingChange = 0x001A
		smtoAbortIfHung = 0x0002
	)
	ret, _, callErr := procSendMessageTimeout.Call(
		hwndBroadcast,
		wmSettingChange,
		0,
		uintptr(unsafe.Pointer(msg)),
		smtoAbortIfHung,
		5000,
		0,
	)
	if ret == 0 && callErr != windows.ERROR_SUCCESS {
		return callErr
	}
	return nil
}

func IsElevated() bool {
	ret, _, _ := procIsUserAnAdmin.Call()
	return ret != 0
}

func ParsePath(scope string) ([]PathSegment, error) {
	entry, err := GetEnv(scope, "Path")
	if err != nil {
		if isNotExistErr(err) {
			return []PathSegment{}, nil
		}
		return nil, err
	}

	parts := strings.Split(entry.Value, ";")
	segments := make([]PathSegment, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		segments = append(segments, PathSegment{Raw: trimmed, Scope: entry.Scope, DuplicateOf: -1})
	}
	return PopulatePathDetails(segments)
}

func SavePath(scope string, segments []PathSegment) error {
	joined := make([]string, 0, len(segments))
	for _, seg := range segments {
		if strings.TrimSpace(seg.Raw) == "" {
			continue
		}
		joined = append(joined, seg.Raw)
	}

	entryType := TypeSZ
	if entry, err := GetEnv(scope, "Path"); err == nil {
		entryType = entry.Type
	}
	change := EnvChange{Name: "Path", Value: strings.Join(joined, ";"), Type: entryType, Scope: NormalizeScope(scope)}
	if NormalizeScope(scope) == ScopeUser {
		return SetEnvUser(change.Name, change.Value, change.Type)
	}
	return SetEnvSystemBatch([]EnvChange{change})
}

func ValidatePath(paths []string) []PathValidation {
	results := make([]PathValidation, len(paths))
	sem := make(chan struct{}, 10)
	var wg sync.WaitGroup

	for i, pathValue := range paths {
		wg.Add(1)
		go func(idx int, raw string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			expanded := ExpandValue(raw)
			info, err := os.Stat(expanded)
			results[idx] = PathValidation{
				Path:          raw,
				ExpandedValue: expanded,
				Exists:        err == nil,
				IsDir:         err == nil && info.IsDir(),
			}
		}(i, pathValue)
	}
	wg.Wait()
	return results
}

func ExpandValue(value string) string {
	if value == "" {
		return ""
	}
	in, err := windows.UTF16PtrFromString(value)
	if err != nil {
		return value
	}
	buf := make([]uint16, 32768)
	ret, _, _ := procExpandEnvironment.Call(
		uintptr(unsafe.Pointer(in)),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
	)
	if ret == 0 {
		return value
	}
	count := int(ret)
	if count > len(buf) {
		count = len(buf)
	}
	if count > 0 && buf[count-1] == 0 {
		count--
	}
	return windows.UTF16ToString(buf[:count])
}

func PopulatePathDetails(segments []PathSegment) ([]PathSegment, error) {
	paths := make([]string, len(segments))
	for i, segment := range segments {
		paths[i] = segment.Raw
	}
	validations := ValidatePath(paths)
	seen := map[string]int{}
	for i := range segments {
		segments[i].Expanded = validations[i].ExpandedValue
		segments[i].Exists = validations[i].Exists
		segments[i].IsDir = validations[i].IsDir
		key := strings.ToLower(filepath.Clean(strings.TrimSpace(segments[i].Raw)))
		if first, ok := seen[key]; ok {
			segments[i].DuplicateOf = first
		} else {
			segments[i].DuplicateOf = -1
			seen[key] = i
		}
	}
	return segments, nil
}

func readValue(key registry.Key, name string) (string, string, error) {
	_, valueType, err := key.GetValue(name, nil)
	if err != nil {
		return "", "", err
	}

	switch valueType {
	case registry.SZ:
		value, _, err := key.GetStringValue(name)
		return value, TypeSZ, err
	case registry.EXPAND_SZ:
		value, _, err := key.GetStringValue(name)
		return value, TypeExpandSZ, err
	default:
		return "", "", fmt.Errorf("unsupported registry value type for %s", name)
	}
}

func writeSystemRegFile(changes []EnvChange) (string, error) {
	file, err := os.CreateTemp("", "devtools-env-*.reg")
	if err != nil {
		return "", err
	}
	defer file.Close()

	utf16Content := utf16.Encode([]rune(buildRegContent(changes)))
	bytes := []byte{0xFF, 0xFE}
	for _, r := range utf16Content {
		bytes = append(bytes, byte(r), byte(r>>8))
	}
	if _, err := file.Write(bytes); err != nil {
		return "", err
	}
	return file.Name(), nil
}

func buildRegContent(changes []EnvChange) string {
	var builder strings.Builder
	builder.WriteString("Windows Registry Editor Version 5.00\r\n\r\n")
	builder.WriteString(`[HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\Environment]`)
	builder.WriteString("\r\n")
	for _, change := range changes {
		name := escapeRegString(change.Name)
		if change.Delete {
			builder.WriteString(fmt.Sprintf(`"%s"=-`, name))
			builder.WriteString("\r\n")
			continue
		}
		encoded := escapeRegString(change.Value)
		if NormalizeType(change.Type) == TypeExpandSZ {
			builder.WriteString(fmt.Sprintf(`"%s"=hex(2):%s`, name, encodeRegExpandString(change.Value)))
		} else {
			builder.WriteString(fmt.Sprintf(`"%s"="%s"`, name, encoded))
		}
		builder.WriteString("\r\n")
	}
	return builder.String()
}

func escapeRegString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	return value
}

func encodeRegExpandString(value string) string {
	encoded := utf16.Encode([]rune(value + "\x00"))
	parts := make([]string, 0, len(encoded)*2)
	for _, r := range encoded {
		parts = append(parts, fmt.Sprintf("%02x", byte(r)))
		parts = append(parts, fmt.Sprintf("%02x", byte(r>>8)))
	}
	return strings.Join(parts, ",")
}

func isNotExistErr(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(strings.ToLower(err.Error()), "cannot find") || strings.Contains(strings.ToLower(err.Error()), "not exist")
}
