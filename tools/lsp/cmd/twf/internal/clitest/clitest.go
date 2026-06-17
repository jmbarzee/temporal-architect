// Package clitest provides helpers shared by the twf command tests: stdout
// capture and a working-directory-independent path into the shared testdata
// tree. It is imported only from _test.go files, so it never lands in the
// shipped binary.
package clitest

import (
	"os"
	"path/filepath"
	"runtime"
)

// CaptureStdout runs fn with os.Stdout redirected to a pipe and returns
// everything written to stdout as a string. This lets CLI commands that write
// directly to fmt.Println be tested without subprocess overhead.
func CaptureStdout(fn func()) (string, error) {
	r, w, err := os.Pipe()
	if err != nil {
		return "", err
	}
	old := os.Stdout
	os.Stdout = w

	fn()

	w.Close()
	os.Stdout = old

	var buf [1 << 20]byte
	n, _ := r.Read(buf[:])
	r.Close()
	return string(buf[:n]), nil
}

// Testdata returns the absolute path to a file or directory under
// tools/lsp/cmd/twf/testdata, regardless of the test's working directory.
// The shared fixtures live at the cmd/twf root so every command package's
// tests can reach them without duplicating data.
func Testdata(elem ...string) string {
	_, file, _, _ := runtime.Caller(0)
	// file = .../cmd/twf/internal/clitest/clitest.go → up to cmd/twf, then testdata.
	root := filepath.Join(filepath.Dir(file), "..", "..", "testdata")
	return filepath.Join(append([]string{root}, elem...)...)
}
