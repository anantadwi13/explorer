package resolver

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// ErrorKind describes why path resolution failed.
type ErrorKind string

const (
	ErrNotFound        ErrorKind = "not_found"
	ErrPermissionDenied ErrorKind = "permission_denied"
	ErrOutsideRoot     ErrorKind = "outside_root"
	ErrNotRegular      ErrorKind = "not_regular"
)

// ResolveError is returned when the path cannot be served.
type ResolveError struct {
	Kind    ErrorKind
	Message string
}

func (e *ResolveError) Error() string { return string(e.Kind) + ": " + e.Message }

// Result is returned on successful resolution.
type Result struct {
	AbsPath string
	Info    os.FileInfo
}

// Resolver resolves request-relative paths against a served root.
type Resolver struct {
	root string // absolute, symlink-evaluated
}

// New returns a Resolver for root (must be absolute, EvalSymlinks-resolved).
func New(root string) *Resolver {
	return &Resolver{root: root}
}

// Resolve takes a request-relative path (e.g. "docs/readme.md" or "") and
// returns the contained absolute path and its FileInfo, or a typed error.
func (r *Resolver) Resolve(reqPath string) (*Result, error) {
	// Strip any leading slashes so the path is always relative before cleaning.
	reqPath = strings.TrimLeft(reqPath, "/")

	// Clean and reject dot-dot segments.
	cleaned := filepath.FromSlash(reqPath)
	if cleaned != "" {
		cleaned = filepath.Clean(cleaned)
	}

	// After cleaning, any path starting with ".." is an escape attempt.
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return nil, &ResolveError{Kind: ErrOutsideRoot, Message: "path escapes served root"}
	}

	// A cleaned path that is still absolute means the input was absolute or became
	// absolute after cleaning — reject as an escape attempt.
	if filepath.IsAbs(cleaned) {
		return nil, &ResolveError{Kind: ErrOutsideRoot, Message: "path escapes served root"}
	}

	// Join with the served root.
	joined := filepath.Join(r.root, cleaned)

	// Evaluate symlinks on the joined path.
	resolved, err := filepath.EvalSymlinks(joined)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, &ResolveError{Kind: ErrNotFound, Message: "no such file or directory"}
		}
		if os.IsPermission(err) {
			return nil, &ResolveError{Kind: ErrPermissionDenied, Message: "permission denied"}
		}
		return nil, &ResolveError{Kind: ErrNotFound, Message: err.Error()}
	}

	// Containment check: resolved must have root as a prefix, with a path separator boundary.
	if !isContained(r.root, resolved) {
		return nil, &ResolveError{Kind: ErrOutsideRoot, Message: "path resolves outside served root"}
	}

	// Stat the resolved path.
	info, err := os.Stat(resolved)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, &ResolveError{Kind: ErrNotFound, Message: "no such file or directory"}
		}
		if os.IsPermission(err) {
			return nil, &ResolveError{Kind: ErrPermissionDenied, Message: "permission denied"}
		}
		return nil, &ResolveError{Kind: ErrNotFound, Message: err.Error()}
	}

	// Reject special files (sockets, devices, fifos).
	if !info.IsDir() && !info.Mode().IsRegular() {
		return nil, &ResolveError{Kind: ErrNotRegular, Message: "not a regular file or directory"}
	}

	return &Result{AbsPath: resolved, Info: info}, nil
}

// isContained reports whether candidate is inside root (root itself is also ok).
func isContained(root, candidate string) bool {
	if root == candidate {
		return true
	}
	return strings.HasPrefix(candidate, root+string(filepath.Separator))
}

// IsResolveError reports whether err is a *ResolveError with the given kind.
func IsResolveError(err error, kind ErrorKind) bool {
	var re *ResolveError
	return errors.As(err, &re) && re.Kind == kind
}
