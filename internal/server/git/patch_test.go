package git

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func patchFixture(t *testing.T) (*Repo, map[string]string) {
	t.Helper()
	dir := t.TempDir()
	initRepo(t, dir)
	shas := map[string]string{}

	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(24 * time.Hour)
	t3 := t2.Add(24 * time.Hour)

	// Initial version with many lines so the modify can produce multiple hunks.
	var lines []string
	for i := 1; i <= 30; i++ {
		lines = append(lines, "line "+itoa(i))
	}
	writeFile(t, dir, "f.txt", strings.Join(lines, "\n")+"\n")
	writeBinary(t, dir, "logo.png", []byte{0, 1, 2, 3, 4})
	commitAll(t, dir, "init", t1)
	shas["init"] = headSHA(t, dir)

	// Modify in two separate regions so we get multiple hunks.
	lines2 := append([]string{}, lines...)
	lines2[2] = "line 3 CHANGED"  // change near top
	lines2[20] = "line 21 CHANGED" // change far from first
	writeFile(t, dir, "f.txt", strings.Join(lines2, "\n")+"\n")
	commitAll(t, dir, "two hunks", t2)
	shas["twoHunks"] = headSHA(t, dir)

	// Binary modify.
	writeBinary(t, dir, "logo.png", []byte{5, 6, 7, 8, 9, 10})
	commitAll(t, dir, "binary bump", t3)
	shas["binary"] = headSHA(t, dir)

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return r, shas
}

