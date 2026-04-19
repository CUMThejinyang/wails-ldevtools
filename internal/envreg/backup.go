package envreg

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func backupDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".devtools", "env-backup")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

func Snapshot(note string) (BackupMeta, error) {
	userEntries, err := ListEnv(ScopeUser)
	if err != nil {
		return BackupMeta{}, err
	}
	systemEntries, err := ListEnv(ScopeSystem)
	if err != nil {
		return BackupMeta{}, err
	}

	ts := time.Now().Unix()
	hash := sha1.Sum([]byte(fmt.Sprintf("%d|%s|%d|%d", ts, note, len(userEntries), len(systemEntries))))
	id := fmt.Sprintf("%d-%x", ts, hash[:4])
	snapshot := BackupSnapshot{
		Timestamp: ts,
		Note:      note,
		User:      userEntries,
		System:    systemEntries,
	}

	dir, err := backupDir()
	if err != nil {
		return BackupMeta{}, err
	}
	path := filepath.Join(dir, id+".json")
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return BackupMeta{}, err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return BackupMeta{}, err
	}
	_ = pruneBackups(dir)
	return BackupMeta{ID: id, Timestamp: ts, Note: note, UserCount: len(userEntries), SystemCount: len(systemEntries)}, nil
}

func ListBackups() ([]BackupMeta, error) {
	dir, err := backupDir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	backups := make([]BackupMeta, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			backups = append(backups, BackupMeta{ID: id, Corrupt: true})
			continue
		}
		var snapshot BackupSnapshot
		if err := json.Unmarshal(data, &snapshot); err != nil {
			backups = append(backups, BackupMeta{ID: id, Corrupt: true})
			continue
		}
		backups = append(backups, BackupMeta{
			ID:          id,
			Timestamp:   snapshot.Timestamp,
			Note:        snapshot.Note,
			UserCount:   len(snapshot.User),
			SystemCount: len(snapshot.System),
		})
	}

	sort.Slice(backups, func(i, j int) bool { return backups[i].Timestamp > backups[j].Timestamp })
	return backups, nil
}

