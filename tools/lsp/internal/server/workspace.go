package server

import (
	"net/url"
	"runtime"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"

	protocol "github.com/jmbarzee/glsp/protocol_3_17"
)

// workspaceFoldersFromParams resolves the workspace folders' filesystem paths
// from the client's initialize params: every workspace folder, else the
// (deprecated) rootUri, else rootPath. Returns nil when none resolve.
func workspaceFoldersFromParams(params *protocol.InitializeParams) []string {
	var out []string
	for _, f := range params.WorkspaceFolders {
		if p := uriToPath(f.URI); p != "" {
			out = append(out, p)
		}
	}
	if len(out) > 0 {
		return out
	}
	if params.RootURI != nil {
		if p := uriToPath(*params.RootURI); p != "" {
			return []string{p}
		}
	}
	if params.RootPath != nil && *params.RootPath != "" {
		return []string{*params.RootPath}
	}
	return nil
}

// uriToPath converts a `file://` URI to a filesystem path. Returns "" for an
// empty URI, an unparseable URI, or a non-`file` scheme. There is no built-in
// URI→path helper in the glsp protocol, so the conversion is done here.
func uriToPath(uri string) string {
	return fileURIToPath(uri, runtime.GOOS == "windows")
}

// fileURIToPath is uriToPath for a given OS: on Windows, `file:///c:/x` is
// `c:\x` and `file://host/share/x` is the UNC path `\\host\share\x`.
// Percent-encoding is decoded.
func fileURIToPath(uri string, windows bool) string {
	if uri == "" {
		return ""
	}
	u, err := url.Parse(uri)
	if err != nil || u.Scheme != "file" || u.Path == "" {
		return ""
	}
	p := u.Path
	if !windows {
		return p
	}
	if u.Host != "" && u.Host != "localhost" {
		return `\\` + u.Host + strings.ReplaceAll(p, "/", `\`)
	}
	if len(p) >= 3 && p[0] == '/' && p[2] == ':' {
		p = p[1:]
	}
	return strings.ReplaceAll(p, "/", `\`)
}

// filterToBuffer keeps the merged resolve and validate errors that belong to
// the open buffer, keyed on the reference-site file each error carries
// (issues #136, #238): an error is kept iff its File is the buffer's
// canonical path, as a Canonical-mode run spells it.
//
// A reference error carries the *referencing* file, so a bare undefined-workflow
// call in the open buffer surfaces here while never leaking onto a sibling that
// merely defines a same-named symbol. Import warnings attribute too, since
// ImportDecl.SourceFile is stamped in the merge.
func filterToBuffer(res pipeline.Result, buf string) ([]*resolver.ResolveError, []*validator.Error) {
	var resolveErrs []*resolver.ResolveError
	for _, e := range res.ResolveErrs {
		if e.File == buf {
			resolveErrs = append(resolveErrs, e)
		}
	}
	var validateErrs []*validator.Error
	for _, e := range res.ValidateErrs {
		if e.File == buf {
			validateErrs = append(validateErrs, e)
		}
	}
	return resolveErrs, validateErrs
}
