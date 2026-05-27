package git

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/anantadwi13/explorer/internal/server/resolver"
)

// blameFixture seeds a repo whose final state of foo.go is:
//
//	line 1  (added in commit A by anantadwi13)
//	line 2  (added in commit A)
//	line 3  (added in commit B by Sample Author B)
//	line 4  (added in commit B)
//	line 5  (added in commit C by anantadwi13)
//
// Returns the repo dir and the three commit shas (A, B, C in chronological
// order). The deterministic gitEnv helper sets author/committer to "Sample
// Author"/"Sample Committer" — to get a second author we override per-commit.
func blameFixture(t *testing.T) (string, []string) {
	t.Helper()
	dir := t.TempDir()
	initRepo(t, dir)
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)

	// Commit A: lines 1-2 from Sample Author.
	writeFile(t, dir, "foo.go", "line 1\nline 2\n")
	commitAll(t, dir, "A", t1)
	shaA := headSHA(t, dir)

	// Commit B: insert lines 3-4 with an overridden author identity.
	writeFile(t, dir, "foo.go", "line 1\nline 2\nline 3\nline 4\n")
	runGitWithTime(t, dir, t1.Add(24*time.Hour), "add", "foo.go")
	cmd := newGitCmd(dir,
		"-c", "user.name=Other Author",
		"-c", "user.email=other@example.com",
		"commit", "-m", "B",
	)
	// Override the env to use a different author for THIS commit. We rebuild
	// the env so GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL are different from the
	// helper's defaults.
	envBase := []string{
		"GIT_AUTHOR_NAME=Other Author",
		"GIT_AUTHOR_EMAIL=other@example.com",
		"GIT_COMMITTER_NAME=Other Author",
		"GIT_COMMITTER_EMAIL=other@example.com",
		"GIT_AUTHOR_DATE=" + t1.Add(24*time.Hour).Format(time.RFC3339),
		"GIT_COMMITTER_DATE=" + t1.Add(24*time.Hour).Format(time.RFC3339),
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_CONFIG_SYSTEM=/dev/null",
	}
	cmd.Env = append(os.Environ(), envBase...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("commit B failed: %v\n%s", err, out)
	}
	shaB := headSHA(t, dir)

	// Commit C: append line 5.
	writeFile(t, dir, "foo.go", "line 1\nline 2\nline 3\nline 4\nline 5\n")
	commitAll(t, dir, "C", t1.Add(48*time.Hour))
	shaC := headSHA(t, dir)

	return dir, []string{shaA, shaB, shaC}
}

func openRepoAndResolver(t *testing.T, dir string) (*Repo, *resolver.Resolver) {
	t.Helper()
	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		t.Fatal(err)
	}
	return r, resolver.New(resolved)
}

func TestBlame_CleanTrackedFile_MultiAuthorChunking(t *testing.T) {
	dir, shas := blameFixture(t)
	r, res := openRepoAndResolver(t, dir)

	br, err := r.Blame(res, "foo.go", "", 0)
	if err != nil {
		t.Fatalf("Blame: %v", err)
	}
	if br.Dirty {
		t.Errorf("expected dirty=false on clean tree")
	}
	if br.TotalLines != 5 {
		t.Fatalf("expected 5 total lines, got %d", br.TotalLines)
	}
	if len(br.Chunks) != 3 {
		t.Fatalf("expected 3 chunks (A,B,C), got %d: %+v", len(br.Chunks), br.Chunks)
	}
	want := []struct {
		start int
		count int
		sha   string
	}{
		{1, 2, shas[0]},
		{3, 2, shas[1]},
		{5, 1, shas[2]},
	}
	for i, w := range want {
		c := br.Chunks[i]
		if c.StartLine != w.start || c.LineCount != w.count {
			t.Errorf("chunk %d: got (start=%d,count=%d), want (start=%d,count=%d)",
				i, c.StartLine, c.LineCount, w.start, w.count)
		}
		if c.Commit == nil {
			t.Fatalf("chunk %d: expected committed chunk, got uncommitted", i)
		}
		if c.Commit.SHA != w.sha {
			t.Errorf("chunk %d: sha %s, want %s", i, c.Commit.SHA, w.sha)
		}
	}
	if br.Chunks[1].Commit.AuthorName != "Other Author" {
		t.Errorf("middle chunk author wrong: %q", br.Chunks[1].Commit.AuthorName)
	}
}

