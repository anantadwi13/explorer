package git

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/utils/diff"
	"github.com/sergi/go-diff/diffmatchpatch"

	"github.com/anantadwi13/explorer/internal/server/resolver"
)

// BlameDefaultDeadline is the spec-mandated ~10s server-side budget for a
// single blame computation. Exceeding it produces ErrBlameTimeout (HTTP 503
// at the boundary) rather than a generic internal error, so the SPA can
// route the user to the cheaper History view as a fallback.
const BlameDefaultDeadline = 10 * time.Second

// BlameMaxFileSize is the inline-preview cap reused for blame. Matches
// internal/server/api.go inlineSizeCap and the SPA's INLINE_CAP. Files larger
// than this respond with ErrTooLarge before any blame walk starts.
const BlameMaxFileSize = 5 * 1024 * 1024

// BlameCommit is the per-chunk commit summary returned by /api/git/blame.
// Distinct from CommitSummary (used by /api/git/commits) — blame drops `body`
// to keep chunk payloads small; every line in the file references one of
// these objects so the size cost matters.
type BlameCommit struct {
	SHA         string `json:"sha"`
	ShortSHA    string `json:"short_sha"`
	AuthorName  string `json:"author_name"`
	AuthorEmail string `json:"author_email"`
	AuthorTime  string `json:"author_time"` // RFC 3339
	Subject     string `json:"subject"`
}

// BlameChunk is one run of consecutive lines that share an attribution. The
// chunk is **either** committed (Commit non-nil, Uncommitted false) or
// uncommitted (Commit nil, Uncommitted true) — the two are mutually exclusive
// and the JSON `omitempty` rules below make sure each chunk renders as one
// shape or the other on the wire.
type BlameChunk struct {
	StartLine   int          `json:"start_line"`
	LineCount   int          `json:"line_count"`
	Commit      *BlameCommit `json:"commit,omitempty"`
	Uncommitted bool         `json:"uncommitted,omitempty"`
}

// BlameResult mirrors the JSON shape of GET /api/git/blame.
type BlameResult struct {
	Path       string       `json:"path"`
	Ref        string       `json:"ref"`
	SHA        string       `json:"sha"`
	TotalLines int          `json:"total_lines"`
	Dirty      bool         `json:"dirty"`
	Chunks     []BlameChunk `json:"chunks"`
}

