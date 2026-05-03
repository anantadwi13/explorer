package server

import (
	"github.com/anantadwi13/explorer/internal/server/resolver"
)

func (s *Server) registerRoutes() {
	s.resolver = resolver.New(s.root)

	s.mux.HandleFunc("/api/tree", s.handleTree)
	s.mux.HandleFunc("/api/meta", s.handleMeta)
	s.mux.HandleFunc("/raw/", s.handleRaw)
	s.mux.HandleFunc("/", s.handleStatic)
}
