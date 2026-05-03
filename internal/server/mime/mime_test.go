package mime_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/anantadwi13/explorer/internal/server/mime"
)

// ExtensionsWithTextKind lists every extension that extToLanguage maps to a
// non-null grammar AND that the server must classify as kind="text". Keep this
// in sync with the TS-side list in grammars.test.ts so a contributor adding a
// language sees both.
var ExtensionsWithTextKind = []string{
	".go", ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".rs", ".sh",
	".html", ".htm", ".xml", ".css", ".scss", ".sql", ".c", ".cpp", ".h",
	".java", ".yaml", ".yml", ".md", ".markdown",
	// New programming languages
	".cs", ".kt", ".kts", ".swift", ".scala", ".sc", ".groovy", ".gradle",
	".m", ".mm", ".fs", ".fsi", ".fsx", ".php", ".phtml", ".dart", ".lua",
	".pl", ".pm", ".ps1", ".psm1", ".r", ".hs", ".lhs", ".ex", ".exs",
	".erl", ".hrl", ".clj", ".cljs", ".cljc", ".edn", ".jl",
	// Data / config / query
	".json", ".toml", ".graphql", ".gql", ".proto",
}

func TestKnownExtensions(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"file.md", "text/markdown"},
		{"file.markdown", "text/markdown"},
		{"file.txt", "text/plain"},
		{"file.json", "text/json"},
		{"file.yaml", "text/yaml"},
		{"file.yml", "text/yaml"},
		{"file.toml", "text/toml"},
		{"file.graphql", "text/x-graphql"},
		{"file.gql", "text/x-graphql"},
		{"file.proto", "text/x-protobuf"},
		{"file.go", "text/x-go"},
		{"file.ts", "text/typescript"},
		{"file.tsx", "text/typescript"},
		{"file.js", "text/javascript"},
		{"file.jsx", "text/javascript"},
		{"file.py", "text/x-python"},
		{"file.rs", "text/x-rust"},
		{"file.sh", "text/x-sh"},
		{"file.html", "text/html"},
		{"file.htm", "text/html"},
		{"file.css", "text/css"},
		{"file.scss", "text/x-scss"},
		{"file.sql", "text/x-sql"},
		{"file.c", "text/x-c"},
		{"file.cpp", "text/x-c++"},
		{"file.h", "text/x-c"},
		{"file.java", "text/x-java"},
		{"file.xml", "text/xml"},
		{"file.csv", "text/csv"},
		// New programming languages
		{"file.cs", "text/x-csharp"},
		{"file.kt", "text/x-kotlin"},
		{"file.kts", "text/x-kotlin"},
		{"file.swift", "text/x-swift"},
		{"file.scala", "text/x-scala"},
		{"file.sc", "text/x-scala"},
		{"file.groovy", "text/x-groovy"},
		{"file.gradle", "text/x-groovy"},
		{"file.m", "text/x-objectivec"},
		{"file.mm", "text/x-objectivec"},
		{"file.fs", "text/x-fsharp"},
		{"file.fsi", "text/x-fsharp"},
		{"file.fsx", "text/x-fsharp"},
		{"file.php", "text/x-php"},
		{"file.phtml", "text/x-php"},
		{"file.dart", "text/x-dart"},
		{"file.lua", "text/x-lua"},
		{"file.pl", "text/x-perl"},
		{"file.pm", "text/x-perl"},
		{"file.ps1", "text/x-powershell"},
		{"file.psm1", "text/x-powershell"},
		{"file.r", "text/x-r"},
		{"file.R", "text/x-r"},
		{"file.hs", "text/x-haskell"},
		{"file.lhs", "text/x-haskell"},
		{"file.ex", "text/x-elixir"},
		{"file.exs", "text/x-elixir"},
		{"file.erl", "text/x-erlang"},
		{"file.hrl", "text/x-erlang"},
		{"file.clj", "text/x-clojure"},
		{"file.cljs", "text/x-clojure"},
		{"file.cljc", "text/x-clojure"},
		{"file.edn", "text/x-clojure"},
		{"file.jl", "text/x-julia"},
		{"file.zig", "text/x-zig"},
		// Images
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

func TestUnknownExtensionNotInTable(t *testing.T) {
	got := mime.DetectByExt(".xyzzy123")
	if got != "" {
		t.Errorf("DetectByExt for unknown extension: expected empty string, got %q", got)
	}
}

// TestExtensionsWithTextKindAreTextMIME guards against SPA/server drift: every
// extension that extToLanguage maps to a non-null grammar must also yield a
// text/ MIME from the server so the file viewer can reach the highlighter.
// Keep the extension list in sync with the TS-side ExtensionsWithTextKind in
// grammars.test.ts.
func TestExtensionsWithTextKindAreTextMIME(t *testing.T) {
	dir := t.TempDir()
	for _, ext := range ExtensionsWithTextKind {
		name := "file" + ext
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte("content"), 0600); err != nil {
			t.Fatal(err)
		}
		got := mime.Detect(path)
		mt := strings.SplitN(strings.ToLower(got), ";", 2)[0]
		mt = strings.TrimSpace(mt)
		if !strings.HasPrefix(mt, "text/") {
			t.Errorf("extension %q: expected text/ MIME for SPA grammar alignment, got %q", ext, got)
		}
	}
}
