package server

import (
	"net/http"

	"github.com/anantadwi13/explorer/internal/server/resolver"
)

// Server is the HTTP handler for the explorer application.
type Server struct {
	root     string
	resolver *resolver.Resolver
	mux      *http.ServeMux
}

// New creates a Server that serves the directory at root.
func New(root string) *Server {
	s := &Server{root: root}
	s.mux = http.NewServeMux()
	s.registerRoutes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
