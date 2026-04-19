//go:build !windows

package procutil

import (
	"errors"

	"devtools/internal/netstat"
)

var ErrUnsupported = errors.New("process utilities are only supported on Windows")

type PortEntryWithProc struct{}
type ProcessInfo struct{}

func QueryProcessInfo(_ uint32) ProcessInfo                 { return ProcessInfo{} }
func EnrichPorts(_ []netstat.PortEntry) []PortEntryWithProc { return nil }
func KillProcess(_ uint32) error                            { return ErrUnsupported }
func KillProcesses(_ []uint32) error                        { return ErrUnsupported }
func IsElevated() bool                                      { return false }
func OpenInBrowser(_ string) error                          { return ErrUnsupported }
