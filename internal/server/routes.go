package server

import (
	"github.com/anantadwi13/explorer/internal/server/resolver"
)

func (s *Server) registerRoutes() {
	s.resolver = resolver.New(s.root)

	s.mux.HandleFunc("/api/tree", s.handleTree)
	s.mux.HandleFunc("/api/meta", s.handleMeta)

	// git-reader endpoints — all exact-match, all JSON, all read-only.
	s.mux.HandleFunc("/api/git/info", s.handleGitInfo)
	s.mux.HandleFunc("/api/git/refs", s.handleGitRefs)
	s.mux.HandleFunc("/api/git/commits", s.handleGitCommits)
	s.mux.HandleFunc("/api/git/commit", s.handleGitCommit)
	s.mux.HandleFunc("/api/git/status", s.handleGitStatus)
	s.mux.HandleFunc("/api/git/patch", s.handleGitPatch)
	s.mux.HandleFunc("/api/git/blame", s.handleGitBlame)

	s.mux.HandleFunc("/raw/", s.handleRaw)
	s.mux.HandleFunc("/", s.handleStatic)
}