func DeleteBackup(id string) error {
	path, err := backupFilePath(id)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

func LoadBackup(id string) (BackupSnapshot, error) {
	path, err := backupFilePath(id)
	if err != nil {
		return BackupSnapshot{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return BackupSnapshot{}, err
	}
	var snapshot BackupSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return BackupSnapshot{}, err
	}
	return snapshot, nil
}

func RestoreBackup(id string) BatchSaveResult {
	_, _ = Snapshot("auto-before-restore")
	snapshot, err := LoadBackup(id)
	if err != nil {
		return BatchSaveResult{User: ResultFromError(err), System: OperationResult{Ok: true}}
	}
	changes, err := ChangesFromSnapshot(snapshot)
	if err != nil {
		return BatchSaveResult{User: ResultFromError(err), System: OperationResult{Ok: true}}
	}
	return SaveEnvBatch(changes)
}

func ChangesFromSnapshot(snapshot BackupSnapshot) ([]EnvChange, error) {
	currentUser, err := ListEnv(ScopeUser)
	if err != nil {
		return nil, err
	}
	currentSystem, err := ListEnv(ScopeSystem)
	if err != nil {
		return nil, err
	}

	changes := []EnvChange{}
	changes = append(changes, diffScope(currentUser, snapshot.User, ScopeUser)...)
	changes = append(changes, diffScope(currentSystem, snapshot.System, ScopeSystem)...)
	return changes, nil
}

func SaveEnvBatch(changes []EnvChange) BatchSaveResult {
	userChanges, systemChanges := SplitChangesByScope(changes)
	userResult := OperationResult{Ok: true}
	systemResult := OperationResult{Ok: true}

	for _, change := range userChanges {
		var err error
		if change.Delete {
			err = DeleteEnvUser(change.Name)
		} else {
			err = SetEnvUser(change.Name, change.Value, change.Type)
		}
		if err != nil {
			userResult = ResultFromError(err)
			return MixedScopeBatchResult(userResult, systemResult)
		}
	}

	if len(systemChanges) > 0 {
		systemResult = ResultFromError(SetEnvSystemBatch(systemChanges))
	}
	return MixedScopeBatchResult(userResult, systemResult)
}

func SaveWithSnapshot(note string, changes []EnvChange) (BackupMeta, BatchSaveResult, error) {
	backup, err := Snapshot(note)
	if err != nil {
		return BackupMeta{}, BatchSaveResult{}, err
	}
	return backup, SaveEnvBatch(changes), nil
}

func ExportEnvFile(scope, outPath string) error {
	entries, err := ListEnv(scope)
	if err != nil {
		return err
	}
	var builder strings.Builder
	for _, entry := range entries {
		builder.WriteString(entry.Name)
		builder.WriteString("=")
		builder.WriteString(formatEnvValue(entry.Value))
		builder.WriteString("\n")
	}
	return os.WriteFile(outPath, []byte(builder.String()), 0644)
}

func ImportEnvFile(path, scope string) (ImportPreview, error) {
	scope = NormalizeScope(scope)
	data, err := os.ReadFile(path)
	if err != nil {
		return ImportPreview{}, err
	}
	existing, err := ListEnv(scope)
	if err != nil {
		return ImportPreview{}, err
	}
	typeMap := map[string]string{}
	for _, entry := range existing {
		typeMap[strings.ToLower(entry.Name)] = entry.Type
	}

	preview := ImportPreview{Changes: []EnvChange{}, Errors: []ImportError{}}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	for i, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx <= 0 {
			preview.Errors = append(preview.Errors, ImportError{Line: i + 1, Raw: raw, Reason: "语法错误"})
			continue
		}
		name := strings.TrimSpace(line[:idx])
		value := parseEnvValue(strings.TrimSpace(line[idx+1:]))
		valueType := typeMap[strings.ToLower(name)]
		if valueType == "" {
			valueType = InferType(value)
		}
		preview.Changes = append(preview.Changes, EnvChange{
			Name:  name,
			Value: value,
			Type:  valueType,
			Scope: scope,
		})
	}
	return preview, nil
}

func ImportEnvFileCommit(preview ImportPreview) BatchSaveResult {
	return SaveEnvBatch(preview.Changes)
}

func CurrentPathSegments() ([]PathSegment, error) {
	systemSegments, err := ParsePath(ScopeSystem)
	if err != nil {
		return nil, err
	}
	userSegments, err := ParsePath(ScopeUser)
	if err != nil {
		return nil, err
	}
	return append(systemSegments, userSegments...), nil
}

func SavePathSegments(segments []PathSegment) BatchSaveResult {
	current, err := CurrentPathSegments()
	if err != nil {
		return BatchSaveResult{User: ResultFromError(err), System: OperationResult{Ok: true}}
	}

	userCurrent := scopedPathSegments(current, ScopeUser)
	userNext := scopedPathSegments(segments, ScopeUser)
	systemCurrent := scopedPathSegments(current, ScopeSystem)
	systemNext := scopedPathSegments(segments, ScopeSystem)

	userResult := OperationResult{Ok: true}
	if joinPathSegments(userCurrent) != joinPathSegments(userNext) || containsScope(current, ScopeUser) {
		userResult = ResultFromError(SavePath(ScopeUser, userNext))
	}

	systemResult := OperationResult{Ok: true}
	if joinPathSegments(systemCurrent) != joinPathSegments(systemNext) || containsScope(current, ScopeSystem) {
		systemResult = ResultFromError(SavePath(ScopeSystem, systemNext))
	}

	return MixedScopeBatchResult(userResult, systemResult)
}

func scopedPathSegments(segments []PathSegment, scope string) []PathSegment {
	result := make([]PathSegment, 0)
	for _, segment := range segments {
		if NormalizeScope(segment.Scope) == scope {
			result = append(result, segment)
		}
	}
	return result
}