func TestPatch_FirstAndNextBatch(t *testing.T) {
	r, shas := patchFixture(t)
	res, err := r.Patch(PatchSourceCommit, shas["twoHunks"], "f.txt", 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsBinary {
		t.Error("text file should not be binary")
	}
	if res.TotalHunks < 2 {
		t.Fatalf("expected at least 2 hunks, got %d", res.TotalHunks)
	}
	if len(res.Hunks) != 1 {
		t.Errorf("expected first page to have 1 hunk, got %d", len(res.Hunks))
	}
	if !res.MoreAvailable {
		t.Error("expected more_available=true for first page")
	}
	if res.NextHunkOffset == nil || *res.NextHunkOffset != 1 {
		t.Errorf("expected next_hunk_offset=1, got %v", res.NextHunkOffset)
	}

	// Next page.
	res2, err := r.Patch(PatchSourceCommit, shas["twoHunks"], "f.txt", 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(res2.Hunks) != res.TotalHunks-1 {
		t.Errorf("expected %d hunks on next page, got %d", res.TotalHunks-1, len(res2.Hunks))
	}
	if res2.MoreAvailable {
		t.Error("last page should have more_available=false")
	}
	if res2.NextHunkOffset != nil {
		t.Errorf("last page next_hunk_offset should be nil, got %v", *res2.NextHunkOffset)
	}
}

func TestPatch_BinaryFile(t *testing.T) {
	r, shas := patchFixture(t)
	res, err := r.Patch(PatchSourceCommit, shas["binary"], "logo.png", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !res.IsBinary {
		t.Error("expected is_binary=true")
	}
	if res.TotalHunks != 0 {
		t.Errorf("expected total_hunks=0 for binary, got %d", res.TotalHunks)
	}
	if len(res.Hunks) != 0 {
		t.Errorf("expected empty hunks for binary, got %d", len(res.Hunks))
	}
}

func TestPatch_HunkContent(t *testing.T) {
	r, shas := patchFixture(t)
	res, err := r.Patch(PatchSourceCommit, shas["twoHunks"], "f.txt", 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Hunks) == 0 {
		t.Fatal("expected hunks")
	}
	h := res.Hunks[0]
	if h.OldStart < 1 || h.NewStart < 1 {
		t.Errorf("hunk starts must be 1-based, got old=%d new=%d", h.OldStart, h.NewStart)
	}
	// First hunk should contain both a del and an add for "line 3".
	var sawDel, sawAdd bool
	for _, l := range h.Lines {
		if l.Type == "del" && strings.Contains(l.Text, "line 3") {
			sawDel = true
			if strings.HasSuffix(l.Text, "\n") {
				t.Error("line text should have trailing newline stripped")
			}
		}
		if l.Type == "add" && strings.Contains(l.Text, "line 3 CHANGED") {
			sawAdd = true
		}
	}
	if !sawDel || !sawAdd {
		t.Errorf("expected first hunk to contain del+add for line 3, lines=%v", h.Lines)
	}
}

func TestPatch_UnknownPath(t *testing.T) {
	r, shas := patchFixture(t)
	_, err := r.Patch(PatchSourceCommit, shas["init"], "no/such/file", 0, 0)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestPatch_SourceCommitWithoutSHA(t *testing.T) {
	r, _ := patchFixture(t)
	_, err := r.Patch(PatchSourceCommit, "", "f.txt", 0, 0)
	if !errors.Is(err, ErrPatchSourceSHAMismatch) {
		t.Errorf("expected ErrPatchSourceSHAMismatch, got %v", err)
	}
}

func TestPatch_SourceStagedWithSHA(t *testing.T) {
	r, _ := patchFixture(t)
	_, err := r.Patch(PatchSourceStaged, "abcd1234", "f.txt", 0, 0)
	if !errors.Is(err, ErrPatchSourceSHAMismatch) {
		t.Errorf("expected ErrPatchSourceSHAMismatch, got %v", err)
	}
}

func TestPatch_PathTraversal(t *testing.T) {
	r, shas := patchFixture(t)
	cases := []string{"../../etc/passwd", "/etc/passwd"}
	for _, p := range cases {
		_, err := r.Patch(PatchSourceCommit, shas["init"], p, 0, 0)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("path %q: expected ErrNotFound, got %v", p, err)
		}
	}
}

func TestPatch_StagedSource(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "f.txt", "line1\nline2\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))
	writeFile(t, dir, "f.txt", "line1\nline2 changed\nline3\n")
	runGit(t, dir, "add", "f.txt")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Patch(PatchSourceStaged, "", "f.txt", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalHunks == 0 {
		t.Errorf("expected at least one staged hunk")
	}
}

func TestPatch_UnstagedSource(t *testing.T) {
	dir := t.TempDir()
	initRepo(t, dir)
	writeFile(t, dir, "f.txt", "line1\nline2\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))
	writeFile(t, dir, "f.txt", "line1 working\nline2\n")

	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Patch(PatchSourceUnstaged, "", "f.txt", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalHunks == 0 {
		t.Errorf("expected at least one unstaged hunk")
	}
}

func TestPatch_ByteCapWithMultipleHunks(t *testing.T) {
	// Build a fixture where each hunk is large but well under the cap, and
	// many hunks are present. We expect the byte cap to kick in.
	dir := t.TempDir()
	initRepo(t, dir)

	// Build a 1000-line file with lines wide enough that 50 hunks would
	// exceed the 512 KiB cap. Each modified line produces a hunk of ~8 lines
	// (3 context + del + add + 3 context); with 4 KiB per line, that's ~32 KiB
	// per hunk, so the cap kicks in well before 50 hunks.
	const wideLine = "x"
	lines := make([]string, 0, 1000)
	for i := 0; i < 1000; i++ {
		lines = append(lines, strings.Repeat(wideLine, 4096)+" "+itoa(i))
	}
	writeFile(t, dir, "f.txt", strings.Join(lines, "\n")+"\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))

	// Change every 10th line so we get many small but byte-heavy hunks.
	for i := 0; i < len(lines); i += 10 {
		lines[i] = lines[i] + "_CHANGED"
	}
	writeFile(t, dir, "f.txt", strings.Join(lines, "\n")+"\n")
	commitAll(t, dir, "many hunks", time.Date(2025, 1, 2, 10, 0, 0, 0, time.UTC))

	sha := headSHA(t, dir)
	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Patch(PatchSourceCommit, sha, "f.txt", 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if !res.MoreAvailable && res.TotalHunks > 50 {
		t.Errorf("expected byte cap to trigger more_available=true (total=%d returned=%d)",
			res.TotalHunks, len(res.Hunks))
	}
	// Ensure we returned strictly fewer hunks than requested when cap kicks.
	if res.MoreAvailable && len(res.Hunks) == 50 {
		t.Errorf("byte cap should have returned <50 hunks, got 50")
	}
	// Sanity: byte size of returned hunks should be within the cap unless it's
	// the single-oversized-hunk case.
	total := 0
	for _, h := range res.Hunks {
		total += hunkByteSize(h)
	}
	if len(res.Hunks) > 1 && total > patchResponseByteCap {
		t.Errorf("multi-hunk batch exceeded cap: %d bytes", total)
	}
}

func TestPatch_SingleOversizedHunk(t *testing.T) {
	// Build a one-hunk diff whose payload exceeds the cap. The implementation
	// must still return it (a single oversized hunk is allowed alone).
	dir := t.TempDir()
	initRepo(t, dir)
	// Create a single line longer than the cap.
	big := strings.Repeat("a", patchResponseByteCap+1024)
	writeFile(t, dir, "f.txt", big+"\n")
	commitAll(t, dir, "init", time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC))
	// Modify it.
	writeFile(t, dir, "f.txt", "different\n")
	commitAll(t, dir, "shrink", time.Date(2025, 1, 2, 10, 0, 0, 0, time.UTC))

	sha := headSHA(t, dir)
	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	res, err := r.Patch(PatchSourceCommit, sha, "f.txt", 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	if res.IsBinary {
		t.Fatal("non-binary file misclassified as binary")
	}
	if len(res.Hunks) != 1 {
		t.Fatalf("expected single oversized hunk to be returned, got %d", len(res.Hunks))
	}
}
