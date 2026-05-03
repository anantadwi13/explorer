package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/anantadwi13/explorer/internal/server"
)

// makeTestRoot creates a temporary directory tree for testing.
func makeTestRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	// Markdown file
	os.WriteFile(filepath.Join(root, "readme.md"), []byte("# Hello\nworld"), 0600)
	// Text file
	os.WriteFile(filepath.Join(root, "notes.txt"), []byte("plain text"), 0600)
	// Go source
	os.WriteFile(filepath.Join(root, "main.go"), []byte("package main"), 0600)
	// PNG (8-byte minimal valid PNG header)
	pngBytes := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00}
	os.WriteFile(filepath.Join(root, "logo.png"), pngBytes, 0600)
	// Subdir
	os.MkdirAll(filepath.Join(root, "docs"), 0755)
	os.WriteFile(filepath.Join(root, "docs", "api.md"), []byte("# API"), 0600)
	// Symlink within root
	os.Symlink(filepath.Join(root, "notes.txt"), filepath.Join(root, "link_in.txt"))
	// Symlink outside root
	os.Symlink("/etc/passwd", filepath.Join(root, "link_out.txt"))
	// Binary/non-UTF-8 file (extension not in MIME table; sniffer-classified)
	os.WriteFile(filepath.Join(root, "binary.bin"), []byte{0xFF, 0xFE, 0x00, 0x01}, 0600)
	// Archive — extTable maps .zip to application/zip (non-previewable)
	os.WriteFile(filepath.Join(root, "release.zip"), []byte("PK\x03\x04not-a-real-zip"), 0600)

	return root
}

func newTestServer(t *testing.T) (*server.Server, string) {
	root := makeTestRoot(t)
	return server.New(root), root
}

// --- /api/tree tests ---

func TestTreeRoot(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/tree?path=", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp struct {
		Entries []struct {
			Name string `json:"name"`
			Type string `json:"type"`
		} `json:"entries"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Entries) == 0 {
		t.Error("expected non-empty entries")
	}
	// docs should come first (dir before files)
	if resp.Entries[0].Type != "dir" {
		t.Errorf("expected first entry to be dir, got %s (%s)", resp.Entries[0].Type, resp.Entries[0].Name)
	}
}

func TestTreeOutsideRootSymlinkDropped(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/tree?path=", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	var resp struct {
		Entries []struct{ Name string `json:"name"` } `json:"entries"`
	}
	json.NewDecoder(w.Body).Decode(&resp)

	for _, e := range resp.Entries {
		if e.Name == "link_out.txt" {
			t.Error("out-of-root symlink should be omitted from listing")
		}
	}
}

func TestTreeNotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/tree?path=nonexistent", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "not_found")
}

func TestTreeDotDotEscape(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/tree?path=../../etc", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "outside_root")
}

// --- /api/meta tests ---

func TestMetaMarkdown(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=readme.md", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["kind"] != "markdown" {
		t.Errorf("expected kind=markdown, got %v", resp["kind"])
	}
	if _, ok := resp["content"]; ok {
		t.Error("meta response must not include a content field")
	}
	if _, ok := resp["size"]; !ok {
		t.Error("meta response must include size")
	}
	if _, ok := resp["mtime"]; !ok {
		t.Error("meta response must include mtime")
	}
}

func TestMetaText(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=notes.txt", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["kind"] != "text" {
		t.Errorf("expected kind=text, got %v", resp["kind"])
	}
	if _, ok := resp["content"]; ok {
		t.Error("meta response must not include a content field")
	}
}

func TestMetaImage(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=logo.png", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["kind"] != "image" {
		t.Errorf("expected kind=image, got %v", resp["kind"])
	}
	if _, ok := resp["content"]; ok {
		t.Error("meta response must not include a content field")
	}
}

func TestMetaNonPreviewable(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=release.zip", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 (meta returns even for non-previewable), got %d", w.Code)
	}
	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if k, ok := resp["kind"]; ok && k != "" {
		t.Errorf("expected kind to be empty/omitted for non-previewable, got %v", k)
	}
	if resp["mime"] != "application/zip" {
		t.Errorf("expected mime=application/zip, got %v", resp["mime"])
	}
}

func TestMetaDirectoryReturnsNotRegular(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=docs", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for directory path, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "not_regular")
}

func TestMetaNotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=missing.txt", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "not_found")
}

func TestMetaPathTraversal(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=../../../etc/passwd", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for path traversal, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "outside_root")
}

func TestMetaSymlinkOutsideRoot(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=link_out.txt", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for out-of-root symlink, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "outside_root")
}

func TestTreeReturnsKind(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/tree?path=", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp struct {
		Entries []struct {
			Name string  `json:"name"`
			Type string  `json:"type"`
			Kind *string `json:"kind"`
		} `json:"entries"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, e := range resp.Entries {
		if e.Type != "file" {
			continue
		}
		k := ""
		if e.Kind != nil {
			k = *e.Kind
		}
		got[e.Name] = k
	}
	want := map[string]string{
		"readme.md":   "markdown",
		"notes.txt":   "text",
		"main.go":     "text",
		"logo.png":    "image",
		"release.zip": "",
		"link_in.txt": "text",
	}
	for name, wantKind := range want {
		gotKind, ok := got[name]
		if !ok {
			t.Errorf("entry %q missing from listing", name)
			continue
		}
		if gotKind != wantKind {
			t.Errorf("entry %q: want kind=%q, got %q", name, wantKind, gotKind)
		}
	}
}

// --- /raw/ tests ---

func TestRawPNG(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/raw/logo.png", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	ct := w.Header().Get("Content-Type")
	if !strings.HasPrefix(ct, "image/png") {
		t.Errorf("expected image/png Content-Type, got %s", ct)
	}
	if w.Header().Get("Content-Disposition") != "" {
		t.Error("raw endpoint should not set Content-Disposition")
	}
}

func TestRawDotDotRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/raw/../../../etc/passwd", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code == http.StatusOK {
		t.Error("dot-dot escape should be rejected")
	}
}

func TestRawSymlinkOutsideRootRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/raw/link_out.txt", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code == http.StatusOK {
		t.Error("out-of-root symlink should be rejected")
	}
	assertErrorKind(t, w.Body.String(), "outside_root")
}

func assertErrorKind(t *testing.T, body, wantKind string) {
	t.Helper()
	var resp struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(strings.NewReader(body)).Decode(&resp); err != nil {
		t.Errorf("could not parse error JSON from %q: %v", body, err)
		return
	}
	if resp.Error != wantKind {
		t.Errorf("expected error kind %q, got %q (body: %s)", wantKind, resp.Error, body)
	}
}