func PathChangesFromSegments(current, next []PathSegment) []EnvChange {
	userNext := make([]PathSegment, 0)
	systemNext := make([]PathSegment, 0)
	for _, segment := range next {
		switch NormalizeScope(segment.Scope) {
		case ScopeUser:
			userNext = append(userNext, segment)
		case ScopeSystem:
			systemNext = append(systemNext, segment)
		}
	}

	changes := []EnvChange{}
	if len(systemNext) > 0 || containsScope(current, ScopeSystem) {
		changes = append(changes, EnvChange{Name: "Path", Scope: ScopeSystem, Type: TypeExpandSZ, Value: joinPathSegments(systemNext)})
	}
	if len(userNext) > 0 || containsScope(current, ScopeUser) {
		changes = append(changes, EnvChange{Name: "Path", Scope: ScopeUser, Type: TypeExpandSZ, Value: joinPathSegments(userNext)})
	}
	return changes
}

func AllEnvEntries() ([]EnvEntry, error) {
	userEntries, err := ListEnv(ScopeUser)
	if err != nil {
		return nil, err
	}
	systemEntries, err := ListEnv(ScopeSystem)
	if err != nil {
		return nil, err
	}
	return append(systemEntries, userEntries...), nil
}

func HighRiskVariables() []string {
	return []string{"Path", "PATHEXT", "TEMP", "TMP", "ComSpec", "windir", "SystemRoot", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "NUMBER_OF_PROCESSORS"}
}

func diffScope(current, target []EnvEntry, scope string) []EnvChange {
	currentMap := map[string]EnvEntry{}
	for _, entry := range current {
		currentMap[strings.ToLower(entry.Name)] = entry
	}
	targetMap := map[string]EnvEntry{}
	for _, entry := range target {
		targetMap[strings.ToLower(entry.Name)] = entry
	}

	changes := make([]EnvChange, 0, len(current)+len(target))
	for key, entry := range currentMap {
		if _, ok := targetMap[key]; !ok {
			changes = append(changes, EnvChange{Name: entry.Name, Scope: scope, Delete: true})
		}
	}
	for _, entry := range target {
		cur, ok := currentMap[strings.ToLower(entry.Name)]
		if !ok || cur.Value != entry.Value || NormalizeType(cur.Type) != NormalizeType(entry.Type) {
			changes = append(changes, EnvChange{Name: entry.Name, Value: entry.Value, Type: entry.Type, Scope: scope})
		}
	}
	return changes
}

func containsScope(segments []PathSegment, scope string) bool {
	for _, segment := range segments {
		if NormalizeScope(segment.Scope) == scope {
			return true
		}
	}
	return false
}

func joinPathSegments(segments []PathSegment) string {
	parts := make([]string, 0, len(segments))
	for _, segment := range segments {
		if strings.TrimSpace(segment.Raw) != "" {
			parts = append(parts, segment.Raw)
		}
	}
	return strings.Join(parts, ";")
}

func backupFilePath(id string) (string, error) {
	dir, err := backupDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, id+".json"), nil
}

func pruneBackups(dir string) error {
	backups, err := ListBackups()
	if err != nil {
		return err
	}
	for i := 10; i < len(backups); i++ {
		_ = os.Remove(filepath.Join(dir, backups[i].ID+".json"))
	}
	return nil
}

func formatEnvValue(value string) string {
	if strings.ContainsAny(value, "\n\r\"") {
		replacer := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\r", `\r`)
		return `"` + replacer.Replace(value) + `"`
	}
	return value
}

func parseEnvValue(value string) string {
	if len(value) >= 2 && strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) {
		value = strings.TrimSuffix(strings.TrimPrefix(value, `"`), `"`)
		replacer := strings.NewReplacer(`\n`, "\n", `\r`, "\r", `\"`, `"`, `\\`, `\`)
		return replacer.Replace(value)
	}
	return value
}
