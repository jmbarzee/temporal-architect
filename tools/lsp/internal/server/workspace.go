package server

import (
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"

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

// wsSource is one merge input: its base name (for definition source-file
// stamping) and its raw content.
type wsSource struct {
	base    string
	content string
}

// mergeWorkspace walks the workspace root for `.twf` files, substitutes the
// live buffer content for whichever on-disk file matches bufAbs, and merges the
// sources into a single AST exactly as the envelope's parseSources does: parse
// each source independently, stamp every definition with its source file and
// owning package, thread each file's imports (stamped with the declaring file's
// package) into the merged payload, and set the merged package to the sole
// package when the tree is single-package. The buffer is always included as a
// source even when it is not found on disk. Sibling read errors skip that
// sibling (best-effort). The returned AST is used only to compute diagnostics;
// it never becomes doc.File.
func mergeWorkspace(root, bufAbs, bufContent, bufBase string) *ast.File {
	var files []string
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			// Best-effort: skip unreadable subtrees rather than aborting.
			if d != nil && d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(p, ".twf") {
			files = append(files, p)
		}
		return nil
	})
	sort.Strings(files)

	sources := make([]wsSource, 0, len(files)+1)
	bufIncluded := false
	for _, p := range files {
		abs, err := filepath.Abs(p)
		if err != nil {
			continue
		}
		if bufAbs != "" && abs == bufAbs {
			sources = append(sources, wsSource{base: filepath.Base(p), content: bufContent})
			bufIncluded = true
			continue
		}
		data, err := os.ReadFile(p)
		if err != nil {
			// Best-effort: skip siblings that fail to read.
			continue
		}
		sources = append(sources, wsSource{base: filepath.Base(p), content: string(data)})
	}
	if !bufIncluded {
		sources = append(sources, wsSource{base: bufBase, content: bufContent})
	}

	return mergeSources(sources)
}

// mergeSources parses and stamps each source into a single merged AST, mirroring
// pipeline.parseSources' merge/stamp logic against the public parser/ast APIs.
// (This predates tools/lsp/pipeline being public; consolidating this server onto
// pipeline is a deferred follow-up — see issue #147.)
func mergeSources(sources []wsSource) *ast.File {
	merged := &ast.File{}
	pkgSeen := map[string]bool{}

	for _, s := range sources {
		file, _ := parser.ParseFileAll(s.content)

		pkgSeen[file.Package] = true

		// Thread the file's imports into the merged payload, stamped with the
		// declaring file's package so the resolver can build per-package
		// binding tables. Runtime-only — never serialized.
		for _, imp := range file.Imports {
			imp.Package = file.Package
			imp.SourceFile = s.base
			merged.Imports = append(merged.Imports, imp)
		}

		for _, def := range file.Definitions {
			setSourceFile(def, s.base)
			setPackage(def, file.Package)
			merged.Definitions = append(merged.Definitions, def)
		}
	}

	// Sole package when the whole tree is single-package (including the
	// all-default case); empty when the merge spans multiple packages.
	if len(pkgSeen) == 1 {
		for pkg := range pkgSeen {
			merged.Package = pkg
		}
	}

	return merged
}

// setSourceFile stamps a definition with its source file name. Mirrors
// pipeline.setSourceFile.
func setSourceFile(def ast.Definition, sourceFile string) {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		d.SourceFile = sourceFile
	case *ast.ActivityDef:
		d.SourceFile = sourceFile
	case *ast.WorkerDef:
		d.SourceFile = sourceFile
	case *ast.NamespaceDef:
		d.SourceFile = sourceFile
	case *ast.NexusServiceDef:
		d.SourceFile = sourceFile
	}
}

// setPackage stamps a definition with its owning package. Mirrors
// pipeline.setPackage.
func setPackage(def ast.Definition, pkg string) {
	switch d := def.(type) {
	case *ast.WorkflowDef:
		d.Package = pkg
	case *ast.ActivityDef:
		d.Package = pkg
	case *ast.WorkerDef:
		d.Package = pkg
	case *ast.NamespaceDef:
		d.Package = pkg
	case *ast.NexusServiceDef:
		d.Package = pkg
	}
}

// filterMergedResolveErrs filters merged resolve errors down to the ones that
// belong to the open buffer, keyed on the reference-site file the resolver now
// stamps onto every error (issue #136): an error is kept iff its File equals
// bufBase, the base name of the open buffer.
//
// This replaces the earlier name/line heuristics (bufDefinesSymbol /
// findNodeAtLine): a reference error carries the *referencing* file, so a bare
// undefined-workflow call in the open buffer surfaces here while never leaking
// onto a sibling that merely defines a same-named symbol. Import warnings
// attribute too, since ImportDecl.SourceFile is stamped in the merge.
func filterMergedResolveErrs(errs []*resolver.ResolveError, bufBase string) []*resolver.ResolveError {
	if bufBase == "" {
		return nil
	}
	var out []*resolver.ResolveError
	for _, e := range errs {
		if e.File == bufBase {
			out = append(out, e)
		}
	}
	return out
}
