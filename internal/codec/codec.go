// Package codec 提供文本和文件的哈希计算能力。
package codec

import (
	"crypto/md5"  //nolint:gosec
	"crypto/sha1" //nolint:gosec
	"crypto/sha256"
	"crypto/sha512"
	"fmt"
	"hash"
	"io"
	"os"
	"strings"
)

// HashText 对 UTF-8 文本计算哈希。
// algo: md5 | sha1 | sha256 | sha512
func HashText(text, algo string) (string, error) {
	h, err := newHash(algo)
	if err != nil {
		return "", err
	}
	h.Write([]byte(text))
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// HashFile 流式读取文件并计算哈希，适合大文件。
func HashFile(path, algo string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h, err := newHash(algo)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

func newHash(algo string) (hash.Hash, error) {
	switch strings.ToLower(algo) {
	case "md5":
		return md5.New(), nil //nolint:gosec
	case "sha1":
		return sha1.New(), nil //nolint:gosec
	case "sha256":
		return sha256.New(), nil
	case "sha512":
		return sha512.New(), nil
	default:
		return nil, fmt.Errorf("不支持的算法: %s", algo)
	}
}
