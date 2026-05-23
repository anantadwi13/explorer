package git

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/format/diff"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/utils/merkletrie"
)

const (
	// CommitFilesDefaultLimit and Max match the spec for /api/git/commit
	// pagination of the files array.
	CommitFilesDefaultLimit = 50
	CommitFilesMaxLimit     = 200
)

// FileHeader is the per-file diff summary used by both /api/git/commit and
// /api/git/status. `OldPath` is nil for additions; `NewPath` is nil for
// deletions; both are populated (and `Status == "R"`) for renames.
//
// For binary files, Additions/Deletions are 0 and OldSize/NewSize report the
// blob sizes. For text files, sizes are omitted from JSON.
type FileHeader struct {
	Status     string `json:"status"` // A, M, D, R
	OldPath    *string `json:"old_path"`
	NewPath    *string `json:"new_path"`
	Additions  int    `json:"additions"`
	Deletions  int    `json:"deletions"`
	IsBinary   bool   `json:"is_binary"`
	OldSize    *int64 `json:"old_size,omitempty"`
	NewSize    *int64 `json:"new_size,omitempty"`
}

// CommitResult mirrors the JSON shape of GET /api/git/commit.
type CommitResult struct {
	SHA            string       `json:"sha"`
	ShortSHA       string       `json:"short_sha"`
	AuthorName     string       `json:"author_name"`
	AuthorEmail    string       `json:"author_email"`
	AuthorTime     string       `json:"author_time"`
	CommitterName  string       `json:"committer_name"`
	CommitterEmail string       `json:"committer_email"`
	CommitterTime  string       `json:"committer_time"`
	Subject        string       `json:"subject"`
	Body           string       `json:"body"`
	Parents        []string     `json:"parents"`
	TotalFiles     int          `json:"total_files"`
	TotalAdditions int          `json:"total_additions"`
	TotalDeletions int          `json:"total_deletions"`
	Files          []FileHeader `json:"files"`
	NextFileOffset *int         `json:"next_file_offset"`
}

// Commit returns the metadata + paginated file list for a single commit.
// `sha` accepts a short or full sha and is normalised internally.
// Merge commits are diffed against their first parent only (spec decision).
func (r *Repo) Commit(sha string, fileOffset, fileLimit int) (CommitResult, error) {
	out := CommitResult{Files: []FileHeader{}, Parents: []string{}}

	if !ValidSHA(sha) {
		return out, ErrUnknownRef
	}
	if fileOffset < 0 {
		fileOffset = 0
	}
	if fileLimit <= 0 {
		fileLimit = CommitFilesDefaultLimit
	}
	if fileLimit > CommitFilesMaxLimit {
		fileLimit = CommitFilesMaxLimit
	}

	hash, err := r.resolveSHAPrefix(NormaliseSHA(sha))
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

	// Header metadata.
	out.SHA = c.Hash.String()
	out.ShortSHA = shortSHA(out.SHA)
	out.AuthorName = c.Author.Name
	out.AuthorEmail = c.Author.Email
	out.AuthorTime = c.Author.When.Format(time.RFC3339)
	out.CommitterName = c.Committer.Name
	out.CommitterEmail = c.Committer.Email
	out.CommitterTime = c.Committer.When.Format(time.RFC3339)
	for _, p := range c.ParentHashes {
		out.Parents = append(out.Parents, p.String())
	}
	subject, body := splitMessage(c.Message)
	out.Subject = subject
	out.Body = body

	// Diff against first parent (or empty tree for the root commit).
	files, err := r.fileHeadersForCommit(c)
	if err != nil {
		return out, err
	}

	out.TotalFiles = len(files)
	for _, f := range files {
		out.TotalAdditions += f.Additions
		out.TotalDeletions += f.Deletions
	}

	// Paginate.
	end := fileOffset + fileLimit
	if fileOffset >= len(files) {
		out.Files = []FileHeader{}
	} else {
		if end > len(files) {
			end = len(files)
		}
		out.Files = files[fileOffset:end]
	}
	if fileOffset+len(out.Files) < len(files) {
		next := fileOffset + len(out.Files)
		out.NextFileOffset = &next
	}

	return out, nil
}

