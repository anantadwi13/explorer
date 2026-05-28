package git

import (
	"errors"
	"io"
	"strings"
	"time"

	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"

	"github.com/anantadwi13/explorer/internal/server/mime"
)

// BlobAt returns the bytes, detected MIME, blob size, and the named commit's
// author timestamp for `path` as it existed at `ref`. The bytes are returned
// as-is regardless of whether the blob is text or binary — consumers (notably
// /raw/?ref= and /api/meta?ref=) handle that themselves.
//
// `ref` accepts the full grammar resolveRefToCommit supports — branch name,
// tag name, full SHA, unambiguous SHA prefix — plus a trailing `^` for the
// first parent. See ResolveRefWithCaret for the precise grammar.
//
// Errors:
//   - ErrUnknownRef when `ref` cannot be resolved to a commit (unknown name,
//     ambiguous prefix, `^` walking off a root commit, malformed value).
//   - ErrNotFound when the file does not exist at the resolved commit.
func (r *Repo) BlobAt(ref, path string) ([]byte, string, int64, time.Time, error) {
	if path == "" {
		return nil, "", 0, time.Time{}, ErrNotFound
	}
	hash, err := r.ResolveRefWithCaret(ref)
	if err != nil {
		return nil, "", 0, time.Time{}, err
	}
	c, err := r.repo.CommitObject(hash)
	if err != nil {
		if errors.Is(err, plumbing.ErrObjectNotFound) {
			return nil, "", 0, time.Time{}, ErrUnknownRef
		}
		return nil, "", 0, time.Time{}, err
	}
	tree, err := c.Tree()
	if err != nil {
		return nil, "", 0, time.Time{}, err
	}
	file, err := tree.File(path)
	if err != nil {
		if errors.Is(err, object.ErrFileNotFound) {
			return nil, "", 0, time.Time{}, ErrNotFound
		}
		return nil, "", 0, time.Time{}, err
	}
	rd, err := file.Reader()
	if err != nil {
		return nil, "", 0, time.Time{}, err
	}
	defer rd.Close()
	content, err := io.ReadAll(rd)
	if err != nil {
		return nil, "", 0, time.Time{}, err
	}
	mt := mime.DetectFromBytes(path, content)
	return content, mt, file.Size, c.Author.When, nil
}

// ResolveRefWithCaret is the unified ref-resolution helper used by /raw/?ref=,
// /api/meta?ref=, and /api/git/blame?ref=. It strips trailing `^` characters
// from `ref`, resolves the base via resolveRefToCommit (branch / tag / SHA /
// SHA prefix), and walks first parents for each stripped caret. A caret that
// walks off a root commit returns ErrUnknownRef.
func (r *Repo) ResolveRefWithCaret(ref string) (plumbing.Hash, error) {
	caretCount := 0
	base := ref
	for strings.HasSuffix(base, "^") {
		caretCount++
		base = strings.TrimSuffix(base, "^")
	}
	if caretCount == 0 {
		return r.resolveRefToCommit(ref)
	}
	if base == "" {
		return plumbing.ZeroHash, ErrUnknownRef
	}
	h, err := r.resolveRefToCommit(base)
	if err != nil {
		return plumbing.ZeroHash, err
	}
	for i := 0; i < caretCount; i++ {
		c, err := r.repo.CommitObject(h)
		if err != nil {
			return plumbing.ZeroHash, ErrUnknownRef
		}
		if c.NumParents() == 0 {
			return plumbing.ZeroHash, ErrUnknownRef
		}
		parent, err := c.Parent(0)
		if err != nil {
			return plumbing.ZeroHash, ErrUnknownRef
		}
		h = parent.Hash
	}
	return h, nil
}
