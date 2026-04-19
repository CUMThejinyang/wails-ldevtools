//go:build !windows

package netstat

import "errors"

var ErrUnsupported = errors.New("port viewer is only supported on Windows")

type PortEntry struct{}

func ListPorts() ([]PortEntry, error) { return nil, ErrUnsupported }
