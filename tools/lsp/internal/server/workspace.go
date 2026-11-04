package server

import (
	"net/url"
	"path/filepath"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"

	protocol "github.com/jmbarzee/glsp/protocol_3_17"
)

// workspaceRootFromParams resolves a workspace root filesystem path from the
// client's initialize params, preferring the first workspace folder, then the
// (deprecated) rootUri, then rootPath. Returns "" when none resolve to a path.
func workspaceRootFromParams(params *protocol.InitializeParams) string {
	if len(params.WorkspaceFolders) > 0 {
		if p := uriToPath(params.WorkspaceFolders[0].URI); p != "" {
			return p
		}
	}
	if params.RootURI != nil {
		if p := uriToPath(*params.RootURI); p != "" {
			return p
		}
	}
	if params.RootPath != nil {
		return *params.RootPath
	}
	return ""
}

// uriToPath converts a `file://` URI to an absolute filesystem path. Returns ""
// for an empty URI, an unparseable URI, or a non-`file` scheme. There is no
// built-in URI→path helper in the glsp protocol, so the conversion is done here.
func uriToPath(uri string) string {
	if uri == "" {
		return ""
	}
	u, err := url.Parse(uri)
	if err != nil || u.Scheme != "file" || u.Path == "" {
		return ""
	}
	abs, err := filepath.Abs(u.Path)
	if err != nil {
		return u.Path
	}
	return abs
}

// filterToBuffer keeps the merged resolve and validate errors that belong to
// the open buffer, keyed on the reference-site file each error carries
// (issues #136, #238): an error is kept iff its File equals bufBase, the base
// name of the open buffer.
//
// A reference error carries the *referencing* file, so a bare undefined-workflow
// call in the open buffer surfaces here while never leaking onto a sibling that
// merely defines a same-named symbol. Import warnings attribute too, since
// ImportDecl.SourceFile is stamped in the merge.
func filterToBuffer(res pipeline.Result, bufBase string) ([]*resolver.ResolveError, []*validator.Error) {
	var resolveErrs []*resolver.ResolveError
	for _, e := range res.ResolveErrs {
		if e.File == bufBase {
			resolveErrs = append(resolveErrs, e)
		}
	}
	var validateErrs []*validator.Error
	for _, e := range res.ValidateErrs {
		if e.File == bufBase {
			validateErrs = append(validateErrs, e)
		}
	}
	return resolveErrs, validateErrs
}
