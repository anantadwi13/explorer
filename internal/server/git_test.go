package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/anantadwi13/explorer/internal/server"
)

// gitTestEnv mirrors the test helpers inside internal/server/git (kept in
// sync because both run shell git commands deterministically).
var gitTestEnv = []string{
	"GIT_AUTHOR_NAME=Sample Author",
	"GIT_AUTHOR_EMAIL=author@example.com",
	"GIT_COMMITTER_NAME=Sample Committer",
	"GIT_COMMITTER_EMAIL=committer@example.com",
	"GIT_CONFIG_GLOBAL=/dev/null",
	"GIT_CONFIG_SYSTEM=/dev/null",
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	runGitAt(t, dir, time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC), args...)
}

func runGitAt(t *testing.T, dir string, when time.Time, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		append(gitTestEnv,
			"GIT_AUTHOR_DATE="+when.Format(time.RFC3339),
			"GIT_COMMITTER_DATE="+when.Format(time.RFC3339),
		)...,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func writeFile(t *testing.T, dir, path, body string) {
	t.Helper()
	full := filepath.Join(dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func initRepo(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, "init", "--initial-branch=main")
	runGit(t, dir, "config", "user.name", "Sample Committer")
	runGit(t, dir, "config", "user.email", "committer@example.com")
	runGit(t, dir, "config", "commit.gpgsign", "false")
}

func headSHA(t *testing.T, dir string) string {
	t.Helper()
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("rev-parse: %v", err)
	}
	return strings.TrimSpace(string(out))
}

// makeRepoTestRoot creates a small repo with a couple of commits, a tag, and
// a working-tree state, for use by handler tests.
func makeRepoTestRoot(t *testing.T) (string, []string) {
	t.Helper()
	dir := t.TempDir()
	initRepo(t, dir)
	var shas []string
	t1 := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(24 * time.Hour)

	writeFile(t, dir, "README.md", "v1\n")
	runGitAt(t, dir, t1, "add", "-A")
	runGitAt(t, dir, t1, "commit", "-m", "first")
	shas = append(shas, headSHA(t, dir))

	writeFile(t, dir, "README.md", "v2\nmore\n")
	runGitAt(t, dir, t2, "add", "-A")
	runGitAt(t, dir, t2, "commit", "-m", "second")
	shas = append(shas, headSHA(t, dir))

	// lightweight tag for /api/git/refs test
	runGitAt(t, dir, t2, "tag", "v0.1.0")

	// secondary branch
	runGit(t, dir, "branch", "feature/x")

	// working-tree state: 1 staged, 1 unstaged, 1 untracked
	writeFile(t, dir, "staged.txt", "staged content\n")
	runGit(t, dir, "add", "staged.txt")
	writeFile(t, dir, "README.md", "v2\nmore\nunstaged change\n")
	writeFile(t, dir, "untracked.txt", "untracked\n")

	return dir, shas
}

func TestGitInfo_NonRepoReturnsIsRepoFalse(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "README.md", "no repo here")

	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/info", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for non-repo /api/git/info, got %d", w.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got["is_repo"] != false {
		t.Errorf("expected is_repo=false, got %v", got["is_repo"])
	}
	// Non-repo response should contain ONLY is_repo (spec: head_ref etc. are
	// omitted, not null).
	for _, k := range []string{"head_ref", "head_sha", "detached"} {
		if _, present := got[k]; present {
			t.Errorf("non-repo response should omit %q, got %v", k, got[k])
		}
	}
}

func TestGitInfo_RepoReturnsHeadFields(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/info", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("got %d", w.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got["is_repo"] != true {
		t.Errorf("expected is_repo=true, got %v", got["is_repo"])
	}
	if got["head_ref"] != "refs/heads/main" {
		t.Errorf("expected head_ref=refs/heads/main, got %v", got["head_ref"])
	}
	if got["detached"] != false {
		t.Errorf("expected detached=false, got %v", got["detached"])
	}
}

func TestGitRefs_BranchesAndTags(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/refs", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("got %d", w.Code)
	}
	var got struct {
		Branches []map[string]string `json:"branches"`
		Tags     []map[string]string `json:"tags"`
	}
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if len(got.Branches) != 2 {
		t.Errorf("expected 2 branches (main, feature/x), got %d", len(got.Branches))
	}
	if len(got.Tags) != 1 || got.Tags[0]["name"] != "v0.1.0" {
		t.Errorf("expected one tag v0.1.0, got %v", got.Tags)
	}
}

