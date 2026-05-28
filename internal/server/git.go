package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	gitpkg "github.com/anantadwi13/explorer/internal/server/git"
	"github.com/anantadwi13/explorer/internal/server/resolver"
)

// git endpoints open the repo lazily once per request — no startup caching.
// The spec requires re-evaluating the `.git` gate on every request, so adding
// or removing `.git` while the server runs takes effect on the next request.

// openRepo is the per-request gate. Returns (nil, false) when the served root
// is not a git repo (with the spec-mandated `not_a_repo` error already
// written to w for every endpoint except /api/git/info). Returns (repo, true)
// otherwise.
func (s *Server) openRepo(w http.ResponseWriter) (*gitpkg.Repo, bool) {
	r, err := gitpkg.Open(s.root)
	if err != nil {
		if errors.Is(err, gitpkg.ErrNotARepo) {
			writeError(w, errKindNotARepo, "served root is not a git repository", http.StatusNotFound)
			return nil, false
		}
		writeError(w, errKindInternal, err.Error(), http.StatusInternalServerError)
		return nil, false
	}
	return r, true
}

// writeGitError maps git package errors to typed HTTP responses.
func writeGitError(w http.ResponseWriter, err error) {
	// Resolver errors can flow back from the blame endpoint's working-tree
	// read (the one documented exception where the path-resolver chokepoint
	// applies inside /api/git/*). They carry their own typed kind already.
	var re *resolver.ResolveError
	if errors.As(err, &re) {
		writeResolveError(w, err)
		return
	}
	switch {
	case errors.Is(err, gitpkg.ErrNotARepo):
		writeError(w, errKindNotARepo, "served root is not a git repository", http.StatusNotFound)
	case errors.Is(err, gitpkg.ErrUnknownRef):
		writeError(w, errKindUnknownRef, "unknown ref", http.StatusNotFound)
	case errors.Is(err, gitpkg.ErrNotFound):
		writeError(w, errKindNotFound, "not found", http.StatusNotFound)
	case errors.Is(err, gitpkg.ErrTooLarge):
		writeError(w, errKindTooLarge, "file exceeds inline preview size cap", http.StatusRequestEntityTooLarge)
	case errors.Is(err, gitpkg.ErrBlameTimeout):
		writeError(w, errKindBlameTimeout, "blame computation exceeded its deadline", http.StatusServiceUnavailable)
	case errors.Is(err, gitpkg.ErrPatchSourceSHAMismatch):
		writeError(w, errKindBadRequest, "source/sha argument mismatch", http.StatusBadRequest)
	default:
		writeError(w, errKindInternal, err.Error(), http.StatusInternalServerError)
	}
}

// gitInfoNonRepo is the exact body for GET /api/git/info when there is no
// `.git` at the served root. Fields other than `is_repo` are omitted (not
// `null`) so the SPA can model GitInfo as a discriminated union on `is_repo`.
type gitInfoNonRepo struct {
	IsRepo bool `json:"is_repo"`
}

func (s *Server) handleGitInfo(w http.ResponseWriter, _ *http.Request) {
	r, err := gitpkg.Open(s.root)
	if err != nil {
		if errors.Is(err, gitpkg.ErrNotARepo) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(gitInfoNonRepo{IsRepo: false})
			return
		}
		writeError(w, errKindInternal, err.Error(), http.StatusInternalServerError)
		return
	}
	info, err := r.Info()
	if err != nil {
		writeError(w, errKindInternal, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, info)
}

func (s *Server) handleGitRefs(w http.ResponseWriter, _ *http.Request) {
	r, ok := s.openRepo(w)
	if !ok {
		return
	}
	refs, err := r.Refs()
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, refs)
}

