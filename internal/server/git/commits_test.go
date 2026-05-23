package git

import (
	"errors"
	"testing"
	"time"
)

// commitsFixture creates a small repo with three commits on main and one
// extra on feature/x, returning the four shas in chronological (oldest first)
// order plus the *Repo.
func commitsFixture(t *testing.T) (*Repo, []string) {
	t.Helper()
	dir := t.TempDir()
	initRepo(t, dir)

	var shas []string
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(24 * time.Hour)
	t3 := t2.Add(24 * time.Hour)
	t4 := t3.Add(24 * time.Hour)

	writeFile(t, dir, "README.md", "v1")
	commitAll(t, dir, "first", t1)
	shas = append(shas, headSHA(t, dir))

	writeFile(t, dir, "README.md", "v2")
	commitAll(t, dir, "second", t2)
	shas = append(shas, headSHA(t, dir))

	writeFile(t, dir, "README.md", "v3")
	commitAll(t, dir, "third", t3)
	shas = append(shas, headSHA(t, dir))

	runGit(t, dir, "checkout", "-b", "feature/x")
	writeFile(t, dir, "feature.md", "feature only")
	commitAll(t, dir, "feature", t4)
	shas = append(shas, headSHA(t, dir))

	runGit(t, dir, "checkout", "main")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return r, shas
}

func TestCommits_DefaultHEADReturnsMainNewestFirst(t *testing.T) {
	r, shas := commitsFixture(t)
	res, err := r.Commits("", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Commits) != 3 {
		t.Fatalf("expected 3 commits on main, got %d", len(res.Commits))
	}
	want := []string{shas[2], shas[1], shas[0]} // newest first
	for i, s := range want {
		if res.Commits[i].SHA != s {
			t.Errorf("commit %d: got %s want %s", i, res.Commits[i].SHA, s)
		}
	}
	if res.NextCursor != nil {
		t.Errorf("expected next_cursor nil for full history under limit, got %s", *res.NextCursor)
	}
	if res.Commits[0].ShortSHA != shas[2][:7] {
		t.Errorf("short_sha format wrong: %q", res.Commits[0].ShortSHA)
	}
	if res.Commits[0].Subject != "third" {
		t.Errorf("subject wrong: %q", res.Commits[0].Subject)
	}
}

func TestCommits_ExplicitBranch(t *testing.T) {
	r, shas := commitsFixture(t)
	res, err := r.Commits("feature/x", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Commits) != 4 {
		t.Fatalf("expected 4 commits on feature/x, got %d", len(res.Commits))
	}
	if res.Commits[0].SHA != shas[3] {
		t.Errorf("expected feature commit at head, got %s", res.Commits[0].SHA)
	}
}

func TestCommits_TagAsRef(t *testing.T) {
	r, shas := commitsFixture(t)
	runGit(t, r.root, "tag", "v1.0.0", shas[1])
	res, err := r.Commits("v1.0.0", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Commits) != 2 {
		t.Fatalf("tag v1.0.0 points at second commit, expected 2 commits behind it, got %d", len(res.Commits))
	}
	if res.Commits[0].SHA != shas[1] {
		t.Errorf("expected first returned commit to be the tag commit, got %s", res.Commits[0].SHA)
	}
}

func TestCommits_CursorExclusive(t *testing.T) {
	r, shas := commitsFixture(t)
	// Pass the newest sha as cursor; we should get the older two.
	res, err := r.Commits("", shas[2], 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Commits) != 2 {
		t.Fatalf("expected 2 commits older than cursor, got %d", len(res.Commits))
	}
	if res.Commits[0].SHA != shas[1] || res.Commits[1].SHA != shas[0] {
		t.Errorf("wrong order/contents: %v", []string{res.Commits[0].SHA, res.Commits[1].SHA})
	}
	for _, c := range res.Commits {
		if c.SHA == shas[2] {
			t.Errorf("cursor commit must not appear in the returned page")
		}
	}
}

func TestCommits_UnknownRef(t *testing.T) {
	r, _ := commitsFixture(t)
	_, err := r.Commits("nonexistent", "", 0)
	if !errors.Is(err, ErrUnknownRef) {
		t.Fatalf("expected ErrUnknownRef, got %v", err)
	}
}

func TestCommits_EmptyRepo(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}

	res, err := r.Commits("", "", 0)
	if err != nil {
		t.Fatalf("expected no error on empty repo, got %v", err)
	}
	if len(res.Commits) != 0 {
		t.Errorf("expected empty commits, got %v", res.Commits)
	}
	if res.NextCursor != nil {
		t.Errorf("expected next_cursor nil on empty repo, got %v", *res.NextCursor)
	}
}

func TestCommits_LimitClamping(t *testing.T) {
	r, _ := commitsFixture(t)
	res, err := r.Commits("feature/x", "", 5000)
	if err != nil {
		t.Fatal(err)
	}
	// 4 commits exist on feature/x — should return all 4 (limit is clamped
	// down to CommitsMaxLimit which is well above 4).
	if len(res.Commits) != 4 {
		t.Errorf("expected 4 commits, got %d", len(res.Commits))
	}
}

func TestCommits_NextCursorSetWhenMoreAvailable(t *testing.T) {
	r, shas := commitsFixture(t)
	res, err := r.Commits("feature/x", "", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Commits) != 2 {
		t.Fatalf("expected limit=2 to return 2 commits, got %d", len(res.Commits))
	}
	if res.NextCursor == nil {
		t.Fatal("expected next_cursor non-nil when more commits remain")
	}
	if *res.NextCursor != res.Commits[1].SHA {
		t.Errorf("next_cursor should be the last returned sha, got %s", *res.NextCursor)
	}
	// Sanity: that sha is the 3rd commit in chronological order on main (shas[2]).
	if *res.NextCursor != shas[2] {
		t.Errorf("expected cursor=shas[2]=%s, got %s", shas[2], *res.NextCursor)
	}

	// Follow up: pass the cursor back, expect the remaining 2 commits.
	page2, err := r.Commits("feature/x", *res.NextCursor, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(page2.Commits) != 2 {
		t.Errorf("expected remaining 2 commits in page 2, got %d", len(page2.Commits))
	}
	if page2.Commits[0].SHA != shas[1] || page2.Commits[1].SHA != shas[0] {
		t.Errorf("page 2 wrong contents: got %s,%s want %s,%s",
			page2.Commits[0].SHA, page2.Commits[1].SHA, shas[1], shas[0])
	}
}

func TestCommits_BranchWithSlashes(t *testing.T) {
	r, _ := commitsFixture(t)
	runGit(t, r.root, "branch", "release/v1.0")
	res, err := r.Commits("release/v1.0", "", 0)
	if err != nil {
		t.Fatalf("expected branch with slashes to resolve, got %v", err)
	}
	if len(res.Commits) == 0 {
		t.Error("expected commits from release/v1.0")
	}
}

func TestCommits_BodySeparation(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "x", "y")
	runGit(t, dir, "add", "x")
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	runGitWithTime(t, dir, t1, "commit", "-m", "subject line", "-m", "body line one\n\nbody line two")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Commits("", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if got := res.Commits[0].Subject; got != "subject line" {
		t.Errorf("subject: %q", got)
	}
	if got := res.Commits[0].Body; got == "" || got[:13] != "body line one" {
		t.Errorf("body should begin with body line one, got %q", got)
	}
}
