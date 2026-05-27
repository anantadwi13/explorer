package git

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

const (
	// CommitsDefaultLimit is the default page size for /api/git/commits. Spec
	// says "default 30, maximum 100" — we keep both as exported constants so
	// the HTTP layer can clamp consistently.
	CommitsDefaultLimit = 30
	// CommitsMaxLimit is the spec ceiling. Values above this are silently
	// clamped by Commits.
	CommitsMaxLimit = 100

	shortSHALen = 7
)

// CommitSummary mirrors one element of /api/git/commits.commits.
type CommitSummary struct {
	SHA         string `json:"sha"`
	ShortSHA    string `json:"short_sha"`
	AuthorName  string `json:"author_name"`
	AuthorEmail string `json:"author_email"`
	AuthorTime  string `json:"author_time"` // RFC 3339
	Subject     string `json:"subject"`
	Body        string `json:"body"`
}

// CommitsResult mirrors the JSON shape of GET /api/git/commits.
type CommitsResult struct {
	Commits    []CommitSummary `json:"commits"`
	NextCursor *string         `json:"next_cursor"`
}

// Commits returns up to `limit` commits reachable from `ref`, newest first,
// starting strictly after `cursor` (exclusive) when set.
//
//   - `ref` defaults to HEAD when empty. Accepts a branch name (no `refs/heads/`
//     prefix needed), a tag name, or a short/full sha.
//   - `cursor`, when set, is treated as an exclusive "older than" marker — we
//     walk the log from `ref` and start yielding once we have passed the
//     cursor commit. The cursor commit itself is NOT included.
//   - `limit` defaults to 30 and is clamped to [1, 100].
//   - `path`, when non-empty, restricts the returned commits to those whose
//     first-parent diff touches the path as either an old or new path. The
//     cursor still names a commit sha (not a filtered-page index); the next
//     page filters the same `path` against the next walk segment. Path
//     matching is exact — the walk stops at the first rename boundary for
//     the requested name (older history under a different name is NOT
//     followed transparently in v1).
//
// Unknown refs and unknown cursors both return ErrUnknownRef. A syntactically
// valid but nonexistent `path` yields zero commits, not an error.
func (r *Repo) Commits(ref, cursor string, limit int, path string) (CommitsResult, error) {
	out := CommitsResult{Commits: []CommitSummary{}}

	if limit <= 0 {
		limit = CommitsDefaultLimit
	}
	if limit > CommitsMaxLimit {
		limit = CommitsMaxLimit
	}

	from, err := r.resolveRefToCommit(ref)
	if err != nil {
		// Empty repo on a defaulted ref is not an error — return empty list.
		if ref == "" && errors.Is(err, plumbing.ErrReferenceNotFound) {
			return out, nil
		}
		return out, err
	}

	iter, err := r.repo.Log(&gogit.LogOptions{From: from})
	if err != nil {
		return out, err
	}
	defer iter.Close()

	skipping := cursor != ""
	if skipping && !ValidSHA(cursor) {
		return out, ErrUnknownRef
	}
	cursorPrefix := strings.ToLower(cursor)

	for {
		c, err := iter.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return out, err
		}
		if skipping {
			if strings.HasPrefix(c.Hash.String(), cursorPrefix) {
				// Found the cursor; the next commit is the first one we yield.
				skipping = false
			}
			continue
		}
		if path != "" {
			touches, err := r.commitTouchesPath(c, path)
			if err != nil {
				return out, err
			}
			if !touches {
				continue
			}
		}
		out.Commits = append(out.Commits, summariseCommit(c))
		if len(out.Commits) >= limit {
			break
		}
	}

	// If we filled the page, peek one more to decide whether next_cursor is
	// null. The spec says null when this was the last page.
	if len(out.Commits) >= limit {
		next, err := iter.Next()
		if err == nil && next != nil {
			s := out.Commits[len(out.Commits)-1].SHA
			out.NextCursor = &s
		} else if err != nil && !errors.Is(err, io.EOF) {
			return out, err
		}
	}

	// If we walked the whole log and never saw the cursor, the caller passed
	// a sha that isn't in this branch's history → unknown ref.
	if skipping {
		return out, ErrUnknownRef
	}

	return out, nil
}

