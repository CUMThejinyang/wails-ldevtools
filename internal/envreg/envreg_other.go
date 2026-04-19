//go:build !windows

package envreg

func ListEnv(scope string) ([]EnvEntry, error)            { return nil, ErrUnsupported }
func GetEnv(scope, name string) (EnvEntry, error)         { return EnvEntry{}, ErrUnsupported }
func SetEnvUser(name, value, valueType string) error      { return ErrUnsupported }
func DeleteEnvUser(name string) error                     { return ErrUnsupported }
func SetEnvSystemBatch(changes []EnvChange) error         { return ErrUnsupported }
func BroadcastEnvChange() error                           { return ErrUnsupported }
func IsElevated() bool                                    { return false }
func ParsePath(scope string) ([]PathSegment, error)       { return nil, ErrUnsupported }
func SavePath(scope string, segments []PathSegment) error { return ErrUnsupported }
func ValidatePath(paths []string) []PathValidation        { return nil }
func ExpandValue(value string) string                     { return value }
func PopulatePathDetails(segments []PathSegment) ([]PathSegment, error) {
	return segments, ErrUnsupported
}
