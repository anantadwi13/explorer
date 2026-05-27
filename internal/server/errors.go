package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/anantadwi13/explorer/internal/server/resolver"
)

// Typed error kinds. The set mirrors the TS `ApiError` union in
// web/src/api/types.ts — keep both sides in sync when adding new ones.
const (
	errKindInternal = "internal_error"
	errKindNotFound = "not_found"
	errKindTooLarge = "too_large"

	// git-reader additions.
	errKindNotARepo      = "not_a_repo"
	errKindUnknownRef    = "unknown_ref"
	errKindBadRequest    = "bad_request"
	errKindBlameTimeout  = "blame_timeout"
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
	writeError(w, errKindInternal, err.Error(), http.StatusInternalServerError)
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