// Blame returns per-line attribution for `path` at `ref`, grouped into chunks.
//
//   - `ref` empty (or resolving to HEAD's commit): if the file is dirty in
//     the working tree, the result is a working-tree overlay — lines that
//     match HEAD carry their HEAD blame, locally-changed lines become
//     uncommitted chunks, and `dirty` is true. Otherwise the file is blamed
//     directly against HEAD with `dirty: false`.
//   - `ref` is an explicit historical ref (resolves to a non-HEAD commit):
//     blame is computed directly against that commit's tree, `dirty: false`,
//     even when the working tree has uncommitted changes to the path.
//
// `res` is the path-resolver chokepoint; the dirty branch uses it to read
// working-tree bytes. Pass nil only if the caller is sure the dirty branch
// will not be hit (tests that pre-clean the worktree).
//
// `deadline`, when positive, bounds the total computation; exceeding it
// returns ErrBlameTimeout. Pass 0 to use BlameDefaultDeadline.
func (r *Repo) Blame(res *resolver.Resolver, path, ref string, deadline time.Duration) (BlameResult, error) {
	out := BlameResult{Path: path, Chunks: []BlameChunk{}}

	if path == "" {
		return out, ErrNotFound
	}
	if deadline <= 0 {
		deadline = BlameDefaultDeadline
	}

	// Resolve the requested ref to a commit. Empty ref defaults to HEAD.
	headHash, headErr := r.repo.Head()
	var headCommit *object.Commit
	if headErr == nil {
		hc, err := r.repo.CommitObject(headHash.Hash())
		if err == nil {
			headCommit = hc
		}
	}

	useHead := ref == "" || strings.EqualFold(ref, "HEAD")
	var target *object.Commit
	if useHead {
		if headCommit == nil {
			return out, ErrNotFound
		}
		target = headCommit
	} else {
		hash, err := r.resolveRefToCommit(ref)
		if err != nil {
			return out, err
		}
		c, err := r.repo.CommitObject(hash)
		if err != nil {
			if errors.Is(err, plumbing.ErrObjectNotFound) {
				return out, ErrUnknownRef
			}
			return out, err
		}
		target = c
		// If the explicit ref resolves to HEAD's commit, treat it as HEAD —
		// the spec considers an overlay only when ref does NOT resolve to the
		// same commit as HEAD.
		if headCommit != nil && target.Hash == headCommit.Hash {
			useHead = true
		}
	}

	// Verify the file exists at `target` and check the inline size cap.
	tree, err := target.Tree()
	if err != nil {
		return out, err
	}
	file, err := tree.File(path)
	fileMissingAtTarget := false
	if err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			fileMissingAtTarget = true
		} else {
			return out, err
		}
	}

	// Decide which branch to take. The dirty overlay applies only when the
	// effective ref is HEAD AND the path is staged or unstaged. An untracked
	// path falls through to not_found. A clean tracked path uses the simple
	// branch.
	bucket := "clean"
	if useHead {
		bucket = r.pathStatusBucket(path)
	}

	if fileMissingAtTarget && bucket == "clean" {
		return out, ErrNotFound
	}
	if bucket == "untracked" {
		return out, ErrNotFound
	}

	if !fileMissingAtTarget {
		if file.Size > BlameMaxFileSize {
			return out, ErrTooLarge
		}
	}

	doOverlay := useHead && (bucket == "staged" || bucket == "unstaged")

	// Bound the computation by a context deadline. Both branches respect it.
	ctx, cancel := context.WithTimeout(context.Background(), deadline)
	defer cancel()

	if doOverlay {
		return r.blameWithOverlay(ctx, res, target, path)
	}

	return r.blameDirect(ctx, target, ref, path)
}

// blameDirect runs go-git's blame against `target` and returns chunks. Used
// for clean HEAD-or-historical cases. The resulting `dirty` field is always
// false and `ref` echoes back the caller's value (or "HEAD" when empty).
func (r *Repo) blameDirect(ctx context.Context, target *object.Commit, refLabel, path string) (BlameResult, error) {
	out := BlameResult{Path: path, Chunks: []BlameChunk{}}
	if refLabel == "" {
		refLabel = "HEAD"
	}
	out.Ref = refLabel
	out.SHA = target.Hash.String()

	blame, err := runBlame(ctx, target, path)
	if err != nil {
		return out, err
	}

	if err := r.clampToRenameBoundary(target, path, blame.Lines); err != nil {
		return out, err
	}

	out.TotalLines = len(blame.Lines)
	summaries := newSummaryCache(r)
	chunks, err := chunksFromBlame(blame.Lines, summaries)
	if err != nil {
		return out, err
	}
	out.Chunks = chunks
	return out, nil
}