func TestGitRefs_NotARepo(t *testing.T) {
	root := t.TempDir()
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/refs", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got["error"] != "not_a_repo" {
		t.Errorf("expected error=not_a_repo, got %v", got["error"])
	}
}

func TestGitCommits_Defaults(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/commits", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("got %d", w.Code)
	}
	var got struct {
		Commits []map[string]any `json:"commits"`
	}
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if len(got.Commits) != 2 {
		t.Fatalf("expected 2 commits, got %d", len(got.Commits))
	}
	if got.Commits[0]["sha"] != shas[1] {
		t.Errorf("first commit should be newest=%s, got %v", shas[1], got.Commits[0]["sha"])
	}
}

func TestGitCommits_UnknownRef(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/commits?ref=does-not-exist", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	if got["error"] != "unknown_ref" {
		t.Errorf("expected error=unknown_ref, got %v", got["error"])
	}
}

func TestGitCommits_BranchWithSlashEncoded(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	u := "/api/git/commits?ref=" + url.QueryEscape("feature/x")
	req := httptest.NewRequest(http.MethodGet, u, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for feature/x, got %d (%s)", w.Code, w.Body.String())
	}
}

func TestGitCommit_MissingSHA(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/commit", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing sha, got %d", w.Code)
	}
}

func TestGitCommit_InvalidSHAFormatReturnsUnknownRef(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/commit?sha=nothex", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	if got["error"] != "unknown_ref" {
		t.Errorf("expected unknown_ref, got %v", got["error"])
	}
}

func TestGitCommit_FullSHA(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/commit?sha="+shas[1], nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	if got["sha"] != shas[1] {
		t.Errorf("sha mismatch: %v", got["sha"])
	}
}

func TestGitStatus_Mixed(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/status", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got struct {
		Staged    []map[string]any `json:"staged"`
		Unstaged  []map[string]any `json:"unstaged"`
		Untracked []map[string]any `json:"untracked"`
	}
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if len(got.Staged) != 1 {
		t.Errorf("expected 1 staged, got %d", len(got.Staged))
	}
	if len(got.Unstaged) != 1 {
		t.Errorf("expected 1 unstaged, got %d", len(got.Unstaged))
	}
	if len(got.Untracked) != 1 {
		t.Errorf("expected 1 untracked, got %d", len(got.Untracked))
	}
}

func TestGitPatch_CommitWithoutSHA(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/git/patch?source=commit&path=README.md", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for commit without sha, got %d", w.Code)
	}
}

func TestGitPatch_StagedWithSHA(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	u := "/api/git/patch?source=staged&sha=" + shas[1] + "&path=README.md"
	req := httptest.NewRequest(http.MethodGet, u, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for staged with sha, got %d", w.Code)
	}
}

func TestGitPatch_PathTraversal(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	u := "/api/git/patch?source=commit&sha=" + shas[1] + "&path=" + url.QueryEscape("../../etc/passwd")
	req := httptest.NewRequest(http.MethodGet, u, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for path traversal, got %d", w.Code)
	}
}

func TestGitInfo_AncestorDotGitDoesNotCount(t *testing.T) {
	// Set up a repo at <parent>/repo and serve <parent>/repo/sub. The gate
	// must report is_repo=false because .git is only in the ancestor.
	parent := t.TempDir()
	repo := filepath.Join(parent, "repo")
	initRepo(t, repo)
	writeFile(t, repo, "README.md", "x")
	runGitAt(t, repo, time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC), "add", "-A")
	runGitAt(t, repo, time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC), "commit", "-m", "init")

	sub := filepath.Join(repo, "sub")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}

	srv := server.New(sub)
	req := httptest.NewRequest(http.MethodGet, "/api/git/info", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	if got["is_repo"] != false {
		t.Errorf("ancestor .git should not satisfy the gate, got is_repo=%v", got["is_repo"])
	}
}

// --- /api/meta?ref= and /raw/?ref= tests ---

func TestMetaAtRef_FullSHA(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=README.md&ref="+shas[0], nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	// Commit 1's README.md is "v1\n" (3 bytes).
	if int(got["size"].(float64)) != 3 {
		t.Errorf("expected size=3 at first commit, got %v", got["size"])
	}
	if got["kind"] != "markdown" {
		t.Errorf("expected kind=markdown, got %v", got["kind"])
	}
}

