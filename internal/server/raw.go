package server

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"strings"

	gitpkg "github.com/anantadwi13/explorer/internal/server/git"
	"github.com/anantadwi13/explorer/internal/server/mime"
)

func (s *Server) handleRaw(w http.ResponseWriter, r *http.Request) {
	// Strip the /raw/ prefix; the rest is the percent-decoded path (net/http decodes for us).
	urlPath := r.URL.Path
	reqPath := strings.TrimPrefix(urlPath, "/raw/")
	reqPath = strings.TrimPrefix(reqPath, "/")
	ref := r.URL.Query().Get("ref")

	if ref != "" {
		s.handleRawAtRef(w, reqPath, ref)
		return
	}

	res, err := s.resolver.Resolve(reqPath)
	if err != nil {
		writeResolveError(w, err)
		return
	}
	if res.Info.IsDir() {
		writeError(w, "not_regular", "path is a directory", http.StatusBadRequest)
		return
	}

	f, err := os.Open(res.AbsPath)
	if err != nil {
		if os.IsPermission(err) {
			writeError(w, "permission_denied", "permission denied", http.StatusForbidden)
		} else {
			writeError(w, "internal_error", err.Error(), http.StatusInternalServerError)
		}
		return
	}
	defer f.Close()

	mimeType := mime.Detect(res.AbsPath)
	w.Header().Set("Content-Type", mimeType)
	io.Copy(w, f)
}

// handleRawAtRef serves /raw/<path>?ref=<r> using git-tree containment. See
// the path-resolver capability's two-mode containment requirement for the
// security model: ref-scoped requests bypass the filesystem resolver and rely
// on the structural bounding of the git tree lookup.
func (s *Server) handleRawAtRef(w http.ResponseWriter, path, ref string) {
	if !gitpkg.ValidRefWithCaret(ref) {
		writeError(w, errKindUnknownRef, "unknown ref", http.StatusNotFound)
		return
	}
	repo, err := gitpkg.Open(s.root)
	if err != nil {
		writeError(w, errKindUnknownRef, "unknown ref", http.StatusNotFound)
		return
	}
	content, mimeType, _, _, err := repo.BlobAt(ref, path)
	if err != nil {
		writeRefBlobError(w, err)
		return
	}
	w.Header().Set("Content-Type", mimeType)
	io.Copy(w, bytes.NewReader(content))
}
