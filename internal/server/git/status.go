package git

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	gogit "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/utils/diff"
	"github.com/sergi/go-diff/diffmatchpatch"
)

// UntrackedEntry is the per-file shape for the untracked list. No diff is
// possible (the file is not tracked); the SPA only renders the name.
type UntrackedEntry struct {
	Path string `json:"path"`
}

// StatusResult mirrors the JSON shape of GET /api/git/status. Conflicted
// entries (mid-merge) are surfaced under their own list rather than mixed
// into staged/unstaged — easier for the SPA to render and matches the spec's
// "either is acceptable for v1" wording.
type StatusResult struct {
	Staged     []FileHeader     `json:"staged"`
	Unstaged   []FileHeader     `json:"unstaged"`
	Untracked  []UntrackedEntry `json:"untracked"`
	Conflicted []UntrackedEntry `json:"conflicted,omitempty"`
}

// Status returns the working-tree state grouped into staged, unstaged, and
// untracked buckets. Conflicted entries (mid-merge) go into their own list
// and never crash the endpoint — the spec mandates HTTP 200 even with
// conflicts present.
//
// For staged entries: diff is between HEAD tree and index.
// For unstaged entries: diff is between index and working tree.
func (r *Repo) Status() (StatusResult, error) {
	out := StatusResult{
		Staged:    []FileHeader{},
		Unstaged:  []FileHeader{},
		Untracked: []UntrackedEntry{},
	}

	wt, err := r.repo.Worktree()
	if err != nil {
		return out, err
	}
	st, err := wt.Status()
	if err != nil {
		// Worktree.Status currently never errors on a conflicted repo, but
		// keep the path safe just in case.
		return out, err
	}

	// HEAD tree (nil on empty repo — A-status for everything staged).
	headTree, _ := r.headTree()
	idx, err := r.repo.Storer.Index()
	if err != nil {
		return out, err
	}
	indexByPath := map[string]plumbing.Hash{}
	for _, e := range idx.Entries {
		indexByPath[e.Name] = e.Hash
	}

	// Sort paths so output ordering is stable across calls.
	paths := make([]string, 0, len(st))
	for p := range st {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	for _, path := range paths {
		fs := st[path]

		// Conflicted (mid-merge) — surface separately, never crash.
		if fs.Staging == gogit.UpdatedButUnmerged || fs.Worktree == gogit.UpdatedButUnmerged {
			out.Conflicted = append(out.Conflicted, UntrackedEntry{Path: path})
			continue
		}

		// Untracked — Worktree==? with no index entry.
		if fs.Worktree == gogit.Untracked && fs.Staging == gogit.Untracked {
			out.Untracked = append(out.Untracked, UntrackedEntry{Path: path})
			continue
		}

		if fs.Staging != gogit.Unmodified && fs.Staging != gogit.Untracked {
			fh, err := r.stagedFileHeader(path, fs, headTree, indexByPath)
			if err == nil {
				out.Staged = append(out.Staged, fh)
			}
		}
		if fs.Worktree != gogit.Unmodified && fs.Worktree != gogit.Untracked {
			fh, err := r.unstagedFileHeader(wt, path, fs, indexByPath)
			if err == nil {
				out.Unstaged = append(out.Unstaged, fh)
			}
		}
	}

	return out, nil
}

// headTree returns the tree of the current HEAD commit, or nil with no error
// on an empty repo / detached HEAD with no commits.
func (r *Repo) headTree() (*object.Tree, error) {
	ref, err := r.repo.Head()
	if err != nil {
		// Empty repo — no HEAD.
		return nil, nil
	}
	c, err := r.repo.CommitObject(ref.Hash())
	if err != nil {
		return nil, err
	}
	return c.Tree()
}

// stagedFileHeader computes a FileHeader for one staged entry by diffing the
// HEAD blob (if any) against the index blob (if any).
func (r *Repo) stagedFileHeader(path string, fs *gogit.FileStatus, headTree *object.Tree, indexByPath map[string]plumbing.Hash) (FileHeader, error) {
	fh := FileHeader{Status: stagingToStatus(fs.Staging)}

	// Renamed: Status.Extra holds the previous path (when go-git detected it).
	if fs.Staging == gogit.Renamed {
		oldPath := fs.Extra
		fh.OldPath = &oldPath
		newPath := path
		fh.NewPath = &newPath
	} else {
		switch fh.Status {
		case "A":
			newPath := path
			fh.NewPath = &newPath
		case "D":
			oldPath := path
			fh.OldPath = &oldPath
		default:
			oldPath := path
			newPath := path
			fh.OldPath = &oldPath
			fh.NewPath = &newPath
		}
	}

	var headBlob, indexBlob *blobView
	if headTree != nil && fh.OldPath != nil {
		headBlob = r.lookupBlobInTree(headTree, *fh.OldPath)
	}
	if h, ok := indexByPath[path]; ok {
		indexBlob = r.lookupBlobByHash(h, path)
	}
	populateDiff(&fh, headBlob, indexBlob)
	return fh, nil
}

// unstagedFileHeader computes a FileHeader for one unstaged entry by diffing
// the index blob (if any) against the working-tree file (if it exists).
func (r *Repo) unstagedFileHeader(wt *gogit.Worktree, path string, fs *gogit.FileStatus, indexByPath map[string]plumbing.Hash) (FileHeader, error) {
	fh := FileHeader{Status: worktreeToStatus(fs.Worktree)}

	switch fh.Status {
	case "A":
		newPath := path
		fh.NewPath = &newPath
	case "D":
		oldPath := path
		fh.OldPath = &oldPath
	default:
		oldPath := path
		newPath := path
		fh.OldPath = &oldPath
		fh.NewPath = &newPath
	}

	var indexBlob, wtBlob *blobView
	if h, ok := indexByPath[path]; ok {
		indexBlob = r.lookupBlobByHash(h, path)
	}
	if fh.NewPath != nil {
		wtBlob = r.readWorktreeFile(wt, path)
	}
	populateDiff(&fh, indexBlob, wtBlob)
	return fh, nil
}

// blobView captures the content + size + binary-ness of one side of a diff.
// We carry size separately so callers don't have to take len(content) (which
// is O(N) on a large blob we'd otherwise stream).
type blobView struct {
	content  []byte
	size     int64
	isBinary bool
}

// lookupBlobInTree returns the blob at `path` inside `tree`, or nil if absent.
// Failures are silent (returns nil) — the caller treats nil as "no content
// on this side of the diff".
func (r *Repo) lookupBlobInTree(tree *object.Tree, path string) *blobView {
	if tree == nil {
		return nil
	}
	f, err := tree.File(path)
	if err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			return nil
		}
		return nil
	}
	rd, err := f.Reader()
	if err != nil {
		return nil
	}
	defer rd.Close()
	content, err := io.ReadAll(rd)
	if err != nil {
		return nil
	}
	return &blobView{content: content, size: f.Size, isBinary: detectBinary(content)}
}

