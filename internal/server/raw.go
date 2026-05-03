package server

import (
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/anantadwi13/explorer/internal/server/mime"
)

func (s *Server) handleRaw(w http.ResponseWriter, r *http.Request) {
	// Strip the /raw/ prefix; the rest is the percent-decoded path (net/http decodes for us).
	urlPath := r.URL.Path
	reqPath := strings.TrimPrefix(urlPath, "/raw/")
	reqPath = strings.TrimPrefix(reqPath, "/")

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
