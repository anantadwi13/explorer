package git

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// commitDetailFixture returns a repo with several commits exercising every
// status the spec expects: addition, modification, deletion, rename, and a
// binary modify. Returns the repo and a name->sha map keyed by message subject.
func commitDetailFixture(t *testing.T) (*Repo, map[string]string) {
	t.Helper()
	dir := t.TempDir()
	initRepo(t, dir)
	shas := map[string]string{}

	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(24 * time.Hour)
	t3 := t2.Add(24 * time.Hour)
	t4 := t3.Add(24 * time.Hour)

	// Commit 1: add text + a binary file (logo.png).
	writeFile(t, dir, "README.md", "first line\nsecond line\n")
	writeBinary(t, dir, "logo.png", []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00})
	commitAll(t, dir, "add files", t1)
	shas["add"] = headSHA(t, dir)

	// Commit 2: modify README + bump binary contents.
	writeFile(t, dir, "README.md", "first line\nsecond line MODIFIED\nthird line\n")
	writeBinary(t, dir, "logo.png", []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01, 0x02, 0x03})
	commitAll(t, dir, "modify README and bump binary", t2)
	shas["modify"] = headSHA(t, dir)

	// Commit 3: rename README -> docs/README.md.
	if err := os.MkdirAll(filepath.Join(dir, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "mv", "README.md", "docs/README.md")
	commitAll(t, dir, "rename README", t3)
	shas["rename"] = headSHA(t, dir)

	// Commit 4: delete the binary.
	runGit(t, dir, "rm", "logo.png")
	commitAll(t, dir, "delete logo", t4)
	shas["delete"] = headSHA(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return r, shas
}

func writeBinary(t *testing.T, dir, path string, content []byte) {
	t.Helper()
	full := filepath.Join(dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, content, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestCommit_AdditionStatus(t *testing.T) {
	r, shas := commitDetailFixture(t)
	res, err := r.Commit(shas["add"], 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.SHA != shas["add"] {
		t.Errorf("sha mismatch")
	}
	if res.TotalFiles != 2 {
		t.Errorf("expected 2 files in initial commit, got %d", res.TotalFiles)
	}
	for _, f := range res.Files {
		if f.Status != "A" {
			t.Errorf("expected status=A for initial files, got %s for %v", f.Status, f.NewPath)
		}
		if f.OldPath != nil {
			t.Errorf("addition should have old_path nil")
		}
		if f.NewPath == nil {
			t.Errorf("addition should have new_path set")
		}
	}
}

func TestCommit_ModificationAndBinary(t *testing.T) {
	r, shas := commitDetailFixture(t)
	res, err := r.Commit(shas["modify"], 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalFiles != 2 {
		t.Errorf("expected 2 files in modify commit, got %d", res.TotalFiles)
	}
	var readme, logo *FileHeader
	for i := range res.Files {
		switch *res.Files[i].NewPath {
		case "README.md":
			readme = &res.Files[i]
		case "logo.png":
			logo = &res.Files[i]
		}
	}
	if readme == nil {
		t.Fatal("README.md missing")
	}
	if readme.Status != "M" {
		t.Errorf("README status: got %s want M", readme.Status)
	}
	if readme.IsBinary {
		t.Errorf("README should not be binary")
	}
	if readme.Additions == 0 || readme.Deletions == 0 {
		t.Errorf("README expected +/- counts both non-zero, got +%d -%d", readme.Additions, readme.Deletions)
	}
	if logo == nil {
		t.Fatal("logo.png missing")
	}
	if !logo.IsBinary {
		t.Error("logo.png should be classified binary")
	}
	if logo.Additions != 0 || logo.Deletions != 0 {
		t.Errorf("binary file should have 0/0 +/-, got +%d -%d", logo.Additions, logo.Deletions)
	}
	if logo.OldSize == nil || logo.NewSize == nil {
		t.Errorf("binary modify should have both sizes, got %v / %v", logo.OldSize, logo.NewSize)
	}
}

func TestCommit_Rename(t *testing.T) {
	r, shas := commitDetailFixture(t)
	res, err := r.Commit(shas["rename"], 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalFiles != 1 {
		t.Errorf("rename commit should produce 1 entry, got %d", res.TotalFiles)
	}
	f := res.Files[0]
	if f.Status != "R" {
		t.Errorf("rename status: got %s want R", f.Status)
	}
	if f.OldPath == nil || *f.OldPath != "README.md" {
		t.Errorf("rename old_path: %v", f.OldPath)
	}
	if f.NewPath == nil || *f.NewPath != "docs/README.md" {
		t.Errorf("rename new_path: %v", f.NewPath)
	}
}

func TestCommit_Delete(t *testing.T) {
	r, shas := commitDetailFixture(t)
	res, err := r.Commit(shas["delete"], 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalFiles != 1 {
		t.Errorf("expected 1 file in delete commit, got %d", res.TotalFiles)
	}
	f := res.Files[0]
	if f.Status != "D" {
		t.Errorf("delete status: got %s want D", f.Status)
	}
	if f.OldPath == nil || *f.OldPath != "logo.png" {
		t.Errorf("delete old_path: %v", f.OldPath)
	}
	if f.NewPath != nil {
		t.Errorf("delete new_path must be nil, got %v", f.NewPath)
	}
}

func TestCommit_MergeFirstParentOnly(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)

	writeFile(t, dir, "README.md", "v1")
	commitAll(t, dir, "base", t1)

	runGit(t, dir, "checkout", "-b", "branch-a")
	writeFile(t, dir, "a.txt", "a from branch a")
	commitAll(t, dir, "branch a", t1.Add(time.Hour))

	runGit(t, dir, "checkout", "main")
	runGit(t, dir, "checkout", "-b", "branch-b")
	writeFile(t, dir, "b.txt", "b from branch b")
	commitAll(t, dir, "branch b", t1.Add(2*time.Hour))

	runGit(t, dir, "checkout", "main")
	// First merge sets main = branch-a (fast-forward).
	runGit(t, dir, "merge", "branch-a", "--no-ff",
		"-m", "merge a", "--allow-unrelated-histories")
	// Now a real merge into main bringing in branch-b.
	runGitWithTime(t, dir, t1.Add(3*time.Hour), "merge", "branch-b", "--no-ff", "-m", "merge b")

	mergeSHA := headSHA(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Commit(mergeSHA, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Parents) != 2 {
		t.Fatalf("merge commit should have 2 parents, got %d", len(res.Parents))
	}
	// Diff against first parent (the `merge a` commit) should ONLY show b.txt
	// (the file added by branch-b). a.txt was already on the first parent.
	if res.TotalFiles != 1 {
		t.Errorf("merge first-parent diff should produce 1 file, got %d", res.TotalFiles)
	}
	for _, f := range res.Files {
		if f.NewPath == nil || *f.NewPath != "b.txt" {
			t.Errorf("expected first-parent diff to show b.txt only, got %v", f.NewPath)
		}
	}
}

func TestCommit_EmptyCommit(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	writeFile(t, dir, "README.md", "x")
	commitAll(t, dir, "base", t1)
	runGitWithTime(t, dir, t1.Add(time.Hour), "commit", "--allow-empty", "-m", "empty")
	emptySHA := headSHA(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Commit(emptySHA, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalFiles != 0 {
		t.Errorf("empty commit should have 0 files, got %d", res.TotalFiles)
	}
	if res.TotalAdditions != 0 || res.TotalDeletions != 0 {
		t.Errorf("empty commit should have 0/0 +/-, got +%d -%d", res.TotalAdditions, res.TotalDeletions)
	}
}

func TestCommit_FilePagination(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 7; i++ {
		writeFile(t, dir, "f"+itoa(i)+".txt", "hi")
	}
	commitAll(t, dir, "many files", t1)
	sha := headSHA(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}

	res, err := r.Commit(sha, 0, 3)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalFiles != 7 {
		t.Errorf("total_files should be 7, got %d", res.TotalFiles)
	}
	if len(res.Files) != 3 {
		t.Errorf("page should have 3 files, got %d", len(res.Files))
	}
	if res.NextFileOffset == nil || *res.NextFileOffset != 3 {
		t.Errorf("expected next_file_offset=3, got %v", res.NextFileOffset)
	}

	// Last page: offset=6, limit=3 → returns 1 file, next nil.
	res2, err := r.Commit(sha, 6, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(res2.Files) != 1 {
		t.Errorf("last page should have 1 file, got %d", len(res2.Files))
	}
	if res2.NextFileOffset != nil {
		t.Errorf("last page should have next_file_offset nil, got %v", *res2.NextFileOffset)
	}
}

func TestCommit_UnknownSHA(t *testing.T) {
	r, _ := commitDetailFixture(t)
	_, err := r.Commit("0123456789abcdef0123456789abcdef01234567", 0, 0)
	if !errors.Is(err, ErrUnknownRef) {
		t.Errorf("unknown sha should map to ErrUnknownRef, got %v", err)
	}
}

func TestCommit_InvalidSHAFormat(t *testing.T) {
	r, _ := commitDetailFixture(t)
	_, err := r.Commit("notahex", 0, 0)
	if !errors.Is(err, ErrUnknownRef) {
		t.Errorf("invalid sha should map to ErrUnknownRef, got %v", err)
	}
}

func TestCommit_ShortSHALookup(t *testing.T) {
	r, shas := commitDetailFixture(t)
	short := shas["modify"][:7]
	res, err := r.Commit(short, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.SHA != shas["modify"] {
		t.Errorf("expected short sha to resolve to full sha, got %s", res.SHA)
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [20]byte
	n := len(buf)
	for i > 0 {
		n--
		buf[n] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[n:])
}