// blameWithOverlay runs the dirty-overlay branch: diff HEAD blob against
// working-tree bytes, blame HEAD, then walk the working-tree lines marking
// each line as either inheriting HEAD's blame (unchanged) or `uncommitted`
// (inserted/modified).
func (r *Repo) blameWithOverlay(ctx context.Context, res *resolver.Resolver, head *object.Commit, path string) (BlameResult, error) {
	out := BlameResult{Path: path, Chunks: []BlameChunk{}, Dirty: true, Ref: "HEAD", SHA: head.Hash.String()}

	// HEAD blob (may be missing for a fresh-added-to-index file — in that
	// case every working-tree line is uncommitted).
	tree, err := head.Tree()
	if err != nil {
		return out, err
	}
	var headBytes []byte
	headFile, err := tree.File(path)
	switch {
	case err == nil:
		rd, err := headFile.Reader()
		if err != nil {
			return out, err
		}
		headBytes, err = io.ReadAll(rd)
		_ = rd.Close()
		if err != nil {
			return out, err
		}
	case errors.Is(err, object.ErrFileNotFound):
		headBytes = nil
	default:
		return out, err
	}

	// Working-tree bytes via the resolver (the documented exception where
	// path-resolver IS applied inside /api/git/*). Out-of-root or absolute
	// paths bubble back to the caller through ResolveError.
	if res == nil {
		return out, errors.New("blame overlay: resolver required for working-tree read")
	}
	resolved, err := res.Resolve(path)
	if err != nil {
		return out, err
	}
	if !resolved.Info.Mode().IsRegular() {
		return out, ErrNotFound
	}
	if resolved.Info.Size() > BlameMaxFileSize {
		return out, ErrTooLarge
	}
	wtBytes, err := os.ReadFile(resolved.AbsPath)
	if err != nil {
		return out, err
	}

	// Blame HEAD only if the file existed there — otherwise every working-
	// tree line is uncommitted by construction (a brand-new staged file).
	var headLines []*gogit.Line
	if headBytes != nil {
		blame, err := runBlame(ctx, head, path)
		if err != nil {
			return out, err
		}
		if err := r.clampToRenameBoundary(head, path, blame.Lines); err != nil {
			return out, err
		}
		headLines = blame.Lines
	}

	// Diff HEAD bytes against working-tree bytes. Each output line maps to
	// either a HEAD line index (DiffEqual: from both, advances both) or
	// "inserted" (DiffInsert: only in working tree). DiffDelete advances
	// only the HEAD index. The order matches the working-tree file.
	overlay := overlayLines(headBytes, wtBytes, headLines)
	out.TotalLines = len(overlay)

	summaries := newSummaryCache(r)
	chunks, err := chunksFromOverlay(overlay, summaries)
	if err != nil {
		return out, err
	}
	out.Chunks = chunks
	return out, nil
}

// overlayLine is one element of the working-tree-aligned attribution stream.
// Exactly one of `commitHash` (zero hash → no attribution) or `uncommitted`
// is meaningful; the rest of the file enforces the invariant.
type overlayLine struct {
	uncommitted bool
	commitHash  plumbing.Hash
	authorName  string
	authorEmail string
	authorTime  time.Time
}

// overlayLines walks the diff between HEAD bytes and working-tree bytes,
// emitting one entry per working-tree line. The same line-splitting helper
// (splitKeepNL) the patch endpoint uses keeps multi-line ops flattened to a
// single granularity.
func overlayLines(headBytes, wtBytes []byte, headLines []*gogit.Line) []overlayLine {
	ops := diff.Do(string(headBytes), string(wtBytes))
	var out []overlayLine
	headIdx := 0
	for _, op := range ops {
		for range splitKeepNL(op.Text) {
			switch op.Type {
			case diffmatchpatch.DiffEqual:
				if headIdx < len(headLines) && headLines[headIdx] != nil {
					l := headLines[headIdx]
					out = append(out, overlayLine{
						commitHash:  l.Hash,
						authorName:  l.AuthorName,
						authorEmail: l.Author,
						authorTime:  l.Date,
					})
				} else {
					// HEAD blame ran short relative to the diff (shouldn't
					// happen on well-formed input, but stay safe).
					out = append(out, overlayLine{uncommitted: true})
				}
				headIdx++
			case diffmatchpatch.DiffInsert:
				out = append(out, overlayLine{uncommitted: true})
			case diffmatchpatch.DiffDelete:
				headIdx++
			}
		}
	}
	return out
}

// chunksFromBlame coalesces a go-git blame line array (every line attributed
// to a commit) into the wire chunk shape. Each run of same-hash lines becomes
// one committed chunk.
func chunksFromBlame(lines []*gogit.Line, summaries *summaryCache) ([]BlameChunk, error) {
	out := []BlameChunk{}
	if len(lines) == 0 {
		return out, nil
	}
	start := 1
	count := 0
	var currentHash plumbing.Hash
	flush := func(end int) error {
		if count == 0 {
			return nil
		}
		c, err := summaries.lookup(currentHash)
		if err != nil {
			return err
		}
		out = append(out, BlameChunk{StartLine: start, LineCount: count, Commit: c})
		start = end + 1
		count = 0
		return nil
	}
	for i, l := range lines {
		if l == nil {
			continue
		}
		if i == 0 {
			currentHash = l.Hash
			count = 1
			continue
		}
		if l.Hash == currentHash {
			count++
			continue
		}
		if err := flush(i); err != nil {
			return nil, err
		}
		currentHash = l.Hash
		count = 1
	}
	if err := flush(len(lines)); err != nil {
		return nil, err
	}
	return out, nil
}

