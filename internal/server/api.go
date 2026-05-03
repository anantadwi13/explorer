package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/anantadwi13/explorer/internal/server/mime"
)

// inlineSizeCap is the maximum file size (bytes) for inline markdown/text
// preview. Documentation-only on the Go side: the SPA enforces this in
// `INLINE_CAP` (web/src/api/client.ts) before fetching /raw/ for text. Both
// constants and the spec must move together.
const inlineSizeCap = 5 * 1024 * 1024

type treeEntry struct {
	Name  string     `json:"name"`
	Type  string     `json:"type"`
	Size  *int64     `json:"size,omitempty"`
	Mtime *time.Time `json:"mtime,omitempty"`
	Mime  *string    `json:"mime,omitempty"`
	Kind  *string    `json:"kind,omitempty"`
}

type treeResponse struct {
	Entries []treeEntry `json:"entries"`
}

func (s *Server) handleTree(w http.ResponseWriter, r *http.Request) {
	reqPath := r.URL.Query().Get("path")
	reqPath = strings.TrimPrefix(reqPath, "/")

	res, err := s.resolver.Resolve(reqPath)
	if err != nil {
		writeResolveError(w, err)
		return
	}
	if !res.Info.IsDir() {
		writeError(w, "not_regular", "path is not a directory", http.StatusBadRequest)
		return
	}

	entries, err := os.ReadDir(res.AbsPath)
	if err != nil {
		writeError(w, "internal_error", err.Error(), http.StatusInternalServerError)
		return
	}

	var dirs, files []treeEntry
	for _, e := range entries {
		name := e.Name()
		entryPath := filepath.Join(res.AbsPath, name)

		// Resolve symlinks for each entry; drop if outside root.
		childRes, err := s.resolver.Resolve(filepath.Join(reqPath, name))
		if err != nil {
			continue // outside root or not accessible — drop
		}

		if childRes.Info.IsDir() {
			dirs = append(dirs, treeEntry{Name: name, Type: "dir"})
		} else {
			sz := childRes.Info.Size()
			mt := childRes.Info.ModTime()
			mimeType := mime.Detect(entryPath)
			entry := treeEntry{
				Name:  name,
				Type:  "file",
				Size:  &sz,
				Mtime: &mt,
				Mime:  &mimeType,
			}
			if k := fileKind(mimeType); k != "" {
				entry.Kind = &k
			}
			files = append(files, entry)
		}
	}

	caseInsensitive := func(a, b string) bool {
		return strings.ToLower(a) < strings.ToLower(b)
	}
	sort.Slice(dirs, func(i, j int) bool { return caseInsensitive(dirs[i].Name, dirs[j].Name) })
	sort.Slice(files, func(i, j int) bool { return caseInsensitive(files[i].Name, files[j].Name) })

	all := append(dirs, files...)
	if all == nil {
		all = []treeEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(treeResponse{Entries: all})
}

// metaResponse is the body for GET /api/meta — file metadata only,
// never content. The SPA fetches bytes via /raw/<path> and decodes
// + size-caps client-side.
type metaResponse struct {
	Size  int64     `json:"size"`
	Mtime time.Time `json:"mtime"`
	Mime  string    `json:"mime"`
	Kind  string    `json:"kind,omitempty"`
}

func (s *Server) handleMeta(w http.ResponseWriter, r *http.Request) {
	reqPath := r.URL.Query().Get("path")
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

	mimeType := mime.Detect(res.AbsPath)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metaResponse{
		Size:  res.Info.Size(),
		Mtime: res.Info.ModTime(),
		Mime:  mimeType,
		Kind:  fileKind(mimeType),
	})
}

// fileKind classifies a MIME type into one of: "markdown", "text", "image", or "".
func fileKind(mimeType string) string {
	mt := strings.ToLower(mimeType)
	mt = strings.SplitN(mt, ";", 2)[0]
	mt = strings.TrimSpace(mt)

	if mt == "text/markdown" {
		return "markdown"
	}
	if strings.HasPrefix(mt, "text/") {
		return "text"
	}
	// Known text-like application types
	switch mt {
	case "application/json", "application/xml", "application/yaml":
		return "text"
	}
	if strings.HasPrefix(mt, "image/") {
		return "image"
	}
	return ""
}
