package resolver_test

import (
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/anantadwi13/explorer/internal/server/resolver"
)

func makeFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	// regular file
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("hello"), 0600); err != nil {
		t.Fatal(err)
	}
	// nested dir + file
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "sub", "inner.txt"), []byte("inner"), 0600); err != nil {
		t.Fatal(err)
	}
	// symlink within root
	if err := os.Symlink(filepath.Join(root, "file.txt"), filepath.Join(root, "link_in.txt")); err != nil {
		t.Fatal(err)
	}
	// symlink outside root
	if err := os.Symlink("/etc/passwd", filepath.Join(root, "link_out.txt")); err != nil {
		t.Fatal(err)
	}
	// unreadable file
	if err := os.WriteFile(filepath.Join(root, "noperm.txt"), []byte("x"), 0000); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestResolveRegularFile(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	res, err := r.Resolve("file.txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Info.Mode().IsRegular() {
		t.Error("expected regular file")
	}
}

func TestResolveDirectory(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	res, err := r.Resolve("sub")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Info.IsDir() {
		t.Error("expected directory")
	}
}

func TestResolveRoot(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	res, err := r.Resolve("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Info.IsDir() {
		t.Error("expected directory for empty path")
	}
}

func TestResolveDotDotEscape(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	_, err := r.Resolve("../../../etc/passwd")
	if !resolver.IsResolveError(err, resolver.ErrOutsideRoot) {
		t.Errorf("expected outside_root error, got %v", err)
	}
}

func TestResolvePercentEncodedEscape(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	// Simulate what the HTTP layer does after decoding %2F%2E%2E
	decoded, _ := url.PathUnescape("%2F%2E%2E%2F%2E%2E%2Fetc%2Fpasswd")
	_, err := r.Resolve(decoded)
	if !resolver.IsResolveError(err, resolver.ErrOutsideRoot) {
		t.Errorf("expected outside_root error for percent-decoded path, got %v", err)
	}
}

func TestResolveSymlinkInsideRoot(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	res, err := r.Resolve("link_in.txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Info.Mode().IsRegular() {
		t.Error("expected regular file via in-root symlink")
	}
}

func TestResolveSymlinkOutsideRoot(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	_, err := r.Resolve("link_out.txt")
	if !resolver.IsResolveError(err, resolver.ErrOutsideRoot) {
		t.Errorf("expected outside_root error for out-of-root symlink, got %v", err)
	}
}

func TestResolveMissingPath(t *testing.T) {
	root := makeFixture(t)
	r := resolver.New(root)
	_, err := r.Resolve("does_not_exist.txt")
	if !resolver.IsResolveError(err, resolver.ErrNotFound) {
		t.Errorf("expected not_found, got %v", err)
	}
}

func TestResolveUnreadablePath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("permission model differs on Windows")
	}
	if os.Getuid() == 0 {
		t.Skip("running as root, permission checks don't apply")
	}
	root := makeFixture(t)
	r := resolver.New(root)
	// EvalSymlinks on a mode-000 file still succeeds (it's the open that fails);
	// the resolve should succeed (the file is visible), but mark as regular.
	res, err := r.Resolve("noperm.txt")
	if err != nil {
		t.Fatalf("unexpected error resolving unreadable file: %v", err)
	}
	if !res.Info.Mode().IsRegular() {
		t.Error("expected regular file")
	}
}
