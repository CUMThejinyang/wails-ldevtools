package httpserver

import "sync"

// RingBuffer 固定容量环形缓冲，线程安全
type RingBuffer struct {
	mu    sync.Mutex
	buf   []LogEntry
	size  int
	head  int
	count int
}

func NewRingBuffer(size int) *RingBuffer {
	return &RingBuffer{
		buf:  make([]LogEntry, size),
		size: size,
	}
}

func (r *RingBuffer) Push(entry LogEntry) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.buf[r.head] = entry
	r.head = (r.head + 1) % r.size
	if r.count < r.size {
		r.count++
	}
}

func (r *RingBuffer) Snapshot(n int) []LogEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	if n > r.count {
		n = r.count
	}
	result := make([]LogEntry, n)
	for i := 0; i < n; i++ {
		idx := (r.head - n + i + r.size) % r.size
		result[i] = r.buf[idx]
	}
	return result
}