// chunksFromOverlay coalesces an overlayLine stream into chunks. Adjacent
// uncommitted lines merge into one uncommitted chunk; adjacent same-commit
// lines merge into one committed chunk.
func chunksFromOverlay(lines []overlayLine, summaries *summaryCache) ([]BlameChunk, error) {
	out := []BlameChunk{}
	if len(lines) == 0 {
		return out, nil
	}
	start := 1
	count := 0
	uncommitted := false
	var currentHash plumbing.Hash
	flush := func(end int) error {
		if count == 0 {
			return nil
		}
		if uncommitted {
			out = append(out, BlameChunk{StartLine: start, LineCount: count, Uncommitted: true})
		} else {
			c, err := summaries.lookup(currentHash)
			if err != nil {
				return err
			}
			out = append(out, BlameChunk{StartLine: start, LineCount: count, Commit: c})
		}
		start = end + 1
		count = 0
		return nil
	}
	for i, l := range lines {
		if i == 0 {
			uncommitted = l.uncommitted
			currentHash = l.commitHash
			count = 1
			continue
		}
		sameRun := false
		if l.uncommitted && uncommitted {
			sameRun = true
		} else if !l.uncommitted && !uncommitted && l.commitHash == currentHash {
			sameRun = true
		}
		if sameRun {
			count++
			continue
		}
		if err := flush(i); err != nil {
			return nil, err
		}
		uncommitted = l.uncommitted
		currentHash = l.commitHash
		count = 1
	}
	if err := flush(len(lines)); err != nil {
		return nil, err
	}
	return out, nil
}

// summaryCache memoises BlameCommit lookups per blame call. Most files have
// long runs of single-author lines and even multi-author files re-reference
// the same handful of commits — caching saves a CommitObject lookup per chunk
// (or worse, per line).
type summaryCache struct {
	r     *Repo
	cache map[plumbing.Hash]*BlameCommit
}

func newSummaryCache(r *Repo) *summaryCache {
	return &summaryCache{r: r, cache: map[plumbing.Hash]*BlameCommit{}}
}

func (s *summaryCache) lookup(h plumbing.Hash) (*BlameCommit, error) {
	if c, ok := s.cache[h]; ok {
		return c, nil
	}
	c, err := s.r.repo.CommitObject(h)
	if err != nil {
		return nil, err
	}
	subject, _ := splitMessage(c.Message)
	sha := c.Hash.String()
	bc := &BlameCommit{
		SHA:         sha,
		ShortSHA:    shortSHA(sha),
		AuthorName:  c.Author.Name,
		AuthorEmail: c.Author.Email,
		AuthorTime:  c.Author.When.Format(time.RFC3339),
		Subject:     subject,
	}
	s.cache[h] = bc
	return bc, nil
}

// runBlame invokes go-git's Blame in a goroutine and races it against the
// caller's context deadline. go-git's Blame doesn't take a context, so we
// can't cancel its work — on deadline the goroutine continues to completion
// in the background, but the caller sees ErrBlameTimeout and the response is
// sent. Acceptable for a single-user playground tool.
func runBlame(ctx context.Context, c *object.Commit, path string) (*gogit.BlameResult, error) {
	type result struct {
		r *gogit.BlameResult
		e error
	}
	ch := make(chan result, 1)
	go func() {
		br, err := gogit.Blame(c, path)
		ch <- result{br, err}
	}()
	select {
	case <-ctx.Done():
		return nil, ErrBlameTimeout
	case res := <-ch:
		if res.e != nil {
			if errors.Is(res.e, object.ErrFileNotFound) {
				return nil, ErrNotFound
			}
			return nil, res.e
		}
		return res.r, nil
	}
}

