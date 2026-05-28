package git

import (
	"errors"
	"strings"

	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/utils/diff"
	"github.com/sergi/go-diff/diffmatchpatch"
)

const (
	// PatchHunksDefaultLimit and Max match the spec for /api/git/patch.
	PatchHunksDefaultLimit = 3
	PatchHunksMaxLimit     = 50

	// patchResponseByteCap is the spec's defensive bound for a single
	// /api/git/patch response. Hunks selected for the response sum (across
	// all `line.text` and `header` fields) MUST stay under this cap; the
	// server returns fewer hunks (never breaking mid-hunk) when the bound
	// would be exceeded. A single oversized hunk is the only case where this
	// cap is exceeded — and even then it is returned in isolation.
	patchResponseByteCap = 512 * 1024

	// hunkContextLines is how many unchanged context lines we keep on each
	// side of a change block, matching `git diff`'s default.
	hunkContextLines = 3
)

// DiffLine is one line inside a hunk. Type is one of "context", "add", "del".
// Text has its trailing newline stripped so the SPA can render with row
// borders that wrap independent of git's line terminators.
type DiffLine struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// Hunk mirrors one unified-diff hunk in the JSON response.
type Hunk struct {
	OldStart int        `json:"old_start"`
	OldLines int        `json:"old_lines"`
	NewStart int        `json:"new_start"`
	NewLines int        `json:"new_lines"`
	Header   string     `json:"header"`
	Lines    []DiffLine `json:"lines"`
}

// PatchResult mirrors GET /api/git/patch.
type PatchResult struct {
	Path           string `json:"path"`
	IsBinary       bool   `json:"is_binary"`
	TotalHunks     int    `json:"total_hunks"`
	Hunks          []Hunk `json:"hunks"`
	NextHunkOffset *int   `json:"next_hunk_offset"`
	MoreAvailable  bool   `json:"more_available"`
}

// PatchSource enumerates the three pathways /api/git/patch can use to derive
// the two sides of the diff.
type PatchSource string

const (
	PatchSourceCommit   PatchSource = "commit"
	PatchSourceStaged   PatchSource = "staged"
	PatchSourceUnstaged PatchSource = "unstaged"
)

// ErrPatchSourceSHAMismatch is returned when source/sha combinations are
// invalid (commit without sha, staged/unstaged WITH sha). The HTTP layer
// surfaces this as an HTTP 400.
var ErrPatchSourceSHAMismatch = errors.New("source/sha mismatch")

// Patch returns the hunks for `path` under the requested `source`, paginated
// by hunk index. Binary files always return an empty hunks array.
func (r *Repo) Patch(source PatchSource, sha, path string, hunkOffset, hunkLimit int) (PatchResult, error) {
	out := PatchResult{Path: path, Hunks: []Hunk{}}

	if path == "" {
		return out, ErrNotFound
	}
	if hunkOffset < 0 {
		hunkOffset = 0
	}
	if hunkLimit <= 0 {
		hunkLimit = PatchHunksDefaultLimit
	}
	if hunkLimit > PatchHunksMaxLimit {
		hunkLimit = PatchHunksMaxLimit
	}

	// source/sha consistency.
	switch source {
	case PatchSourceCommit:
		if sha == "" {
			return out, ErrPatchSourceSHAMismatch
		}
		if !ValidSHA(sha) {
			return out, ErrUnknownRef
		}
	case PatchSourceStaged, PatchSourceUnstaged:
		if sha != "" {
			return out, ErrPatchSourceSHAMismatch
		}
	default:
		return out, ErrPatchSourceSHAMismatch
	}

	from, to, isBinary, err := r.loadPatchSides(source, sha, path)
	if err != nil {
		return out, err
	}

	if isBinary {
		out.IsBinary = true
		return out, nil
	}

	hunks := buildHunks(from, to)
	out.TotalHunks = len(hunks)

	if hunkOffset >= len(hunks) {
		return out, nil
	}

	end := hunkOffset + hunkLimit
	if end > len(hunks) {
		end = len(hunks)
	}
	page := hunks[hunkOffset:end]

	// Apply byte-cap. Greedily add hunks until the next one would push us
	// over patchResponseByteCap. A single oversized hunk gets returned alone.
	taken := make([]Hunk, 0, len(page))
	usedBytes := 0
	for _, h := range page {
		hb := hunkByteSize(h)
		if len(taken) > 0 && usedBytes+hb > patchResponseByteCap {
			break
		}
		taken = append(taken, h)
		usedBytes += hb
	}
	if len(taken) == 0 && len(page) > 0 {
		taken = []Hunk{page[0]}
	}

	out.Hunks = taken
	consumed := hunkOffset + len(taken)
	out.MoreAvailable = consumed < len(hunks)
	if out.MoreAvailable {
		nx := consumed
		out.NextHunkOffset = &nx
	}

	return out, nil
}

