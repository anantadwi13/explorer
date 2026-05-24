package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// gitEnv is the deterministic identity used by all test helpers. Keep it in
// sync with scripts/sample-repo.sh — production code does not depend on
// these values, but tests do.
var gitEnv = []string{
	"GIT_AUTHOR_NAME=Sample Author",
	"GIT_AUTHOR_EMAIL=author@example.com",
	"GIT_COMMITTER_NAME=Sample Committer",
	"GIT_COMMITTER_EMAIL=committer@example.com",
}

// runGit runs `git args...` in dir with the deterministic env applied. Tests
// use this to set up fixture repos without taking on go-git's API for setup.
// (Using the CLI for setup keeps the test-side surface small and avoids
// re-testing go-git itself.)
func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	runGitWithTime(t, dir, time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC), args...)
}

func runGitWithTime(t *testing.T, dir string, when time.Time, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		append(gitEnv,
			"GIT_AUTHOR_DATE="+when.Format(time.RFC3339),
			"GIT_COMMITTER_DATE="+when.Format(time.RFC3339),
			// Avoid host-config interference (signing, hooks, init.defaultBranch).
			"GIT_CONFIG_GLOBAL=/dev/null",
			"GIT_CONFIG_SYSTEM=/dev/null",
		)...,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\noutput: %s", args, err, out)
	}
}

// initRepo creates an empty repo at dir with main as the initial branch and
// the deterministic identity configured. Subsequent commits get the same
// timestamp unless overridden via runGitWithTime.
func initRepo(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Some old git versions don't support --initial-branch; fall back to
	// symbolic-ref HEAD update.
	runGit(t, dir, "init", "--initial-branch=main")
	runGit(t, dir, "config", "user.name", "Sample Committer")
	runGit(t, dir, "config", "user.email", "committer@example.com")
	runGit(t, dir, "config", "commit.gpgsign", "false")
}

// writeFile writes content to dir/path, creating parents.
func writeFile(t *testing.T, dir, path, content string) {
	t.Helper()
	full := filepath.Join(dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// commitAll adds everything and commits with the given message at the given time.
func commitAll(t *testing.T, dir, msg string, when time.Time) {
	t.Helper()
	runGitWithTime(t, dir, when, "add", "-A")
	runGitWithTime(t, dir, when, "commit", "-m", msg)
}

// headSHA returns the resolved sha of HEAD in dir.
func headSHA(t *testing.T, dir string) string {
	t.Helper()
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("rev-parse HEAD: %v", err)
	}
	return strings.TrimSpace(string(out))
}

// newGitCmd returns an *exec.Cmd configured with the deterministic env, ready
// for the caller to .Run or .CombinedOutput. Used when the caller wants to
// handle non-zero exit codes itself (e.g. for tests that expect a conflict).
func newGitCmd(dir string, args ...string) *exec.Cmd {
	when := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(),
		append(gitEnv,
			"GIT_AUTHOR_DATE="+when.Format(time.RFC3339),
			"GIT_COMMITTER_DATE="+when.Format(time.RFC3339),
			"GIT_CONFIG_GLOBAL=/dev/null",
			"GIT_CONFIG_SYSTEM=/dev/null",
		)...,
	)
	return cmd
}