func TestMetaAtRef_BranchName(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=README.md&ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	// main is at second commit — README.md is "v2\nmore\n" (8 bytes).
	if int(got["size"].(float64)) != 8 {
		t.Errorf("expected size=8 at main tip, got %v", got["size"])
	}
}

func TestMetaAtRef_TagName(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=README.md&ref=v0.1.0", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMetaAtRef_ParentViaCaret(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	// shas[1]^ → shas[0] → README.md is "v1\n" (3 bytes).
	u := "/api/meta?path=README.md&ref=" + shas[1] + url.QueryEscape("^")
	req := httptest.NewRequest(http.MethodGet, u, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got map[string]any
	json.NewDecoder(w.Body).Decode(&got)
	if int(got["size"].(float64)) != 3 {
		t.Errorf("expected size=3 (parent commit), got %v", got["size"])
	}
}

func TestMetaAtRef_UnknownRef(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=README.md&ref=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "unknown_ref")
}

func TestMetaAtRef_FileAbsentReturnsNotFound(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=missing.txt&ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	// Must be not_found (file not in tree), not unknown_ref (ref does resolve).
	assertErrorKind(t, w.Body.String(), "not_found")
}

func TestMetaAtRef_PathEscapeReturnsNotFound(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=../../etc/passwd&ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	// In ref-scoped mode, a `..` path is just an absent tree entry — not_found,
	// not outside_root.
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "not_found")
}

func TestMetaAtRef_NonRepoRootReturnsUnknownRef(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "README.md", "hi\n")
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/api/meta?path=README.md&ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "unknown_ref")
}

func TestRawAtRef_FullSHA(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/raw/README.md?ref="+shas[0], nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got := w.Body.String(); got != "v1\n" {
		t.Errorf("body %q, want %q", got, "v1\n")
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/markdown") {
		t.Errorf("expected text/markdown content-type, got %q", ct)
	}
	if w.Header().Get("Content-Disposition") != "" {
		t.Error("/raw/?ref= must not set Content-Disposition")
	}
}

func TestRawAtRef_BranchName(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/raw/README.md?ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if got := w.Body.String(); got != "v2\nmore\n" {
		t.Errorf("body %q, want %q", got, "v2\nmore\n")
	}
}

func TestRawAtRef_ParentViaCaret(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	u := "/raw/README.md?ref=" + shas[1] + url.QueryEscape("^")
	req := httptest.NewRequest(http.MethodGet, u, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if got := w.Body.String(); got != "v1\n" {
		t.Errorf("body %q, want %q", got, "v1\n")
	}
}

func TestRawAtRef_UnknownRef(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/raw/README.md?ref=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "unknown_ref")
}

func TestRawAtRef_FileAbsentReturnsNotFound(t *testing.T) {
	root, _ := makeRepoTestRoot(t)
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/raw/missing.txt?ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "not_found")
}

// Note: a /raw/../etc/passwd?ref=… scenario is path-cleaned by net/http's
// ServeMux before reaching the handler (returns 301 to the cleaned URL), so
// the HTTP-layer path-escape test isn't exercisable through httptest. The
// structural guarantee (ref-scoped requests can't escape the tree) is
// covered at the BlobAt unit-test level — see TestBlobAt_PathEscapeStructurallyBounded.

func TestRawAtRef_NonRepoRootReturnsUnknownRef(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "README.md", "hi\n")
	srv := server.New(root)
	req := httptest.NewRequest(http.MethodGet, "/raw/README.md?ref=main", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
	assertErrorKind(t, w.Body.String(), "unknown_ref")
}

func TestBlameAtRef_CaretSuffix(t *testing.T) {
	root, shas := makeRepoTestRoot(t)
	srv := server.New(root)
	u := "/api/git/blame?path=README.md&ref=" + shas[1] + url.QueryEscape("^")
	req := httptest.NewRequest(http.MethodGet, u, nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got struct {
		SHA    string                   `json:"sha"`
		Dirty  bool                     `json:"dirty"`
		Chunks []map[string]interface{} `json:"chunks"`
	}
	json.NewDecoder(w.Body).Decode(&got)
	if got.SHA != shas[0] {
		t.Errorf("expected blame at shas[0]=%s (parent of shas[1]), got %s", shas[0], got.SHA)
	}
	if got.Dirty {
		t.Errorf("explicit-ref blame should have dirty=false")
	}
	for _, c := range got.Chunks {
		if uc, _ := c["uncommitted"].(bool); uc {
			t.Errorf("explicit-ref blame must not produce uncommitted chunks: %+v", c)
		}
	}
}
