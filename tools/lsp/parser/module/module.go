// Package module holds twf's module rules: the `twf.mod` file format, the
// syntax of module, package and import paths, and a path's assumed package
// name. It touches no filesystem; discovery lives in the pipeline.
package module

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
	xmodule "golang.org/x/mod/module"
)

// FileName is the module file's exact name.
const FileName = "twf.mod"

// File is a parsed, valid `twf.mod`.
type File struct {
	// Path is the module path.
	Path string
	// PathLine is the line of the `module` directive.
	PathLine int
	// Unknown lists the lines of directives other than `module`, which are
	// ignored with a warning so a future directive does not break an older twf.
	Unknown []Directive
}

// Directive is one unknown directive line.
type Directive struct {
	Name string
	Line int
}

// Error is a `twf.mod` that cannot be used: MODULE_FILE_INVALID, at column 1
// of Line. It is the file's only diagnostic.
type Error struct {
	Msg  string
	Line int
}

func (e *Error) Error() string { return e.Msg }

// Parse parses a `twf.mod`. The file is line-oriented UTF-8 (a leading BOM is
// ignored, `\r\n` accepted); `#` starts a comment anywhere on a line; a line's
// directive is its first word. Exactly one `module <path>` is required, with
// one unquoted, valid path.
func Parse(data []byte) (*File, *Error) {
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	f := &File{}
	var bad *Error
	var firstUnknown *Directive
	for i, raw := range strings.Split(string(data), "\n") {
		line := i + 1
		text, _, _ := strings.Cut(strings.TrimSuffix(raw, "\r"), "#")
		words := strings.Fields(text)
		if len(words) == 0 {
			continue
		}
		if words[0] != "module" {
			f.Unknown = append(f.Unknown, Directive{Name: words[0], Line: line})
			if firstUnknown == nil {
				firstUnknown = &f.Unknown[len(f.Unknown)-1]
			}
			continue
		}
		if f.PathLine != 0 {
			return nil, &Error{Msg: fmt.Sprintf("second module directive (first at line %d)", f.PathLine), Line: line}
		}
		f.PathLine = line
		switch {
		case len(words) != 2 || strings.ContainsAny(words[1], "\"`"):
			if bad == nil {
				bad = &Error{Msg: "malformed module directive: expected one unquoted path", Line: line}
			}
		default:
			if err := CheckPath(words[1]); err != nil && bad == nil {
				bad = &Error{Msg: fmt.Sprintf("invalid module path %q: %v", words[1], err), Line: line}
			}
			f.Path = words[1]
		}
	}
	switch {
	case bad != nil:
		return nil, bad
	case f.PathLine == 0 && firstUnknown != nil:
		return nil, &Error{Msg: fmt.Sprintf("unknown directive %q; expected \"module <path>\"", firstUnknown.Name), Line: firstUnknown.Line}
	case f.PathLine == 0:
		return nil, &Error{Msg: "no module directive", Line: 1}
	}
	return f, nil
}

// CheckPath reports whether p is a valid module, package or import path:
// `golang.org/x/mod/module.CheckImportPath`, dot-less paths included.
func CheckPath(p string) error {
	err := xmodule.CheckImportPath(p)
	if e, ok := err.(*xmodule.InvalidPathError); ok {
		return e.Err
	}
	return err
}

// IsLocal reports whether p is a local path (`.`, `..`, `./…`, `../…`), which
// is never a module or import path.
func IsLocal(p string) bool {
	return p == "." || p == ".." || strings.HasPrefix(p, "./") || strings.HasPrefix(p, "../")
}

// AssumedName is the package name a path's last element implies: that element,
// except that a trailing version element (`v` and one or more decimal digits,
// with an element before it) is stripped and the preceding element used.
func AssumedName(p string) string {
	elems := strings.Split(p, "/")
	last := elems[len(elems)-1]
	if len(elems) > 1 && isVersion(last) {
		return elems[len(elems)-2]
	}
	return last
}

func isVersion(s string) bool {
	if len(s) < 2 || s[0] != 'v' {
		return false
	}
	for _, r := range s[1:] {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// Usable reports whether name can be written as a package name and a
// qualifier: the lexer reads it as exactly one IDENT. Every keyword (`nexus`,
// `worker`, `options` …) is its own token and so is not usable.
func Usable(name string) bool {
	if name == "" {
		return false
	}
	var toks []token.Token
	for _, t := range lexer.New(name).AllTokens() {
		switch t.Type {
		case token.EOF, token.NEWLINE, token.INDENT, token.DEDENT:
			continue
		}
		toks = append(toks, t)
	}
	return len(toks) == 1 && toks[0].Type == token.IDENT && toks[0].Literal == name
}

// RemotePath normalizes a Git remote URL to a module path candidate: the host
// (lowercased) plus the whole path, with scheme, user info, port, a trailing
// `/` and `.git` dropped. `https`, `http`, `ssh`, `git` and scp-style
// `[user@]host:path` remotes are accepted; `file://`, local paths, and a host
// with no `.` (an `insteadOf` alias) give none. User info never reaches the
// result, so a token in an `https` remote cannot leak.
func RemotePath(url string) (string, bool) {
	var host, path string
	if scheme, rest, ok := strings.Cut(url, "://"); ok {
		switch scheme {
		case "https", "http", "ssh", "git":
		default:
			return "", false
		}
		host, path, _ = strings.Cut(rest, "/")
		if i := strings.LastIndexByte(host, '@'); i >= 0 {
			host = host[i+1:]
		}
		if h, _, ok := strings.Cut(host, ":"); ok {
			host = h
		}
	} else {
		h, p, ok := strings.Cut(url, ":")
		if !ok || strings.Contains(h, "/") {
			return "", false
		}
		if i := strings.LastIndexByte(h, '@'); i >= 0 {
			h = h[i+1:]
		}
		host, path = h, p
	}
	host = strings.ToLower(host)
	path = strings.TrimSuffix(strings.Trim(path, "/"), ".git")
	path = strings.TrimSuffix(path, "/")
	if !strings.Contains(host, ".") || path == "" {
		return "", false
	}
	return host + "/" + path, true
}