// loadPatchSides returns the (from, to) bytes for the requested patch source
// and the binary classification. `from`/`to` may be nil to indicate the file
// did not exist on that side of the diff (an addition or deletion).
func (r *Repo) loadPatchSides(source PatchSource, sha, path string) (from, to []byte, isBinary bool, err error) {
	switch source {
	case PatchSourceCommit:
		return r.loadCommitSides(sha, path)
	case PatchSourceStaged:
		return r.loadStagedSides(path)
	case PatchSourceUnstaged:
		return r.loadUnstagedSides(path)
	}
	return nil, nil, false, ErrPatchSourceSHAMismatch
}

// loadCommitSides loads the from/to blob contents for a single file in a
// specific commit (diffing against the commit's first parent). `sha` accepts
// the same grammar as ResolveRefWithCaret — kept routed through that helper so
// /api/git/patch and the new ref-scoped endpoints share one resolution path.
func (r *Repo) loadCommitSides(sha, path string) ([]byte, []byte, bool, error) {
	hash, err := r.ResolveRefWithCaret(NormaliseSHA(sha))
	if err != nil {
		return nil, nil, false, err
	}
	c, err := r.repo.CommitObject(hash)
	if err != nil {
		if errors.Is(err, plumbing.ErrObjectNotFound) {
			return nil, nil, false, ErrUnknownRef
		}
		return nil, nil, false, err
	}
	currentTree, err := c.Tree()
	if err != nil {
		return nil, nil, false, err
	}
	var parentTree *object.Tree
	if c.NumParents() > 0 {
		parent, err := c.Parent(0)
		if err != nil {
			return nil, nil, false, err
		}
		parentTree, err = parent.Tree()
		if err != nil {
			return nil, nil, false, err
		}
	}

	fromBlob := r.lookupBlobInTree(parentTree, path)
	toBlob := r.lookupBlobInTree(currentTree, path)
	if fromBlob == nil && toBlob == nil {
		return nil, nil, false, ErrNotFound
	}

	isBinary := (fromBlob != nil && fromBlob.isBinary) || (toBlob != nil && toBlob.isBinary)
	return bytesOf(fromBlob), bytesOf(toBlob), isBinary, nil
}

// loadStagedSides loads the from (HEAD) / to (index) blob contents for a path.
func (r *Repo) loadStagedSides(path string) ([]byte, []byte, bool, error) {
	if strings.HasPrefix(path, "/") || strings.Contains(path, "..") {
		return nil, nil, false, ErrNotFound
	}
	headTree, _ := r.headTree()
	fromBlob := r.lookupBlobInTree(headTree, path)

	idx, err := r.repo.Storer.Index()
	if err != nil {
		return nil, nil, false, err
	}
	var toBlob *blobView
	for _, e := range idx.Entries {
		if e.Name == path {
			toBlob = r.lookupBlobByHash(e.Hash, path)
			break
		}
	}
	if fromBlob == nil && toBlob == nil {
		return nil, nil, false, ErrNotFound
	}
	isBinary := (fromBlob != nil && fromBlob.isBinary) || (toBlob != nil && toBlob.isBinary)
	return bytesOf(fromBlob), bytesOf(toBlob), isBinary, nil
}

// loadUnstagedSides loads from (index) / to (working tree) for a path.
func (r *Repo) loadUnstagedSides(path string) ([]byte, []byte, bool, error) {
	if strings.HasPrefix(path, "/") || strings.Contains(path, "..") {
		return nil, nil, false, ErrNotFound
	}
	idx, err := r.repo.Storer.Index()
	if err != nil {
		return nil, nil, false, err
	}
	var fromBlob *blobView
	for _, e := range idx.Entries {
		if e.Name == path {
			fromBlob = r.lookupBlobByHash(e.Hash, path)
			break
		}
	}
	wt, err := r.repo.Worktree()
	if err != nil {
		return nil, nil, false, err
	}
	toBlob := r.readWorktreeFile(wt, path)
	if fromBlob == nil && toBlob == nil {
		return nil, nil, false, ErrNotFound
	}
	isBinary := (fromBlob != nil && fromBlob.isBinary) || (toBlob != nil && toBlob.isBinary)
	return bytesOf(fromBlob), bytesOf(toBlob), isBinary, nil
}

func bytesOf(b *blobView) []byte {
	if b == nil {
		return nil
	}
	return b.content
}

// lineEntry is one record on the flattened diff stream.
type lineEntry struct {
	kind diffmatchpatch.Operation
	text string // includes trailing \n when present
}

