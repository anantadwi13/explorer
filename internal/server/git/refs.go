package git

import (
	"sort"
	"strings"

	"github.com/go-git/go-git/v5/plumbing"
)

// RefEntry is one branch or tag entry in /api/git/refs. `name` is the bare ref
// name (without `refs/heads/` or `refs/tags/`); `sha` is the resolved commit
// sha (annotated tags are peeled).
type RefEntry struct {
	Name string `json:"name"`
	SHA  string `json:"sha"`
}

// RefsResult mirrors the JSON shape of GET /api/git/refs.
type RefsResult struct {
	Branches []RefEntry `json:"branches"`
	Tags     []RefEntry `json:"tags"`
}

// Refs returns the local branches and tags in the repository.
//
//   - Branches: only refs under refs/heads/ — refs/remotes/* are excluded per
//     the spec (we don't want `origin/main` cluttering the picker).
//   - Tags: refs under refs/tags/. For annotated tags, the returned sha is the
//     peeled commit sha, not the sha of the tag object itself.
//   - Both arrays are sorted case-insensitively by name.
//   - On an empty repository (no refs at all), returns empty slices.
func (r *Repo) Refs() (RefsResult, error) {
	out := RefsResult{Branches: []RefEntry{}, Tags: []RefEntry{}}

	branches, err := r.repo.Branches()
	if err != nil {
		return out, err
	}
	if err := branches.ForEach(func(ref *plumbing.Reference) error {
		name := strings.TrimPrefix(ref.Name().String(), "refs/heads/")
		out.Branches = append(out.Branches, RefEntry{Name: name, SHA: ref.Hash().String()})
		return nil
	}); err != nil {
		return out, err
	}

	tags, err := r.repo.Tags()
	if err != nil {
		return out, err
	}
	if err := tags.ForEach(func(ref *plumbing.Reference) error {
		name := strings.TrimPrefix(ref.Name().String(), "refs/tags/")
		sha := r.peelTagToCommit(ref.Hash())
		out.Tags = append(out.Tags, RefEntry{Name: name, SHA: sha})
		return nil
	}); err != nil {
		return out, err
	}

	sortRefs := func(s []RefEntry) {
		sort.Slice(s, func(i, j int) bool {
			return strings.ToLower(s[i].Name) < strings.ToLower(s[j].Name)
		})
	}
	sortRefs(out.Branches)
	sortRefs(out.Tags)

	return out, nil
}

// peelTagToCommit returns the underlying commit sha for a tag reference. For a
// lightweight tag this is the tag's own hash; for an annotated tag we walk
// through the tag object to its target. Errors fall back to the raw hash —
// callers should not see a panic from a malformed tag.
func (r *Repo) peelTagToCommit(h plumbing.Hash) string {
	// If it's already a commit, return as-is.
	if _, err := r.repo.CommitObject(h); err == nil {
		return h.String()
	}
	// Otherwise try to load it as an annotated tag and follow the target chain.
	tag, err := r.repo.TagObject(h)
	if err != nil {
		return h.String()
	}
	for tag != nil {
		switch tag.TargetType {
		case plumbing.CommitObject:
			return tag.Target.String()
		case plumbing.TagObject:
			next, err := r.repo.TagObject(tag.Target)
			if err != nil {
				return tag.Target.String()
			}
			tag = next
		default:
			// Tree or blob — not a commit-bearing tag. Return the raw target.
			return tag.Target.String()
		}
	}
	return h.String()
}

