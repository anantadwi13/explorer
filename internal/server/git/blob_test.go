package git

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestBlobAt_FullSHA(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	content, mt, size, when, err := r.BlobAt(shas[0], "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at full SHA: %v", err)
	}
	want := "line 1\nline 2\n"
	if string(content) != want {
		t.Errorf("content %q, want %q", content, want)
	}
	if size != int64(len(want)) {
		t.Errorf("size %d, want %d", size, len(want))
	}
	if mt == "" || !strings.HasPrefix(mt, "text/") {
		t.Errorf("expected text/* mime, got %q", mt)
	}
	if when.IsZero() {
		t.Errorf("expected commit timestamp, got zero")
	}
}

func TestBlobAt_SHAPrefix(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	prefix := shas[0][:7]
	content, _, _, _, err := r.BlobAt(prefix, "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at SHA prefix %q: %v", prefix, err)
	}
	if string(content) != "line 1\nline 2\n" {
		t.Errorf("content mismatch: %q", content)
	}
}

func TestBlobAt_BranchName(t *testing.T) {
	dir, _ := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	content, _, _, _, err := r.BlobAt("main", "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at branch main: %v", err)
	}
	// main is at commit C — foo.go has all 5 lines.
	if string(content) != "line 1\nline 2\nline 3\nline 4\nline 5\n" {
		t.Errorf("content at main mismatch: %q", content)
	}
}

func TestBlobAt_TagName(t *testing.T) {
	dir, shas := blameFixture(t)
	runGit(t, dir, "tag", "v1", shas[1])
	r, _ := openRepoAndResolver(t, dir)

	content, _, _, when, err := r.BlobAt("v1", "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at tag v1: %v", err)
	}
	// v1 → commit B → foo.go has 4 lines.
	if string(content) != "line 1\nline 2\nline 3\nline 4\n" {
		t.Errorf("content at v1 mismatch: %q", content)
	}
	// Commit B's timestamp is t1 + 24h.
	expected := time.Date(2025, 1, 2, 10, 0, 0, 0, time.UTC)
	if !when.Equal(expected) {
		t.Errorf("when = %v, want %v", when, expected)
	}
}

func TestBlobAt_CaretSuffix_SHA(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	// shas[2]^ → shas[1] (commit B's state of foo.go).
	content, _, _, _, err := r.BlobAt(shas[2]+"^", "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at sha^: %v", err)
	}
	if string(content) != "line 1\nline 2\nline 3\nline 4\n" {
		t.Errorf("content at sha^ mismatch: %q", content)
	}
}

func TestBlobAt_CaretSuffix_BranchName(t *testing.T) {
	dir, _ := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	// main^ → commit B.
	content, _, _, _, err := r.BlobAt("main^", "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at main^: %v", err)
	}
	if string(content) != "line 1\nline 2\nline 3\nline 4\n" {
		t.Errorf("content at main^ mismatch: %q", content)
	}
}

func TestBlobAt_CaretSuffix_DoubleCaret(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	// shas[2]^^ → shas[0] (commit A's state of foo.go).
	content, _, _, _, err := r.BlobAt(shas[2]+"^^", "foo.go")
	if err != nil {
		t.Fatalf("BlobAt at sha^^: %v", err)
	}
	if string(content) != "line 1\nline 2\n" {
		t.Errorf("content at sha^^ mismatch: %q", content)
	}
}

func TestBlobAt_CaretOnRootCommit(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	// shas[0] is the root commit. shas[0]^ walks off the start.
	_, _, _, _, err := r.BlobAt(shas[0]+"^", "foo.go")
	if !errors.Is(err, ErrUnknownRef) {
		t.Fatalf("expected ErrUnknownRef for caret on root commit, got %v", err)
	}
}

func TestBlobAt_FileAbsentFromTree(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	_, _, _, _, err := r.BlobAt(shas[0], "missing.txt")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for absent file, got %v", err)
	}
}

func TestBlobAt_UnknownRef(t *testing.T) {
	dir, _ := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	_, _, _, _, err := r.BlobAt("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "foo.go")
	if !errors.Is(err, ErrUnknownRef) {
		t.Fatalf("expected ErrUnknownRef for nonexistent SHA, got %v", err)
	}
}

func TestBlobAt_BinaryBytesReturnedAsIs(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	// Write a small PNG-shaped blob — header bytes are enough to confirm the
	// content survives a round-trip without text-coercion.
	pngHead := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01, 0x02, 0x03}
	writeFile(t, dir, "logo.png", string(pngHead))
	commitAll(t, dir, "add png", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	r, _ := openRepoAndResolver(t, dir)
	content, mt, _, _, err := r.BlobAt("main", "logo.png")
	if err != nil {
		t.Fatalf("BlobAt for png: %v", err)
	}
	if !bytes.Equal(content, pngHead) {
		t.Errorf("png bytes corrupted: got %v, want %v", content, pngHead)
	}
	if mt != "image/png" {
		t.Errorf("mime = %q, want image/png", mt)
	}
}

func TestBlobAt_EmptyPath(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	_, _, _, _, err := r.BlobAt(shas[0], "")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for empty path, got %v", err)
	}
}

func TestBlobAt_PathEscapeStructurallyBounded(t *testing.T) {
	dir, shas := blameFixture(t)
	r, _ := openRepoAndResolver(t, dir)

	// `../something` is not a valid git tree path. The lookup returns
	// not_found rather than walking out of the tree.
	_, _, _, _, err := r.BlobAt(shas[0], "../../../etc/passwd")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for path-escape, got %v", err)
	}
}