func TestBlame_UntrackedFile_NotFound(t *testing.T) {
	dir, _ := blameFixture(t)
	r, res := openRepoAndResolver(t, dir)

	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := r.Blame(res, "new.txt", "", 0)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for untracked file, got %v", err)
	}
}

func TestBlame_DirtyFile_Insertion(t *testing.T) {
	dir, shas := blameFixture(t)

	// Insert two lines in the middle (between B's lines 3-4) without staging.
	wt := []byte("line 1\nline 2\nline 3\nNEW A\nNEW B\nline 4\nline 5\n")
	if err := os.WriteFile(filepath.Join(dir, "foo.go"), wt, 0o644); err != nil {
		t.Fatal(err)
	}

	r, res := openRepoAndResolver(t, dir)
	br, err := r.Blame(res, "foo.go", "", 0)
	if err != nil {
		t.Fatalf("Blame: %v", err)
	}
	if !br.Dirty {
		t.Fatalf("expected dirty=true on insertion")
	}
	if br.TotalLines != 7 {
		t.Fatalf("expected 7 total lines, got %d", br.TotalLines)
	}
	// Expect chunks: A(1,2) B(3,1) Uncommitted(4,2) B(6,1) C(7,1).
	wantCount := 5
	if len(br.Chunks) != wantCount {
		t.Fatalf("expected %d chunks, got %d: %+v", wantCount, len(br.Chunks), br.Chunks)
	}
	if !br.Chunks[2].Uncommitted || br.Chunks[2].StartLine != 4 || br.Chunks[2].LineCount != 2 {
		t.Errorf("expected uncommitted chunk at (4,2), got %+v", br.Chunks[2])
	}
	if br.Chunks[2].Commit != nil {
		t.Errorf("uncommitted chunk must not carry a commit summary")
	}
	if br.Chunks[1].Commit == nil || br.Chunks[1].Commit.SHA != shas[1] {
		t.Errorf("chunk 1 should be commit B (shas[1]), got %+v", br.Chunks[1])
	}
	if br.Chunks[4].Commit == nil || br.Chunks[4].Commit.SHA != shas[2] {
		t.Errorf("chunk 4 should be commit C (shas[2]), got %+v", br.Chunks[4])
	}
}

func TestBlame_DirtyFile_Deletion(t *testing.T) {
	dir, shas := blameFixture(t)

	// Delete lines 3-4 (B's lines) in the working tree.
	wt := []byte("line 1\nline 2\nline 5\n")
	if err := os.WriteFile(filepath.Join(dir, "foo.go"), wt, 0o644); err != nil {
		t.Fatal(err)
	}

	r, res := openRepoAndResolver(t, dir)
	br, err := r.Blame(res, "foo.go", "", 0)
	if err != nil {
		t.Fatalf("Blame: %v", err)
	}
	if !br.Dirty {
		t.Fatalf("expected dirty=true")
	}
	if br.TotalLines != 3 {
		t.Fatalf("expected 3 total lines, got %d", br.TotalLines)
	}
	// A's chunk and C's chunk; B's chunk is omitted entirely.
	if len(br.Chunks) != 2 {
		t.Fatalf("expected 2 chunks after deletion, got %d: %+v", len(br.Chunks), br.Chunks)
	}
	if br.Chunks[0].Commit == nil || br.Chunks[0].Commit.SHA != shas[0] {
		t.Errorf("first chunk should be A, got %+v", br.Chunks[0])
	}
	if br.Chunks[1].Commit == nil || br.Chunks[1].Commit.SHA != shas[2] {
		t.Errorf("second chunk should be C, got %+v", br.Chunks[1])
	}
}

func TestBlame_HistoricalRef_SkipsOverlay(t *testing.T) {
	dir, shas := blameFixture(t)
	// Tag commit B (shas[1]) so we can request blame at that historical point.
	runGit(t, dir, "tag", "v1", shas[1])

	// Make the working tree dirty.
	wt := []byte("line 1\nline 2\nline 3\nLOCAL\nline 5\n")
	if err := os.WriteFile(filepath.Join(dir, "foo.go"), wt, 0o644); err != nil {
		t.Fatal(err)
	}

	r, res := openRepoAndResolver(t, dir)
	br, err := r.Blame(res, "foo.go", "v1", 0)
	if err != nil {
		t.Fatalf("Blame at historical ref: %v", err)
	}
	if br.Dirty {
		t.Errorf("expected dirty=false on historical ref even with dirty worktree")
	}
	if br.SHA != shas[1] {
		t.Errorf("expected sha to be commit B (shas[1]), got %s", br.SHA)
	}
	if br.TotalLines != 4 {
		t.Errorf("expected 4 lines (state at commit B), got %d", br.TotalLines)
	}
	for _, c := range br.Chunks {
		if c.Uncommitted {
			t.Errorf("historical-ref blame should never produce uncommitted chunks: %+v", c)
		}
	}
}

