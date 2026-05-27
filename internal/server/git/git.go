// Package git wraps go-git to back the read-only git-reader HTTP surface.
//
// The package never shells out; everything is driven by
// github.com/go-git/go-git/v5. The gate is strict: a `.git` entry (directory
// or worktree pointer file) must exist at the served root itself. We do NOT
// walk ancestor directories looking for a `.git` — that is a deliberate spec
// decision so "what is the repo?" is unambiguous from the served root.
package git

import (
	"errors"
	"os"
	"path/filepath"

	gogit "github.com/go-git/go-git/v5"
)

// ErrNotARepo is returned by Open when the served root has no `.git` at its
// top level. The caller maps this to the typed `not_a_repo` HTTP error.
var ErrNotARepo = errors.New("not a git repository")

// ErrUnknownRef is returned when a ref/sha cannot be resolved. The caller
// maps this to the typed `unknown_ref` HTTP error.
var ErrUnknownRef = errors.New("unknown ref")

// ErrNotFound is returned when a path cannot be located in the requested tree
// or index. The caller maps this to the typed `not_found` HTTP error.
var ErrNotFound = errors.New("not found")

// ErrTooLarge is returned when a file exceeds an inline cap (currently the
// 5 MiB limit shared with /api/meta and the SPA's INLINE_CAP). The caller maps
// this to the typed `too_large` HTTP error.
var ErrTooLarge = errors.New("file too large")

// ErrBlameTimeout is returned when a blame computation exceeds its server-side
// deadline. The caller maps this to the typed `blame_timeout` HTTP error
// (HTTP 503), distinct from a generic `internal_error` so the SPA can render
// the "use the History view instead" fallback.
var ErrBlameTimeout = errors.New("blame timeout")

// Repo is a small wrapper around *gogit.Repository scoped to one served root.
// Each request constructs a fresh Repo via Open — there is no caching, as
// required by the spec (the `.git` gate is re-evaluated every request).
type Repo struct {
	root string
	repo *gogit.Repository
}

// Open returns a Repo if the served root contains a `.git` entry at its top
// level (either a directory or a worktree-pointer file). It does NOT walk
// ancestor directories — `.git` must be at `root` itself.
//
// If `.git` is absent, Open returns ErrNotARepo (no wrap, no other I/O).
func Open(root string) (*Repo, error) {
	dotGit := filepath.Join(root, ".git")
	if _, err := os.Lstat(dotGit); err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotARepo
		}
		return nil, err
	}

	// PlainOpen handles both a `.git` directory and a `.git` worktree-pointer
	// file (a regular file beginning with `gitdir: …`). DetectDotGit defaults
	// to false, so this will NOT walk to ancestors — exactly what we want.
	r, err := gogit.PlainOpen(root)
	if err != nil {
		if errors.Is(err, gogit.ErrRepositoryNotExists) {
			return nil, ErrNotARepo
		}
		return nil, err
	}

	return &Repo{root: root, repo: r}, nil
}

// Root returns the served root the repo was opened against.
func (r *Repo) Root() string { return r.root }
