package git

import (
	"errors"
	"strings"

	"github.com/go-git/go-git/v5/plumbing"
)

// InfoResult mirrors the JSON shape of GET /api/git/info for repos that exist.
// The non-repo response shape (`{is_repo: false}` with no other fields) is
// produced by the HTTP layer — this struct is only the repo-present case.
type InfoResult struct {
	IsRepo   bool    `json:"is_repo"`
	HeadRef  *string `json:"head_ref"`
	HeadSHA  *string `json:"head_sha"`
	Detached bool    `json:"detached"`
}

// Info returns the high-level repo state used by the SPA on first paint.
// Handles three cases:
//   - normal branch: head_ref is the symbolic ref (refs/heads/<name>), head_sha
//     is the resolved commit sha, detached=false.
//   - detached HEAD: head_ref is nil, head_sha is the commit sha, detached=true.
//   - empty repo: head_ref and head_sha are both nil, detached=false.
func (r *Repo) Info() (InfoResult, error) {
	out := InfoResult{IsRepo: true}

	// Read the raw HEAD reference first so we can distinguish "symbolic ref
	// to a branch with no commits" from "detached HEAD at a commit". go-git's
	// Head() resolves the ref, which would lose this distinction.
	headRef, err := r.repo.Reference(plumbing.HEAD, false)
	if err != nil {
		// HEAD missing entirely — treat as empty repo. This is unusual but
		// keeps the SPA from breaking on a freshly-init'd repo.
		return out, nil
	}

	switch headRef.Type() {
	case plumbing.SymbolicReference:
		// HEAD -> refs/heads/<branch>. Try to resolve.
		target := headRef.Target().String()
		out.HeadRef = strPtr(target)

		resolved, err := r.repo.Reference(headRef.Target(), true)
		if err != nil {
			// Symbolic ref exists but target does not — empty repo on a
			// branch with no commits yet. Keep head_ref but leave head_sha nil.
			if errors.Is(err, plumbing.ErrReferenceNotFound) {
				out.HeadRef = nil
				return out, nil
			}
			return out, err
		}
		sha := resolved.Hash().String()
		out.HeadSHA = strPtr(sha)
	case plumbing.HashReference:
		// Detached HEAD — HEAD points directly at a commit.
		sha := headRef.Hash().String()
		out.HeadSHA = strPtr(sha)
		out.Detached = true
	}

	return out, nil
}

func strPtr(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
