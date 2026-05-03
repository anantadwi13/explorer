package mime_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/anantadwi13/explorer/internal/server/mime"
)

func TestKnownExtensions(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"file.md", "text/markdown"},
		{"file.markdown", "text/markdown"},
		{"file.txt", "text/plain"},
		{"file.json", "application/json"},
		{"file.yaml", "text/yaml"},
		{"file.yml", "text/yaml"},
		{"file.toml", "text/toml"},
		{"file.go", "text/x-go"},
		{"file.ts", "text/typescript"},
		{"file.tsx", "text/typescript"},
		{"file.js", "text/javascript"},
		{"file.jsx", "text/javascript"},
		{"file.py", "text/x-python"},
		{"file.rs", "text/x-rust"},
		{"file.sh", "text/x-sh"},
		{"file.html", "text/html"},
		{"file.css", "text/css"},
		{"file.scss", "text/x-scss"},
		{"file.sql", "text/x-sql"},
		{"file.png", "image/png"},
		{"file.jpg", "image/jpeg"},
		{"file.jpeg", "image/jpeg"},
		{"file.gif", "image/gif"},
		{"file.webp", "image/webp"},
		{"file.svg", "image/svg+xml"},
	}

	dir := t.TempDir()
	for _, tc := range cases {
		path := filepath.Join(dir, tc.name)
		if err := os.WriteFile(path, []byte("content"), 0600); err != nil {
			t.Fatal(err)
		}
		got := mime.Detect(path)
		if !strings.HasPrefix(got, tc.want) {
			t.Errorf("Detect(%s): got %q, want prefix %q", tc.name, got, tc.want)
		}
	}
}

func TestExtensionlessTextFileFallsToSniff(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "noext")
	if err := os.WriteFile(path, []byte("hello world plain text content"), 0600); err != nil {
		t.Fatal(err)
	}
	got := mime.Detect(path)
	if !strings.HasPrefix(got, "text/plain") {
		t.Errorf("expected text/plain for extensionless text file, got %q", got)
	}
}
