package mime

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var extTable = map[string]string{
	// Markup / docs
	".md":       "text/markdown; charset=utf-8",
	".markdown": "text/markdown; charset=utf-8",
	".txt":      "text/plain; charset=utf-8",
	// Data / config / query
	".json":    "text/json; charset=utf-8",
	".yaml":    "text/yaml; charset=utf-8",
	".yml":     "text/yaml; charset=utf-8",
	".toml":    "text/toml; charset=utf-8",
	".graphql": "text/x-graphql; charset=utf-8",
	".gql":     "text/x-graphql; charset=utf-8",
	".proto":   "text/x-protobuf; charset=utf-8",
	// Web / scripting
	".go":  "text/x-go; charset=utf-8",
	".ts":  "text/typescript; charset=utf-8",
	".tsx": "text/typescript; charset=utf-8",
	".js":  "text/javascript; charset=utf-8",
	".jsx": "text/javascript; charset=utf-8",
	".py":  "text/x-python; charset=utf-8",
	".rb":  "text/x-ruby; charset=utf-8",
	".rs":  "text/x-rust; charset=utf-8",
	".sh":  "text/x-sh; charset=utf-8",
	// Markup / styling
	".html": "text/html; charset=utf-8",
	".htm":  "text/html; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".scss": "text/x-scss; charset=utf-8",
	".xml":  "text/xml; charset=utf-8",
	// Systems / data
	".sql": "text/x-sql; charset=utf-8",
	".c":   "text/x-c; charset=utf-8",
	".cpp": "text/x-c++; charset=utf-8",
	".h":   "text/x-c; charset=utf-8",
	".java": "text/x-java; charset=utf-8",
	".csv": "text/csv; charset=utf-8",
	// New programming languages
	".cs":    "text/x-csharp; charset=utf-8",
	".kt":    "text/x-kotlin; charset=utf-8",
	".kts":   "text/x-kotlin; charset=utf-8",
	".swift": "text/x-swift; charset=utf-8",
	".scala": "text/x-scala; charset=utf-8",
	".sc":    "text/x-scala; charset=utf-8",
	".groovy": "text/x-groovy; charset=utf-8",
	".gradle": "text/x-groovy; charset=utf-8",
	".m":     "text/x-objectivec; charset=utf-8",
	".mm":    "text/x-objectivec; charset=utf-8",
	".fs":    "text/x-fsharp; charset=utf-8",
	".fsi":   "text/x-fsharp; charset=utf-8",
	".fsx":   "text/x-fsharp; charset=utf-8",
	".php":   "text/x-php; charset=utf-8",
	".phtml": "text/x-php; charset=utf-8",
	".dart":  "text/x-dart; charset=utf-8",
	".lua":   "text/x-lua; charset=utf-8",
	".pl":    "text/x-perl; charset=utf-8",
	".pm":    "text/x-perl; charset=utf-8",
	".ps1":   "text/x-powershell; charset=utf-8",
	".psm1":  "text/x-powershell; charset=utf-8",
	".r":     "text/x-r; charset=utf-8",
	".hs":    "text/x-haskell; charset=utf-8",
	".lhs":   "text/x-haskell; charset=utf-8",
	".ex":    "text/x-elixir; charset=utf-8",
	".exs":   "text/x-elixir; charset=utf-8",
	".erl":   "text/x-erlang; charset=utf-8",
	".hrl":   "text/x-erlang; charset=utf-8",
	".clj":   "text/x-clojure; charset=utf-8",
	".cljs":  "text/x-clojure; charset=utf-8",
	".cljc":  "text/x-clojure; charset=utf-8",
	".edn":   "text/x-clojure; charset=utf-8",
	".jl":    "text/x-julia; charset=utf-8",
	".zig":   "text/x-zig; charset=utf-8",
	// Images
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".svg":  "image/svg+xml",
	".ico":  "image/x-icon",
	// Archives / binary
	".pdf": "application/pdf",
	".zip": "application/zip",
	".tar": "application/x-tar",
	".gz":  "application/gzip",
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
