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

	protocol "github.com/tliron/glsp/protocol_3_17"
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
// envelope.parseSources' merge/stamp logic against the public parser/ast APIs.
// (The envelope package is internal to cmd/twf and cannot be imported here.)
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
// envelope.setSourceFile.
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
// envelope.setPackage.
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

// leafName is the package qualifier an import declares when it has no alias.
// It is the last "/"-separated segment, except that a trailing Go-style version
// segment ("v" followed by one or more digits, e.g. "/v2") is stripped and the
// preceding segment used instead — Go's importPathToAssumedName rule. Mirrors
// resolver.leafName (unexported there); the two must change in lockstep or LSP
// hover/completion diverges from `twf check`.
func leafName(path string) string {
	i := strings.LastIndex(path, "/")
	if i < 0 {
		return path
	}
	last := path[i+1:]
	if isVersionSegment(last) {
		// Strip the trailing /vN and use the preceding segment when one exists.
		if j := strings.LastIndex(path[:i], "/"); j >= 0 {
			return path[j+1 : i]
		}
		return path[:i]
	}
	return last
}

// isVersionSegment reports whether s is a Go-style module version segment: the
// letter "v" followed by one or more decimal digits (v1, v2, v10). Mirrors
// resolver.isVersionSegment.
func isVersionSegment(s string) bool {
	if len(s) < 2 || s[0] != 'v' {
		return false
	}
	for i := 1; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// filterMergedResolveErrs filters merged resolve errors down to the ones that
// belong to the open buffer, using bufFile (the buffer's own single-buffer AST)
// as the position/ownership oracle:
//
//   - import diagnostics (UNRESOLVED_IMPORT / UNUSED_IMPORT, whose Name is the
//     import qualifier) are kept iff bufFile declares an import whose bound
//     qualifier equals Name at the same line;
//   - every other resolve error is kept iff bufFile owns a construct at the
//     error's line, or bufFile defines a symbol named e.Name.
//
// Because the kept set is built from bufFile, a diagnostic can never render at a
// line the open buffer does not own.
func filterMergedResolveErrs(errs []*resolver.ResolveError, bufFile *ast.File) []*resolver.ResolveError {
	if bufFile == nil {
		return nil
	}
	var out []*resolver.ResolveError
	for _, e := range errs {
		if e.Kind == resolver.ErrUnresolvedImport || e.Kind == resolver.ErrUnusedImport {
			if bufImportQualifierAtLine(bufFile, e.Name, e.Line) {
				out = append(out, e)
			}
			continue
		}
		if findNodeAtLine(bufFile, e.Line) != nil || bufDefinesSymbol(bufFile, e.Name) {
			out = append(out, e)
		}
	}
	return out
}

// bufImportQualifierAtLine reports whether bufFile declares an import whose
// bound qualifier (alias, else path leaf) equals name at the given line.
func bufImportQualifierAtLine(bufFile *ast.File, name string, line int) bool {
	for _, imp := range bufFile.Imports {
		q := imp.Alias
		if q == "" {
			q = leafName(imp.Path)
		}
		if q == name && imp.Line == line {
			return true
		}
	}
	return false
}

// bufDefinesSymbol reports whether bufFile declares a top-level definition named
// name (covers e.g. a duplicate whose header sits on the error's line).
func bufDefinesSymbol(bufFile *ast.File, name string) bool {
	if name == "" {
		return false
	}
	for _, def := range bufFile.Definitions {
		switch d := def.(type) {
		case *ast.WorkflowDef:
			if d.Name == name {
				return true
			}
		case *ast.ActivityDef:
			if d.Name == name {
				return true
			}
		case *ast.WorkerDef:
			if d.Name == name {
				return true
			}
		case *ast.NamespaceDef:
			if d.Name == name {
				return true
			}
		case *ast.NexusServiceDef:
			if d.Name == name {
				return true
			}
		}
	}
	return false
}
