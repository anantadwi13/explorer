package git

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStatus_CleanTree(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "hi")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Staged) != 0 || len(res.Unstaged) != 0 || len(res.Untracked) != 0 {
		t.Errorf("clean tree should be empty, got %+v", res)
	}
}

func TestStatus_StagedAddedNew(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "hi")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	writeFile(t, dir, "new.txt", "brand new\nfile\n")
	runGit(t, dir, "add", "new.txt")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Staged) != 1 {
		t.Fatalf("expected 1 staged entry, got %d", len(res.Staged))
	}
	f := res.Staged[0]
	if f.Status != "A" {
		t.Errorf("expected status=A, got %s", f.Status)
	}
	if f.OldPath != nil {
		t.Errorf("addition should have nil old_path, got %v", *f.OldPath)
	}
	if f.NewPath == nil || *f.NewPath != "new.txt" {
		t.Errorf("expected new_path=new.txt, got %v", f.NewPath)
	}
	if f.Additions == 0 {
		t.Errorf("expected non-zero additions for a new file with content")
	}
}

func TestStatus_StagedDelete(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "old.txt", "going away\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	runGit(t, dir, "rm", "old.txt")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Staged) != 1 {
		t.Fatalf("expected 1 staged delete, got %d", len(res.Staged))
	}
	f := res.Staged[0]
	if f.Status != "D" {
		t.Errorf("expected status=D, got %s", f.Status)
	}
	if f.OldPath == nil || *f.OldPath != "old.txt" {
		t.Errorf("delete old_path: %v", f.OldPath)
	}
	if f.NewPath != nil {
		t.Errorf("delete new_path should be nil, got %v", *f.NewPath)
	}
	if f.Deletions == 0 {
		t.Errorf("expected non-zero deletions for a deleted file with content")
	}
}

func TestStatus_UnstagedModify(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "line1\nline2\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	writeFile(t, dir, "README.md", "line1 changed\nline2\nline3\n")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Unstaged) != 1 {
		t.Fatalf("expected 1 unstaged modify, got %d (%+v)", len(res.Unstaged), res)
	}
	f := res.Unstaged[0]
	if f.Status != "M" {
		t.Errorf("expected status=M, got %s", f.Status)
	}
	if f.OldPath == nil || *f.OldPath != "README.md" {
		t.Errorf("modify old_path: %v", f.OldPath)
	}
	if f.NewPath == nil || *f.NewPath != "README.md" {
		t.Errorf("modify new_path: %v", f.NewPath)
	}
	if f.Additions == 0 || f.Deletions == 0 {
		t.Errorf("expected both +/- > 0 for a modify, got +%d -%d", f.Additions, f.Deletions)
	}
}

func TestStatus_UntrackedOnly(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "x")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	writeFile(t, dir, "untracked.txt", "hi")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Untracked) != 1 {
		t.Fatalf("expected 1 untracked, got %d", len(res.Untracked))
	}
	if res.Untracked[0].Path != "untracked.txt" {
		t.Errorf("untracked path: %s", res.Untracked[0].Path)
	}
	if len(res.Staged) != 0 || len(res.Unstaged) != 0 {
		t.Errorf("untracked-only fixture should have empty staged/unstaged")
	}
}

func TestStatus_Mixed(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "A.txt", "a\n")
	writeFile(t, dir, "B.txt", "b\n")
	writeFile(t, dir, "C.txt", "c\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	// 2 staged: modify A, add D.
	writeFile(t, dir, "A.txt", "a modified\n")
	writeFile(t, dir, "D.txt", "d\n")
	runGit(t, dir, "add", "A.txt", "D.txt")
	// 1 unstaged: modify B.
	writeFile(t, dir, "B.txt", "b modified\n")
	// 1 untracked: E.
	writeFile(t, dir, "E.txt", "e\n")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Staged) != 2 {
		t.Errorf("expected 2 staged, got %d", len(res.Staged))
	}
	if len(res.Unstaged) != 1 {
		t.Errorf("expected 1 unstaged, got %d", len(res.Unstaged))
	}
	if len(res.Untracked) != 1 {
		t.Errorf("expected 1 untracked, got %d", len(res.Untracked))
	}
}

func TestStatus_ConflictedDoesNotCrash(t *testing.T) {
	// Build a conflicted merge: branch-a modifies README, branch-b modifies
	// the same line on a different commit. Merging branch-b into branch-a
	// leaves the file conflicted.
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "base\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	runGit(t, dir, "checkout", "-b", "branch-a")
	writeFile(t, dir, "README.md", "version A\n")
	commitAll(t, dir, "a", time.Date(2025, 1, 2, 10, 0, 0, 0, time.UTC))

	runGit(t, dir, "checkout", "main")
	runGit(t, dir, "checkout", "-b", "branch-b")
	writeFile(t, dir, "README.md", "version B\n")
	commitAll(t, dir, "b", time.Date(2025, 1, 3, 10, 0, 0, 0, time.UTC))

	runGit(t, dir, "checkout", "branch-a")
	// Force a real conflict by trying to merge — expected to fail with a
	// non-zero exit, so don't use runGit (which fatals on exit code).
	if err := runGitNoFatal(t, dir, "merge", "branch-b", "-m", "merge", "--no-ff"); err == nil {
		// If git decided to auto-resolve, manually create a conflict marker.
		writeFile(t, dir, "README.md", "<<<<<<< HEAD\nA\n=======\nB\n>>>>>>> branch-b\n")
	}
	// Sanity check: there should be a .git/MERGE_HEAD or conflict markers.
	if _, err := os.Stat(filepath.Join(dir, ".git", "MERGE_HEAD")); err == nil {
		t.Log("repository is mid-merge as expected")
	}

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Status()
	if err != nil {
		t.Fatalf("Status() should not error on a conflicted repo, got %v", err)
	}
	// We don't assert on the exact bucket counts — go-git's behaviour during a
	// conflict varies. The spec only requires: no crash, no error.
	_ = res
}

// runGitNoFatal is a variant that returns error instead of fatalling, used
// for the conflict test where we expect the command to fail.
func runGitNoFatal(t *testing.T, dir string, args ...string) error {
	t.Helper()
	return execGit(dir, args...)
}

func execGit(dir string, args ...string) error {
	cmd := newGitCmd(dir, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return &gitExecError{out: out, err: err}
	}
	return nil
}

type gitExecError struct {
	out []byte
	err error
}

func (e *gitExecError) Error() string {
	return e.err.Error() + ": " + string(e.out)
}