// pathStatusBucket classifies a single path's working-tree state into one of
// "clean", "staged", "unstaged", "untracked". A lightweight scan of go-git's
// status map, indexed by path. Bypasses the full Status() build cost only
// when we need a single answer — fine for v1 since blame is per-file anyway,
// but documented so a future optimization can swap to per-path lookup.
func (r *Repo) pathStatusBucket(path string) string {
	wt, err := r.repo.Worktree()
	if err != nil {
		return "clean"
	}
	st, err := wt.Status()
	if err != nil {
		return "clean"
	}
	fs, ok := st[path]
	if !ok || fs == nil {
		return "clean"
	}
	if fs.Worktree == gogit.Untracked && fs.Staging == gogit.Untracked {
		return "untracked"
	}
	if fs.Staging != gogit.Unmodified && fs.Staging != gogit.Untracked {
		return "staged"
	}
	if fs.Worktree != gogit.Unmodified && fs.Worktree != gogit.Untracked {
		return "unstaged"
	}
	return "clean"
}

// clampToRenameBoundary rewrites the .Hash of any blame line whose attributed
// commit no longer contains `path` in its tree. go-git's Blame follows
// renames transparently — for `new.go` renamed from `old.go`, lines copied
// across the rename are attributed to commits that touch `old.go`. The
// git-reader spec's "Non-goals declared" requirement says blame SHALL stop at
// the first rename boundary, so we substitute those out-of-history commits
// with the commit where `path` first appears in the first-parent chain.
//
// For a never-renamed file the boundary is the initial-add commit and no
// line is ever older than it, so this function becomes a no-op.
func (r *Repo) clampToRenameBoundary(target *object.Commit, path string, lines []*gogit.Line) error {
	if len(lines) == 0 {
		return nil
	}
	boundary, err := r.pathOriginCommit(target, path)
	if err != nil {
		return err
	}
	if boundary == nil {
		return nil
	}
	// Cache: for each unique commit hash among the blame lines, does its
	// tree contain `path`?
	contains := map[plumbing.Hash]bool{}
	for _, l := range lines {
		if l == nil {
			continue
		}
		if _, ok := contains[l.Hash]; ok {
			continue
		}
		c, err := r.repo.CommitObject(l.Hash)
		if err != nil {
			// Treat lookup failures as "out of history" so we don't reference
			// an unresolvable commit in the chunk summary.
			contains[l.Hash] = false
			continue
		}
		tree, err := c.Tree()
		if err != nil {
			contains[l.Hash] = false
			continue
		}
		if _, err := tree.File(path); err == nil {
			contains[l.Hash] = true
		} else {
			contains[l.Hash] = false
		}
	}
	for _, l := range lines {
		if l == nil {
			continue
		}
		if !contains[l.Hash] {
			l.Hash = boundary.Hash
		}
	}
	return nil
}

// pathOriginCommit walks the first-parent chain from `target` and returns
// the oldest commit on that chain whose tree contains `path`. The previous
// commit (parent) does NOT contain the path — i.e. `target`-side it was
// either initially added or renamed-to at this commit. Returns nil only if
// `path` doesn't exist at `target` to begin with (defensive).
func (r *Repo) pathOriginCommit(target *object.Commit, path string) (*object.Commit, error) {
	tree, err := target.Tree()
	if err != nil {
		return nil, err
	}
	if _, err := tree.File(path); err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			return nil, nil
		}
		return nil, err
	}
	cur := target
	for {
		if cur.NumParents() == 0 {
			return cur, nil
		}
		parent, err := cur.Parent(0)
		if err != nil {
			return nil, err
		}
		parentTree, err := parent.Tree()
		if err != nil {
			return nil, err
		}
		if _, err := parentTree.File(path); err != nil {
			if errors.Is(err, object.ErrFileNotFound) {
				return cur, nil
			}
			return nil, err
		}
		cur = parent
	}
}

// keep filepath imported for the absolute-paranoid case where a future refactor
// touches the working-tree read; the resolver does the heavy lifting today.
var _ = filepath.Separator
