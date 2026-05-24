package git

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOpen_WithDotGitDirectory(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "hello")
	commitAll(t, dir, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	r, err := Open(dir)
	if err != nil {
		t.Fatalf("Open returned error: %v", err)
	}
	if r == nil || r.repo == nil {
		t.Fatal("Open returned nil repo")
	}
}

func TestOpen_WithDotGitWorktreePointerFile(t *testing.T) {
	// Set up a main repo with a linked worktree. The linked worktree's `.git`
	// is a regular file containing `gitdir: <path>`.
	main := t.TempDir()
	initRepo(t, main)
	writeFile(t, main, "README.md", "hello")
	commitAll(t, main, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	worktreeParent := t.TempDir()
	worktree := filepath.Join(worktreeParent, "linked")
	runGit(t, main, "worktree", "add", worktree, "-b", "linked-branch")

	// Sanity check the gate prerequisite — `.git` is a regular file here.
	gitEntry := filepath.Join(worktree, ".git")
	info, err := os.Lstat(gitEntry)
	if err != nil {
		t.Fatalf("expected .git pointer file: %v", err)
	}
	if info.IsDir() {
		t.Fatalf("expected .git to be a file, got directory")
	}

	r, err := Open(worktree)
	if err != nil {
		t.Fatalf("Open with worktree pointer failed: %v", err)
	}
	if r == nil {
		t.Fatal("Open returned nil")
	}
}

func TestOpen_WithoutDotGit(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "README.md", "hello")

	_, err := Open(dir)
	if !errors.Is(err, ErrNotARepo) {
		t.Fatalf("expected ErrNotARepo, got %v", err)
	}
}

func TestOpen_AncestorDotGitDoesNotCount(t *testing.T) {
	// Set up a repo at <root>/repo, and try to Open(<root>/repo/sub) — the
	// .git lives at <root>/repo, not <root>/repo/sub, so the gate must fail.
	parent := t.TempDir()
	repoDir := filepath.Join(parent, "repo")
	initRepo(t, repoDir)
	writeFile(t, repoDir, "README.md", "hello")
	commitAll(t, repoDir, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	sub := filepath.Join(repoDir, "sub")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}

	_, err := Open(sub)
	if !errors.Is(err, ErrNotARepo) {
		t.Fatalf("expected ErrNotARepo when .git is only in ancestor, got %v", err)
	}
}

func TestInfo_NormalBranch(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "hello")
	commitAll(t, dir, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	info, err := r.Info()
	if err != nil {
		t.Fatal(err)
	}

	if !info.IsRepo {
		t.Error("expected IsRepo=true")
	}
	if info.Detached {
		t.Error("expected Detached=false on a branch")
	}
	if info.HeadRef == nil || *info.HeadRef != "refs/heads/main" {
		t.Errorf("expected HeadRef=refs/heads/main, got %v", info.HeadRef)
	}
	if info.HeadSHA == nil || len(*info.HeadSHA) != 40 {
		t.Errorf("expected HeadSHA 40 hex chars, got %v", info.HeadSHA)
	}
	if got := *info.HeadSHA; got != headSHA(t, dir) {
		t.Errorf("HeadSHA mismatch: got %s, git rev-parse said %s", got, headSHA(t, dir))
	}
}

func TestInfo_DetachedHEAD(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "hello")
	commitAll(t, dir, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	sha := headSHA(t, dir)
	runGit(t, dir, "checkout", "--detach", sha)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	info, err := r.Info()
	if err != nil {
		t.Fatal(err)
	}

	if !info.Detached {
		t.Error("expected Detached=true after checkout --detach")
	}
	if info.HeadRef != nil {
		t.Errorf("expected HeadRef=nil when detached, got %v", *info.HeadRef)
	}
	if info.HeadSHA == nil || *info.HeadSHA != sha {
		t.Errorf("expected HeadSHA=%s, got %v", sha, info.HeadSHA)
	}
}

func TestInfo_EmptyRepo(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	info, err := r.Info()
	if err != nil {
		t.Fatal(err)
	}

	if !info.IsRepo {
		t.Error("expected IsRepo=true on freshly-initialised repo")
	}
	if info.Detached {
		t.Error("expected Detached=false on empty repo")
	}
	if info.HeadRef != nil {
		t.Errorf("expected HeadRef=nil on empty repo, got %v", *info.HeadRef)
	}
	if info.HeadSHA != nil {
		t.Errorf("expected HeadSHA=nil on empty repo, got %v", *info.HeadSHA)
	}
}
