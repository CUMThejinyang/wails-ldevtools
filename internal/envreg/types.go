package envreg

import (
	"errors"
	"strings"
)

const (
	ScopeUser   = "user"
	ScopeSystem = "system"

	TypeSZ       = "sz"
	TypeExpandSZ = "expand_sz"
)

var (
	ErrUnsupported   = errors.New("env editor is only supported on Windows")
	ErrUserCancelled = errors.New("user cancelled elevation request")
)

type EnvEntry struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	Type  string `json:"type"`
	Scope string `json:"scope"`
}

type EnvChange struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Type   string `json:"type"`
	Scope  string `json:"scope"`
	Delete bool   `json:"delete"`
}

type OperationResult struct {
	Ok        bool   `json:"ok"`
	Cancelled bool   `json:"cancelled,omitempty"`
	Error     string `json:"error,omitempty"`
}

type BatchSaveResult struct {
	User   OperationResult `json:"user"`
	System OperationResult `json:"system"`
}

func (r BatchSaveResult) Ok() bool {
	return r.User.Ok && r.System.Ok
}

func (r BatchSaveResult) HasPartialFailure() bool {
	return (r.User.Ok && !r.System.Ok) || (!r.User.Ok && r.System.Ok)
}

func (r BatchSaveResult) HasCancellation() bool {
	return r.User.Cancelled || r.System.Cancelled
}

func (r BatchSaveResult) ErrorMessage() string {
	parts := []string{}
	if r.User.Error != "" {
		parts = append(parts, "用户变量: "+r.User.Error)
	}
	if r.System.Error != "" {
		parts = append(parts, "系统变量: "+r.System.Error)
	}
	return strings.Join(parts, "；")
}

func SuccessBatchResult() BatchSaveResult {
	return BatchSaveResult{User: OperationResult{Ok: true}, System: OperationResult{Ok: true}}
}

func SingleScopeBatchResult(scope string, result OperationResult) BatchSaveResult {
	if NormalizeScope(scope) == ScopeSystem {
		return BatchSaveResult{User: OperationResult{Ok: true}, System: result}
	}
	return BatchSaveResult{User: result, System: OperationResult{Ok: true}}
}

func MixedScopeBatchResult(userResult, systemResult OperationResult) BatchSaveResult {
	return BatchSaveResult{User: userResult, System: systemResult}
}

func ResultCancelled(err error) bool {
	return errors.Is(err, ErrUserCancelled)
}

func ResultError(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func ScopeOfChanges(changes []EnvChange) string {
	scope := ""
	for _, change := range changes {
		normalized := NormalizeScope(change.Scope)
		if normalized == "" {
			continue
		}
		if scope == "" {
			scope = normalized
			continue
		}
		if scope != normalized {
			return "mixed"
		}
	}
	return scope
}

func SplitChangesByScope(changes []EnvChange) (userChanges, systemChanges []EnvChange) {
	for _, change := range changes {
		switch NormalizeScope(change.Scope) {
		case ScopeUser:
			userChanges = append(userChanges, change)
		case ScopeSystem:
			systemChanges = append(systemChanges, change)
		}
	}
	return userChanges, systemChanges
}

type PathSegment struct {
	Raw         string `json:"raw"`
	Expanded    string `json:"expanded"`
	Scope       string `json:"scope"`
	Exists      bool   `json:"exists"`
	IsDir       bool   `json:"isDir"`
	DuplicateOf int    `json:"duplicateOf"`
}

type PathValidation struct {
	Path          string `json:"path"`
	ExpandedValue string `json:"expandedValue"`
	Exists        bool   `json:"exists"`
	IsDir         bool   `json:"isDir"`
}

type BackupMeta struct {
	ID          string `json:"id"`
	Timestamp   int64  `json:"timestamp"`
	Note        string `json:"note,omitempty"`
	UserCount   int    `json:"userCount"`
	SystemCount int    `json:"systemCount"`
	Corrupt     bool   `json:"corrupt,omitempty"`
}

type BackupSnapshot struct {
	Timestamp int64      `json:"timestamp"`
	Note      string     `json:"note,omitempty"`
	User      []EnvEntry `json:"user"`
	System    []EnvEntry `json:"system"`
}

type ImportError struct {
	Line   int    `json:"line"`
	Raw    string `json:"raw"`
	Reason string `json:"reason"`
}

type ImportPreview struct {
	Changes []EnvChange   `json:"changes"`
	Errors  []ImportError `json:"errors"`
}

func NormalizeScope(scope string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case ScopeUser:
		return ScopeUser
	case ScopeSystem:
		return ScopeSystem
	default:
		return ""
	}
}

func NormalizeType(valueType string) string {
	switch strings.ToLower(strings.TrimSpace(valueType)) {
	case TypeExpandSZ:
		return TypeExpandSZ
	case TypeSZ:
		return TypeSZ
	default:
		return TypeSZ
	}
}

func InferType(value string) string {
	if strings.Contains(value, "%") {
		parts := strings.Split(value, "%")
		if len(parts) >= 3 {
			for i := 1; i < len(parts); i += 2 {
				if parts[i] != "" {
					return TypeExpandSZ
				}
			}
		}
	}
	return TypeSZ
}

func ResultFromError(err error) OperationResult {
	if err == nil {
		return OperationResult{Ok: true}
	}
	if errors.Is(err, ErrUserCancelled) {
		return OperationResult{Ok: false, Cancelled: true}
	}
	return OperationResult{Ok: false, Error: err.Error()}
}
