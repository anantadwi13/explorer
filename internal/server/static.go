package server

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/anantadwi13/explorer/internal/server/ui"
)

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	dist, err := fs.Sub(ui.FS, "dist")
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/")

	// Serve the exact file if it exists; otherwise fall back to index.html for SPA routes.
	if path != "" {
		if _, err := dist.Open(path); err == nil {
			http.FileServerFS(dist).ServeHTTP(w, r)
			return
		}
	}

	http.ServeFileFS(w, r, dist, "index.html")
}
