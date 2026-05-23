package git

import (
	"testing"
	"time"
)

func TestRefs_BranchesTagsLightweightAndAnnotated(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "README.md", "hello")
	commitAll(t, dir, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	// Lightweight tag on HEAD.
	runGit(t, dir, "tag", "v1.0.0")

	// Annotated tag — peeling test.
	t2 := time.Date(2025, 1, 2, 10, 0, 0, 0, time.UTC)
	writeFile(t, dir, "README.md", "v0.9")
	commitAll(t, dir, "second", t2)
	annotatedSHA := headSHA(t, dir)
	runGitWithTime(t, dir, t2, "tag", "-a", "v0.9.0", "-m", "annotated v0.9.0")

	// Extra branches to exercise sort-order.
	runGit(t, dir, "branch", "feature/x")
	runGit(t, dir, "branch", "Aardvark")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	refs, err := r.Refs()
	if err != nil {
		t.Fatal(err)
	}

	wantBranches := []string{"Aardvark", "feature/x", "main"}
	if got := names(refs.Branches); !sliceEq(got, wantBranches) {
		t.Errorf("branches: got %v want %v", got, wantBranches)
	}

	wantTags := []string{"v0.9.0", "v1.0.0"}
	if got := names(refs.Tags); !sliceEq(got, wantTags) {
		t.Errorf("tags: got %v want %v", got, wantTags)
	}

	for _, tag := range refs.Tags {
		if tag.Name == "v0.9.0" {
			if tag.SHA != annotatedSHA {
				t.Errorf("annotated tag should peel to commit sha %s, got %s", annotatedSHA, tag.SHA)
			}
		}
	}
}

func TestRefs_RemoteTrackingExcluded(t *testing.T) {
	// Create a base repo and a clone of it so the clone has refs/remotes/origin/*.
	base := t.TempDir()
	initRepo(t, base)
	writeFile(t, base, "README.md", "hello")
	commitAll(t, base, "initial", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	cloneParent := t.TempDir()
	cloneDir := cloneParent + "/clone"
	runGit(t, cloneParent, "clone", base, cloneDir)

	r, err := Open(cloneDir)
	if err != nil {
		t.Fatal(err)
	}
	refs, err := r.Refs()
	if err != nil {
		t.Fatal(err)
	}

	for _, b := range refs.Branches {
		if b.Name == "origin/main" || b.Name == "origin/HEAD" {
			t.Errorf("remote-tracking branch %q leaked into refs.branches", b.Name)
		}
	}
	// `main` should still be present locally.
	if !hasName(refs.Branches, "main") {
		t.Errorf("expected local main branch to be listed, got %v", names(refs.Branches))
	}
}

func TestRefs_EmptyRepo(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	refs, err := r.Refs()
	if err != nil {
		t.Fatal(err)
	}
	if len(refs.Branches) != 0 {
		t.Errorf("expected no branches, got %v", refs.Branches)
	}
	if len(refs.Tags) != 0 {
		t.Errorf("expected no tags, got %v", refs.Tags)
	}
	// And the slices must be non-nil (so JSON marshals to [] not null).
	if refs.Branches == nil || refs.Tags == nil {
		t.Error("expected non-nil empty slices for clean JSON [] marshalling")
	}
}

func names(refs []RefEntry) []string {
	out := make([]string, 0, len(refs))
	for _, r := range refs {
		out = append(out, r.Name)
	}
	return out
}

func sliceEq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func hasName(refs []RefEntry, name string) bool {
	for _, r := range refs {
		if r.Name == name {
			return true
		}
	}
	return false
}