// summariseCommit maps an object.Commit into the JSON-friendly CommitSummary.
// Body is everything after the first paragraph break; subject is the first
// line. We trim trailing whitespace so the SPA doesn't have to.
func summariseCommit(c *object.Commit) CommitSummary {
	msg := strings.TrimRight(c.Message, "\n")
	subject := msg
	body := ""
	if i := strings.Index(msg, "\n\n"); i >= 0 {
		subject = msg[:i]
		body = strings.TrimSpace(msg[i+2:])
	} else if nl := strings.IndexByte(msg, '\n'); nl >= 0 {
		subject = msg[:nl]
		body = strings.TrimSpace(msg[nl+1:])
	}
	sha := c.Hash.String()
	return CommitSummary{
		SHA:         sha,
		ShortSHA:    shortSHA(sha),
		AuthorName:  c.Author.Name,
		AuthorEmail: c.Author.Email,
		AuthorTime:  c.Author.When.Format(time.RFC3339),
		Subject:     subject,
		Body:        body,
	}
}

// shortSHA truncates a sha to the short prefix used for display (7 chars).
func shortSHA(sha string) string {
	if len(sha) <= shortSHALen {
		return sha
	}
	return sha[:shortSHALen]
}

// resolveRefToCommit accepts a branch name, tag name, or short/full sha, and
// returns the commit hash the ref ultimately points at. Empty input defaults
// to HEAD. Unknown inputs return ErrUnknownRef.
func (r *Repo) resolveRefToCommit(ref string) (plumbing.Hash, error) {
	if ref == "" {
		h, err := r.repo.Head()
		if err != nil {
			return plumbing.ZeroHash, err
		}
		return h.Hash(), nil
	}

	if !ValidRef(ref) {
		return plumbing.ZeroHash, ErrUnknownRef
	}

	// Try as full / short sha first if it looks like one.
	if ValidSHA(ref) {
		if h, err := r.resolveSHAPrefix(NormaliseSHA(ref)); err == nil {
			return h, nil
		}
	}

	// Then try branch.
	if h, err := r.repo.Reference(plumbing.NewBranchReferenceName(ref), true); err == nil {
		return h.Hash(), nil
	}
	// Then tag (annotated tags must be peeled to a commit).
	if h, err := r.repo.Reference(plumbing.NewTagReferenceName(ref), true); err == nil {
		commit := r.peelTagToCommit(h.Hash())
		return plumbing.NewHash(commit), nil
	}

	return plumbing.ZeroHash, ErrUnknownRef
}

// resolveSHAPrefix expands a short sha (>=4 chars) to a full commit hash,
// erroring when the prefix is ambiguous or matches nothing.
func (r *Repo) resolveSHAPrefix(prefix string) (plumbing.Hash, error) {
	if len(prefix) == 40 {
		h := plumbing.NewHash(prefix)
		if _, err := r.repo.CommitObject(h); err != nil {
			return plumbing.ZeroHash, ErrUnknownRef
		}
		return h, nil
	}

	// Walk object iterators and look for hash strings starting with prefix.
	// This is O(N) over the commit DAG; fine for the playground tool's scale.
	iter, err := r.repo.CommitObjects()
	if err != nil {
		return plumbing.ZeroHash, err
	}
	defer iter.Close()
	var found plumbing.Hash
	matches := 0
	err = iter.ForEach(func(c *object.Commit) error {
		if strings.HasPrefix(c.Hash.String(), prefix) {
			found = c.Hash
			matches++
			if matches > 1 {
				return errAmbiguousSHA
			}
		}
		return nil
	})
	if err != nil && !errors.Is(err, errAmbiguousSHA) {
		return plumbing.ZeroHash, err
	}
	if matches == 0 || matches > 1 {
		return plumbing.ZeroHash, ErrUnknownRef
	}
	return found, nil
}

var errAmbiguousSHA = errors.New("ambiguous short sha")

// commitTouchesPath reports whether the commit's first-parent diff includes
// `path` as either an old or new path. Root commits are diffed against an
// empty tree (so an addition of `path` at the root commit also matches).
// Rename detection is enabled — a rename commit matches under whichever name
// (old or new) `path` happens to be. This makes "stop at rename boundary"
// fall out naturally: older history under a different name does not touch
// the requested name and is dropped.
func (r *Repo) commitTouchesPath(c *object.Commit, path string) (bool, error) {
	currentTree, err := c.Tree()
	if err != nil {
		return false, err
	}
	var parentTree *object.Tree
	if c.NumParents() > 0 {
		parent, err := c.Parent(0)
		if err != nil {
			return false, err
		}
		parentTree, err = parent.Tree()
		if err != nil {
			return false, err
		}
	}
	changes, err := object.DiffTreeWithOptions(context.Background(), parentTree, currentTree, &object.DiffTreeOptions{
		DetectRenames: true,
	})
	if err != nil {
		return false, err
	}
	for _, ch := range changes {
		if ch.From.Name == path || ch.To.Name == path {
			return true, nil
		}
	}
	return false, nil
}