func (s *Server) handleGitCommits(w http.ResponseWriter, req *http.Request) {
	r, ok := s.openRepo(w)
	if !ok {
		return
	}
	q := req.URL.Query()
	ref := q.Get("ref")
	cursor := q.Get("cursor")
	limit := parseIntDefault(q.Get("limit"), gitpkg.CommitsDefaultLimit)
	path := q.Get("path")

	// Validate before any go-git call. Malformed inputs collapse to unknown_ref.
	if ref != "" && !gitpkg.ValidRef(ref) {
		writeGitError(w, gitpkg.ErrUnknownRef)
		return
	}
	if cursor != "" && !gitpkg.ValidSHA(cursor) {
		writeGitError(w, gitpkg.ErrUnknownRef)
		return
	}
	// `path` requires no separate validation — it is a repo-relative pathspec
	// into the git object tree, not a filesystem path (see git-reader's
	// "Path semantics declaration" requirement). A syntactically valid but
	// nonexistent path simply yields an empty filtered result.

	res, err := r.Commits(ref, cursor, limit, path)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, res)
}

func (s *Server) handleGitCommit(w http.ResponseWriter, req *http.Request) {
	r, ok := s.openRepo(w)
	if !ok {
		return
	}
	q := req.URL.Query()
	sha := q.Get("sha")
	if sha == "" {
		writeError(w, errKindBadRequest, "missing sha", http.StatusBadRequest)
		return
	}
	if !gitpkg.ValidSHA(sha) {
		writeGitError(w, gitpkg.ErrUnknownRef)
		return
	}
	fileOffset := parseIntDefault(q.Get("file_offset"), 0)
	fileLimit := parseIntDefault(q.Get("file_limit"), gitpkg.CommitFilesDefaultLimit)

	res, err := r.Commit(sha, fileOffset, fileLimit)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, res)
}

func (s *Server) handleGitStatus(w http.ResponseWriter, _ *http.Request) {
	r, ok := s.openRepo(w)
	if !ok {
		return
	}
	res, err := r.Status()
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, res)
}

func (s *Server) handleGitPatch(w http.ResponseWriter, req *http.Request) {
	r, ok := s.openRepo(w)
	if !ok {
		return
	}
	q := req.URL.Query()
	source := gitpkg.PatchSource(q.Get("source"))
	switch source {
	case gitpkg.PatchSourceCommit, gitpkg.PatchSourceStaged, gitpkg.PatchSourceUnstaged:
	default:
		writeError(w, errKindBadRequest, "source must be one of: commit, staged, unstaged", http.StatusBadRequest)
		return
	}
	sha := q.Get("sha")
	path := q.Get("path")
	if path == "" {
		writeError(w, errKindBadRequest, "missing path", http.StatusBadRequest)
		return
	}
	if sha != "" && !gitpkg.ValidSHA(sha) {
		writeGitError(w, gitpkg.ErrUnknownRef)
		return
	}
	hunkOffset := parseIntDefault(q.Get("hunk_offset"), 0)
	hunkLimit := parseIntDefault(q.Get("hunk_limit"), gitpkg.PatchHunksDefaultLimit)

	res, err := r.Patch(source, sha, path, hunkOffset, hunkLimit)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, res)
}

func (s *Server) handleGitBlame(w http.ResponseWriter, req *http.Request) {
	r, ok := s.openRepo(w)
	if !ok {
		return
	}
	q := req.URL.Query()
	path := q.Get("path")
	if path == "" {
		writeError(w, errKindBadRequest, "missing path", http.StatusBadRequest)
		return
	}
	ref := q.Get("ref")
	if ref != "" && !gitpkg.ValidRefWithCaret(ref) {
		writeGitError(w, gitpkg.ErrUnknownRef)
		return
	}
	res, err := r.Blame(s.resolver, path, ref, 0)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, res)
}

// parseIntDefault returns def when s is empty or unparseable. Negative values
// fall back to def too — callers always pass positive defaults that the inner
// git API will clamp further.
func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return def
	}
	return n
}

func writeJSON(w http.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}
