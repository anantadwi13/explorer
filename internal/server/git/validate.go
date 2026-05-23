package git

import "strings"

// ValidSHA matches [0-9a-fA-F]{4,64} — git short shas can be as short as 4
// chars and SHA-256 object names are up to 64 chars. Comparison is
// case-insensitive, but go-git wants a lower-case key for object lookup;
// the helper normalises.
func ValidSHA(s string) bool {
	if len(s) < 4 || len(s) > 64 {
		return false
	}
	for _, c := range s {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}

// NormaliseSHA lower-cases a sha that has already passed ValidSHA. Callers
// should always validate first.
func NormaliseSHA(s string) string {
	return strings.ToLower(s)
}

// ValidRef enforces a conservative subset of git's ref-name rules
// (`git check-ref-format`). It accepts branch names, tag names, and short or
// full shas. Permitted:
//   - any char that is NOT control / space / tilde / caret / colon / question
//     / asterisk / open-bracket / backslash / quote.
//   - the two-char sequence `..` is forbidden.
//   - leading `-` and leading or trailing `/` forbidden.
//   - the literal sequences `/.` and `.lock` at the end forbidden.
//
// Inputs that fail validation collapse to ErrUnknownRef at the HTTP layer —
// we deliberately do not surface a separate "invalid argument" error.
func ValidRef(s string) bool {
	if s == "" {
		return false
	}
	if s == "@" || strings.Contains(s, "@{") {
		return false
	}
	if strings.HasPrefix(s, "-") || strings.HasPrefix(s, "/") || strings.HasSuffix(s, "/") {
		return false
	}
	if strings.HasSuffix(s, ".lock") || strings.HasSuffix(s, ".") {
		return false
	}
	if strings.Contains(s, "..") || strings.Contains(s, "//") || strings.Contains(s, "/.") {
		return false
	}
	for _, c := range s {
		switch {
		case c <= 0x20: // ASCII control + space
			return false
		case c == 0x7F:
			return false
		case c == '~', c == '^', c == ':', c == '?', c == '*', c == '[', c == '\\':
			return false
		}
	}
	return true
}
