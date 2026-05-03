package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

var (
	testBinPath string
	testBinErr  error
	testBinOnce sync.Once
)

func buildTestBinary(t *testing.T) string {
	t.Helper()
	testBinOnce.Do(func() {
		dir, err := os.MkdirTemp("", "explorer-cli-test-")
		if err != nil {
			testBinErr = err
			return
		}
		bin := filepath.Join(dir, "explorer")
		cmd := exec.Command("go", "build", "-o", bin, ".")
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			testBinErr = errors.New("go build failed: " + err.Error() + "\n" + stderr.String())
			return
		}
		testBinPath = bin
	})
	if testBinErr != nil {
		t.Fatalf("build binary: %v", testBinErr)
	}
	return testBinPath
}

type syncBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuffer) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

// runServerUntilURL spawns the binary, waits until stdout contains "http://" (or
// times out), sends SIGINT for graceful shutdown, waits, and returns stdout/stderr.
func runServerUntilURL(t *testing.T, args ...string) (stdout, stderr string) {
	t.Helper()
	bin := buildTestBinary(t)
	cmd := exec.Command(bin, args...)
	var sout, serr syncBuffer
	cmd.Stdout = &sout
	cmd.Stderr = &serr
	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(sout.String(), "http://") {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !strings.Contains(sout.String(), "http://") {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		t.Fatalf("server never printed URL within 5s\nstdout: %s\nstderr: %s", sout.String(), serr.String())
	}
	if err := cmd.Process.Signal(syscall.SIGINT); err != nil {
		t.Fatalf("sigint: %v", err)
	}
	waitDone := make(chan error, 1)
	go func() { waitDone <- cmd.Wait() }()
	select {
	case err := <-waitDone:
		if err != nil {
			t.Fatalf("expected graceful exit, got %v\nstdout: %s\nstderr: %s", err, sout.String(), serr.String())
		}
	case <-time.After(5 * time.Second):
		_ = cmd.Process.Kill()
		t.Fatalf("server did not shut down within 5s after SIGINT\nstdout: %s", sout.String())
	}
	return sout.String(), serr.String()
}

// runOnce runs the binary, captures output, and returns exit code + stdout + stderr.
func runOnce(t *testing.T, args ...string) (exit int, stdout, stderr string) {
	t.Helper()
	bin := buildTestBinary(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...)
	var sout, serr bytes.Buffer
	cmd.Stdout = &sout
	cmd.Stderr = &serr
	err := cmd.Run()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return exitErr.ExitCode(), sout.String(), serr.String()
		}
		t.Fatalf("run: %v", err)
	}
	return 0, sout.String(), serr.String()
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

func TestPlaygroundBannerLoopback(t *testing.T) {
	dir := t.TempDir()
	stdout, _ := runServerUntilURL(t, dir, "--host", "127.0.0.1", "--port", "0")
	if got := firstLine(stdout); got != playgroundBanner {
		t.Fatalf("first stdout line = %q, want %q\nfull stdout:\n%s", got, playgroundBanner, stdout)
	}
	if !strings.Contains(stdout, "explorer serving") {
		t.Errorf("expected stdout to contain \"explorer serving\", got:\n%s", stdout)
	}
	if !strings.Contains(stdout, "http://127.0.0.1:") {
		t.Errorf("expected stdout to contain \"http://127.0.0.1:\", got:\n%s", stdout)
	}
	if strings.Contains(stdout, "host is not loopback") {
		t.Errorf("expected no non-loopback warning on loopback host, got:\n%s", stdout)
	}
}

func TestPlaygroundBannerNonLoopback(t *testing.T) {
	dir := t.TempDir()
	stdout, _ := runServerUntilURL(t, dir, "--host", "0.0.0.0", "--port", "0")
	if got := firstLine(stdout); got != playgroundBanner {
		t.Fatalf("first stdout line = %q, want %q\nfull stdout:\n%s", got, playgroundBanner, stdout)
	}
	bannerIdx := strings.Index(stdout, playgroundBanner)
	warnIdx := strings.Index(stdout, "host is not loopback")
	if warnIdx < 0 {
		t.Fatalf("expected non-loopback warning, got:\n%s", stdout)
	}
	if bannerIdx >= warnIdx {
		t.Errorf("playground banner must appear strictly before non-loopback warning\nstdout:\n%s", stdout)
	}
}

func TestMissingDirArgPrintsFooter(t *testing.T) {
	exit, _, stderr := runOnce(t)
	if exit == 0 {
		t.Fatalf("expected non-zero exit on missing dir arg, got 0\nstderr:\n%s", stderr)
	}
	footer := "Playground tool — no auth, no security audit. Bind to loopback unless you trust your network."
	collapsed := strings.Join(strings.Fields(stderr), " ")
	if c := strings.Count(collapsed, footer); c != 1 {
		t.Errorf("expected footer text exactly once in stderr, got %d occurrences\ncollapsed stderr: %s\nraw stderr:\n%s", c, collapsed, stderr)
	}
}

func TestHelpFlagPrintsFooter(t *testing.T) {
	_, _, stderr := runOnce(t, "--help")
	const usagePrefix = "Usage: explorer <dir> [--port PORT] [--host HOST]"
	if !strings.Contains(stderr, usagePrefix) {
		t.Fatalf("expected Usage line in stderr, got:\n%s", stderr)
	}
	lines := strings.Split(stderr, "\n")
	usageIdx := -1
	for i, ln := range lines {
		if strings.HasPrefix(ln, "Usage: explorer") {
			usageIdx = i
			break
		}
	}
	if usageIdx == -1 || usageIdx+2 >= len(lines) {
		t.Fatalf("could not locate Usage line followed by two footer lines in stderr:\n%s", stderr)
	}
	if !strings.HasPrefix(lines[usageIdx+1], "  Playground tool — no auth, no security audit.") {
		t.Errorf("expected line after Usage to begin with playground footer, got %q\nstderr:\n%s", lines[usageIdx+1], stderr)
	}
	if !strings.HasPrefix(lines[usageIdx+2], "  unless you trust your network.") {
		t.Errorf("expected second footer line, got %q\nstderr:\n%s", lines[usageIdx+2], stderr)
	}
	afterFooter := strings.Join(lines[usageIdx+3:], "\n")
	if !strings.Contains(afterFooter, "-port") {
		t.Errorf("expected flag defaults (e.g. -port) below the footer, got:\n%s", afterFooter)
	}
}