// fileHeadersForCommit computes the per-file headers for commit c against its
// first parent (or the empty tree if it's the root commit). Order is the order
// go-git surfaces FilePatches, which is path-sorted ascending — stable across
// invocations.
func (r *Repo) fileHeadersForCommit(c *object.Commit) ([]FileHeader, error) {
	var parentTree, currentTree *object.Tree
	currentTree, err := c.Tree()
	if err != nil {
		return nil, err
	}

	if c.NumParents() > 0 {
		parent, err := c.Parent(0)
		if err != nil {
			return nil, err
		}
		parentTree, err = parent.Tree()
		if err != nil {
			return nil, err
		}
	}

	changes, err := object.DiffTreeWithOptions(context.Background(), parentTree, currentTree, &object.DiffTreeOptions{
		DetectRenames: true,
	})
	if err != nil {
		return nil, err
	}

	return r.changesToFileHeaders(changes)
}

// changesToFileHeaders walks an object.Changes set and produces FileHeader
// entries with correct status/paths/counts/binary/size fields.
func (r *Repo) changesToFileHeaders(changes object.Changes) ([]FileHeader, error) {
	out := make([]FileHeader, 0, len(changes))
	for _, ch := range changes {
		fh, err := r.changeToFileHeader(ch)
		if err != nil {
			return nil, err
		}
		out = append(out, fh)
	}
	return out, nil
}

// changeToFileHeader maps a single object.Change to a FileHeader. It computes
// per-file additions/deletions by walking FilePatch.Chunks(), and falls back
// to blob sizes for binary files.
func (r *Repo) changeToFileHeader(ch *object.Change) (FileHeader, error) {
	action, err := ch.Action()
	if err != nil {
		return FileHeader{}, err
	}

	patch, err := ch.Patch()
	if err != nil {
		return FileHeader{}, err
	}

	// Build base header from the two tree entries.
	fh := FileHeader{
		Status: statusForAction(action),
	}
	if ch.From.Name != "" {
		op := ch.From.Name
		fh.OldPath = &op
	}
	if ch.To.Name != "" {
		np := ch.To.Name
		fh.NewPath = &np
	}

	// Rename: both paths populated, status R.
	if ch.From.Name != "" && ch.To.Name != "" && ch.From.Name != ch.To.Name {
		fh.Status = "R"
	}

	// Walk the (single) FilePatch.
	for _, fp := range patch.FilePatches() {
		if fp.IsBinary() {
			fh.IsBinary = true
			from, to := fp.Files()
			if from != nil {
				if sz, ok := r.blobSize(from.Hash()); ok {
					fh.OldSize = &sz
				}
			}
			if to != nil {
				if sz, ok := r.blobSize(to.Hash()); ok {
					fh.NewSize = &sz
				}
			}
			break
		}
		for _, chunk := range fp.Chunks() {
			switch chunk.Type() {
			case diff.Add:
				fh.Additions += countLines(chunk.Content())
			case diff.Delete:
				fh.Deletions += countLines(chunk.Content())
			}
		}
	}

	return fh, nil
}

// blobSize returns the size of the blob identified by h, or false if it can't
// be looked up. The zero hash is a sentinel for "missing side of the diff"
// (e.g. an addition has no old blob); we don't try to look it up.
func (r *Repo) blobSize(h plumbing.Hash) (int64, bool) {
	if h.IsZero() {
		return 0, false
	}
	blob, err := r.repo.BlobObject(h)
	if err != nil {
		return 0, false
	}
	return blob.Size, true
}

// countLines counts the number of lines in a chunk's content. go-git emits
// chunks where each line ends in `\n`; a trailing partial line (no final
// newline) still counts as one line, matching what `git diff` reports.
func countLines(s string) int {
	if s == "" {
		return 0
	}
	n := strings.Count(s, "\n")
	if !strings.HasSuffix(s, "\n") {
		n++
	}
	return n
}

// statusForAction maps go-git's tri-state merkletrie.Action to the spec's
// letter codes. The rename case is handled by the caller (it requires both
// sides of the Change, which is not visible from Action alone).
func statusForAction(a merkletrie.Action) string {
	switch a {
	case merkletrie.Insert:
		return "A"
	case merkletrie.Delete:
		return "D"
	case merkletrie.Modify:
		return "M"
	}
	return "M"
}

// splitMessage cleaves a commit message at the first blank-line paragraph
// break (or the first newline if there's no blank line) into subject + body.
// Trailing whitespace is stripped from both.
func splitMessage(msg string) (subject, body string) {
	msg = strings.TrimRight(msg, "\n")
	if i := strings.Index(msg, "\n\n"); i >= 0 {
		return msg[:i], strings.TrimSpace(msg[i+2:])
	}
	if nl := strings.IndexByte(msg, '\n'); nl >= 0 {
		return msg[:nl], strings.TrimSpace(msg[nl+1:])
	}
	return msg, ""
}
