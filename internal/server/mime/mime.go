package mime

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var extTable = map[string]string{
	".md":       "text/markdown; charset=utf-8",
	".markdown": "text/markdown; charset=utf-8",
	".txt":      "text/plain; charset=utf-8",
	".json":     "application/json; charset=utf-8",
	".yaml":     "text/yaml; charset=utf-8",
	".yml":      "text/yaml; charset=utf-8",
	".toml":     "text/toml; charset=utf-8",
	".go":       "text/x-go; charset=utf-8",
	".ts":       "text/typescript; charset=utf-8",
	".tsx":      "text/typescript; charset=utf-8",
	".js":       "text/javascript; charset=utf-8",
	".jsx":      "text/javascript; charset=utf-8",
	".py":       "text/x-python; charset=utf-8",
	".rb":       "text/x-ruby; charset=utf-8",
	".rs":       "text/x-rust; charset=utf-8",
	".sh":       "text/x-sh; charset=utf-8",
	".html":     "text/html; charset=utf-8",
	".htm":      "text/html; charset=utf-8",
	".css":      "text/css; charset=utf-8",
	".scss":     "text/x-scss; charset=utf-8",
	".sql":      "text/x-sql; charset=utf-8",
	".c":        "text/x-c; charset=utf-8",
	".cpp":      "text/x-c++; charset=utf-8",
	".h":        "text/x-c; charset=utf-8",
	".java":     "text/x-java; charset=utf-8",
	".xml":      "text/xml; charset=utf-8",
	".csv":      "text/csv; charset=utf-8",
	".png":      "image/png",
	".jpg":      "image/jpeg",
	".jpeg":     "image/jpeg",
	".gif":      "image/gif",
	".webp":     "image/webp",
	".svg":      "image/svg+xml",
	".ico":      "image/x-icon",
	".pdf":      "application/pdf",
	".zip":      "application/zip",
	".tar":      "application/x-tar",
	".gz":       "application/gzip",
}

// Detect returns the MIME type for the file at absPath.
// Extension lookup is tried first; falls back to http.DetectContentType.
func Detect(absPath string) string {
	ext := strings.ToLower(filepath.Ext(absPath))
	if mt, ok := extTable[ext]; ok {
		return mt
	}
	return sniff(absPath)
}

// DetectByExt returns the MIME type for the given extension (e.g. ".png").
// Returns "" if unknown.
func DetectByExt(ext string) string {
	return extTable[strings.ToLower(ext)]
}

func sniff(absPath string) string {
	f, err := os.Open(absPath)
	if err != nil {
		return "application/octet-stream"
	}
	defer f.Close()

	buf := make([]byte, 512)
	n, err := f.Read(buf)
	if err != nil && n == 0 {
		return "application/octet-stream"
	}
	return http.DetectContentType(buf[:n])
}