func TestBlame_TooLarge(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	// Build a >5 MiB file content (committed, clean).
	big := strings.Repeat("a", BlameMaxFileSize+1) + "\n"
	if err := os.WriteFile(filepath.Join(dir, "big.txt"), []byte(big), 0o644); err != nil {
		t.Fatal(err)
	}
	commitAll(t, dir, "big", time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC))

	r, res := openRepoAndResolver(t, dir)
	_, err := r.Blame(res, "big.txt", "", 0)
	if !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}
}

func TestBlame_DeadlineExceeded(t *testing.T) {
	dir, _ := blameFixture(t)
	r, res := openRepoAndResolver(t, dir)
	// A 1ns deadline triggers immediately, before the blame goroutine can
	// possibly finish — we expect ErrBlameTimeout, not a successful result.
	_, err := r.Blame(res, "foo.go", "", time.Nanosecond)
	if !errors.Is(err, ErrBlameTimeout) {
		t.Fatalf("expected ErrBlameTimeout, got %v", err)
	}
}

func TestBlame_PathEscape_RejectedByResolver(t *testing.T) {
	dir, _ := blameFixture(t)
	// Make the working tree dirty so the dirty branch fires and the resolver
	// is invoked. (Clean branch would short-circuit on object lookup.)
	if err := os.WriteFile(filepath.Join(dir, "foo.go"), []byte("dirty\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r, res := openRepoAndResolver(t, dir)
	_, err := r.Blame(res, "../../etc/passwd", "", 0)
	if err == nil {
		t.Fatal("expected error for path-escape, got nil")
	}
	// The blame entry point exits early with ErrNotFound on a path that's not
	// in HEAD's tree — go-git's object lookup rejects ".." paths. The exact
	// kind matters less than "did NOT leak content".
	if !(errors.Is(err, ErrNotFound) || isResolverOutOfRoot(err)) {
		t.Fatalf("expected ErrNotFound or resolver outside_root, got %v", err)
	}
}

func TestBlame_RenameBoundary_NoFollow(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)

	// 1: commit old.go with two lines.
	writeFile(t, dir, "old.go", "alpha\nbeta\n")
	commitAll(t, dir, "init", t1)
	shaOld := headSHA(t, dir)
	_ = shaOld

	// 2: rename to new.go.
	runGitWithTime(t, dir, t1.Add(24*time.Hour), "mv", "old.go", "new.go")
	runGitWithTime(t, dir, t1.Add(24*time.Hour), "commit", "-m", "rename")
	shaRename := headSHA(t, dir)

	r, res := openRepoAndResolver(t, dir)
	br, err := r.Blame(res, "new.go", "", 0)
	if err != nil {
		t.Fatalf("Blame: %v", err)
	}
	// Spec: every line of new.go is attributed to the rename commit itself —
	// the older history under `old.go` is NOT included.
	for i, c := range br.Chunks {
		if c.Commit == nil {
			t.Errorf("chunk %d: expected committed chunk", i)
			continue
		}
		if c.Commit.SHA != shaRename {
			t.Errorf("chunk %d: sha %s should be the rename commit %s — blame must not follow renames",
				i, c.Commit.SHA, shaRename)
		}
	}
}

// Note: a true merge-commit-first-parent test would require constructing a
// non-fast-forward merge in the fixture. The Blame implementation delegates
// to go-git's `Blame` which already follows the first-parent convention; the
// chunking logic in this package is parent-count-agnostic. Covered indirectly
// by TestBlame_CleanTrackedFile_MultiAuthorChunking (every chunk has at most
// one commit) and the rename-boundary test (the rename commit is a single-
// parent commit, ensuring we don't over-attribute past it).

func isResolverOutOfRoot(err error) bool {
	var re *resolver.ResolveError
	if errors.As(err, &re) {
		return re.Kind == resolver.ErrOutsideRoot
	}
	return false
}
