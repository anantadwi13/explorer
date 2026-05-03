package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/anantadwi13/explorer/internal/server/resolver"
)

type apiError struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

func writeError(w http.ResponseWriter, kind string, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(apiError{Error: kind, Message: message})
}

func writeResolveError(w http.ResponseWriter, err error) {
	var re *resolver.ResolveError
	if errors.As(err, &re) {
		status := resolveErrorStatus(re.Kind)
		writeError(w, string(re.Kind), re.Message, status)
		return
	}
	writeError(w, "internal_error", err.Error(), http.StatusInternalServerError)
}

func resolveErrorStatus(kind resolver.ErrorKind) int {
	switch kind {
	case resolver.ErrNotFound:
		return http.StatusNotFound
	case resolver.ErrPermissionDenied:
		return http.StatusForbidden
	case resolver.ErrOutsideRoot:
		return http.StatusBadRequest
	case resolver.ErrNotRegular:
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}