// lookupBlobByHash returns the blob identified by h.
func (r *Repo) lookupBlobByHash(h plumbing.Hash, _ string) *blobView {
	if h.IsZero() {
		return nil
	}
	blob, err := r.repo.BlobObject(h)
	if err != nil {
		return nil
	}
	rd, err := blob.Reader()
	if err != nil {
		return nil
	}
	defer rd.Close()
	content, err := io.ReadAll(rd)
	if err != nil {
		return nil
	}
	return &blobView{content: content, size: blob.Size, isBinary: detectBinary(content)}
}

// readWorktreeFile loads the file at `path` from the working tree on disk.
// The path is repo-relative; we join against the repo root via Worktree.
func (r *Repo) readWorktreeFile(_ *gogit.Worktree, path string) *blobView {
	full := filepath.Join(r.root, filepath.FromSlash(path))
	info, err := os.Lstat(full)
	if err != nil {
		return nil
	}
	if !info.Mode().IsRegular() {
		return nil
	}
	content, err := os.ReadFile(full)
	if err != nil {
		return nil
	}
	return &blobView{content: content, size: info.Size(), isBinary: detectBinary(content)}
}

// populateDiff fills in additions/deletions/is_binary/sizes on fh from the
// two sides of the diff. `from` is the older side (HEAD or index); `to` is
// the newer side (index or worktree). Either may be nil.
func populateDiff(fh *FileHeader, from, to *blobView) {
	// Binary detection: if EITHER side is binary, we treat the whole change as
	// binary (matches what `git diff` does — the unified output shows
	// "Binary files differ").
	isBinary := false
	if from != nil && from.isBinary {
		isBinary = true
	}
	if to != nil && to.isBinary {
		isBinary = true
	}

	fh.IsBinary = isBinary
	if from != nil {
		sz := from.size
		if isBinary {
			fh.OldSize = &sz
		}
	}
	if to != nil {
		sz := to.size
		if isBinary {
			fh.NewSize = &sz
		}
	}

	if isBinary {
		return
	}

	src := ""
	dst := ""
	if from != nil {
		src = string(from.content)
	}
	if to != nil {
		dst = string(to.content)
	}
	for _, d := range diff.Do(src, dst) {
		switch d.Type {
		case diffmatchpatch.DiffInsert:
			fh.Additions += countLines(d.Text)
		case diffmatchpatch.DiffDelete:
			fh.Deletions += countLines(d.Text)
		}
	}
}

// detectBinary uses the same NUL-byte heuristic as go-git's FilePatch.IsBinary
// — a single NUL byte in the first 8 KiB triggers binary classification.
func detectBinary(content []byte) bool {
	limit := 8 * 1024
	if len(content) < limit {
		limit = len(content)
	}
	return bytes.IndexByte(content[:limit], 0) >= 0
}

// stagingToStatus / worktreeToStatus map go-git's per-side status codes to
// the spec's letter codes. The Renamed code only appears on Staging — go-git
// doesn't detect renames in the worktree.
func stagingToStatus(c gogit.StatusCode) string {
	switch c {
	case gogit.Added:
		return "A"
	case gogit.Deleted:
		return "D"
	case gogit.Renamed:
		return "R"
	case gogit.Copied:
		return "R" // copies are rare; report as rename for v1
	case gogit.Modified:
		return "M"
	}
	return "M"
}

func worktreeToStatus(c gogit.StatusCode) string {
	switch c {
	case gogit.Added:
		return "A"
	case gogit.Deleted:
		return "D"
	case gogit.Modified:
		return "M"
	}
	return "M"
}

// keep imports stable across versions.
var _ = strings.TrimSpace