// buildHunks converts a (from, to) blob pair into unified-diff hunks.
// Algorithm:
//  1. Flatten the diff into per-line entries so we can window over context.
//  2. Walk the entries; for each contiguous run of non-equal entries, build a
//     hunk whose lines are: up to `context` preceding equal lines, the
//     changed run, and up to `context` trailing equal lines. Adjacent runs
//     separated by ≤ 2*context equal lines merge into one hunk.
func buildHunks(from, to []byte) []Hunk {
	if len(from) == 0 && len(to) == 0 {
		return nil
	}
	ops := diff.Do(string(from), string(to))

	// Step 1: flatten into per-line entries.
	var entries []lineEntry
	for _, d := range ops {
		for _, l := range splitKeepNL(d.Text) {
			entries = append(entries, lineEntry{kind: d.Type, text: l})
		}
	}

	var hunks []Hunk
	// 1-based line cursors track our position in the original/new files.
	oldLine, newLine := 1, 1
	// Position in entries we've already emitted (or skipped past).
	i := 0
	for i < len(entries) {
		// Advance through equal entries that aren't part of any hunk's context.
		if entries[i].kind == diffmatchpatch.DiffEqual {
			oldLine++
			newLine++
			i++
			continue
		}

		// Found a change. Walk backwards to grab up to `context` lines of
		// preceding equal context for the new hunk.
		preStart := i
		ctxBefore := 0
		for preStart > 0 && ctxBefore < hunkContextLines && entries[preStart-1].kind == diffmatchpatch.DiffEqual {
			preStart--
			ctxBefore++
		}
		hunkOldStart := oldLine - ctxBefore
		hunkNewStart := newLine - ctxBefore
		if hunkOldStart < 1 {
			hunkOldStart = 1
		}
		if hunkNewStart < 1 {
			hunkNewStart = 1
		}

		hunk := Hunk{OldStart: hunkOldStart, NewStart: hunkNewStart, Header: ""}

		// Emit pre-context.
		for k := preStart; k < i; k++ {
			hunk.Lines = append(hunk.Lines, DiffLine{Type: "context", Text: stripNL(entries[k].text)})
		}

		// Walk forward, consuming change runs and short equal gaps.
		for i < len(entries) {
			e := entries[i]
			if e.kind != diffmatchpatch.DiffEqual {
				switch e.kind {
				case diffmatchpatch.DiffDelete:
					hunk.Lines = append(hunk.Lines, DiffLine{Type: "del", Text: stripNL(e.text)})
					oldLine++
				case diffmatchpatch.DiffInsert:
					hunk.Lines = append(hunk.Lines, DiffLine{Type: "add", Text: stripNL(e.text)})
					newLine++
				}
				i++
				continue
			}

			// Equal: peek the next non-equal entry. If it's within 2*context,
			// absorb the equal run as inner context. Otherwise emit up to
			// `context` trailing context lines and close the hunk.
			gap := 0
			for i+gap < len(entries) && entries[i+gap].kind == diffmatchpatch.DiffEqual {
				gap++
			}
			nextIsChange := i+gap < len(entries) && entries[i+gap].kind != diffmatchpatch.DiffEqual

			if nextIsChange && gap <= 2*hunkContextLines {
				// Absorb the entire equal gap.
				for k := 0; k < gap; k++ {
					hunk.Lines = append(hunk.Lines, DiffLine{Type: "context", Text: stripNL(entries[i].text)})
					oldLine++
					newLine++
					i++
				}
				continue
			}

			// Otherwise, take up to `context` trailing lines and stop.
			tail := hunkContextLines
			if tail > gap {
				tail = gap
			}
			for k := 0; k < tail; k++ {
				hunk.Lines = append(hunk.Lines, DiffLine{Type: "context", Text: stripNL(entries[i].text)})
				oldLine++
				newLine++
				i++
			}
			// Advance through the rest of the gap without including it.
			for k := tail; k < gap; k++ {
				oldLine++
				newLine++
				i++
			}
			break
		}

		// Compute old/new line counts from the emitted lines.
		var oc, nc int
		for _, l := range hunk.Lines {
			switch l.Type {
			case "context":
				oc++
				nc++
			case "del":
				oc++
			case "add":
				nc++
			}
		}
		hunk.OldLines = oc
		hunk.NewLines = nc
		hunks = append(hunks, hunk)
	}

	return hunks
}

// splitKeepNL splits s on `\n` boundaries, retaining the `\n` on each non-final
// line. A trailing `\n` produces a final empty element which we drop (callers
// only care about lines, not "the file ends with newline" sentinels).
func splitKeepNL(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	for {
		idx := strings.IndexByte(s, '\n')
		if idx < 0 {
			if s != "" {
				out = append(out, s)
			}
			return out
		}
		out = append(out, s[:idx+1])
		s = s[idx+1:]
	}
}

func stripNL(s string) string { return strings.TrimRight(s, "\n") }

// hunkByteSize returns the bytes this hunk will contribute to the response.
// Used by the byte-cap accounting in Patch.
func hunkByteSize(h Hunk) int {
	n := len(h.Header)
	for _, l := range h.Lines {
		n += len(l.Text) + 1 // +1 for the implicit `+`/`-`/space prefix
	}
	return n
}
