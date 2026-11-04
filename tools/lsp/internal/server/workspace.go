package server

import (
	"net/url"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
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

// Diagnostic codes by their role in moduleDiagnostics.
var (
	importCodes = codes(resolver.ErrInvalidImportPath, resolver.ErrSelfImport, resolver.ErrImportNeedsAlias,
		resolver.ErrDuplicateImportName, resolver.ErrImportNotLoaded, resolver.ErrImportNotFound, resolver.ErrUnresolvedImport)
	exclusionCodes = codes(resolver.ErrModuleFileInvalid, resolver.ErrPackageOutsideModule, resolver.ErrDuplicateModule,
		resolver.ErrPackageClauseConflict, resolver.ErrInvalidPackagePath, resolver.ErrDuplicatePackage)
)

func codeOf(k resolver.ErrorKind) string { return (&resolver.ResolveError{Kind: k}).Code() }

func codes(kinds ...resolver.ErrorKind) map[string]bool {
	m := map[string]bool{}
	for _, k := range kinds {
		m[codeOf(k)] = true
	}
	return m
}

// fileLine is a line of a file, spelled as a Canonical-mode run spells it.
type fileLine struct {
	file string
	line int
}

// moduleDiagnostics is what the analysis of the buffer buf (as the run spells
// it), in package pkg and directory dir, publishes on other files, so that
// every silent import and every exclusion near the buffer has a visible cause:
//
//   - the exclusion of every excluded file in dir;
//   - every diagnostic on the buffer's module's twf.mod, and a broken twf.mod
//     at dir or at the home folder;
//   - unless the buffer is excluded: each failing or external import line of
//     its package, in any of the package's files; each sinking line's cause
//     set; and the DUPLICATE_MODULE of a module one of them lies under.
//
// An excluded file's exclusion is its exclusion diagnostics, or, with none (a
// failed clause, a lost module), its parse errors.
func moduleDiagnostics(res pipeline.Result, buf, pkg, dir, modRoot, home string) []pipeline.Diagnostic {
	modFile := func(root string) string {
		if root == "" {
			return ""
		}
		return filepath.ToSlash(filepath.Join(root, "twf.mod"))
	}
	ownMod := modFile(modRoot)
	rootMods := map[string]bool{modFile(dir): true, modFile(home): true}

	excluded := res.Excluded[buf]
	lines := map[fileLine]bool{}
	causes := map[string]bool{}
	var paths []string
	if !excluded {
		for _, imp := range res.File.Imports {
			if imp.PkgID != pkg {
				continue
			}
			lines[fileLine{imp.SourceFile, imp.Line}] = true
			paths = append(paths, strings.ToLower(imp.Path))
			if o := res.File.ImportOutcomes[imp]; o.Kind == ast.ImportSink {
				for _, c := range o.Causes {
					causes[c] = true
				}
			}
		}
	}
	importsUnder := func(m string) bool {
		m = strings.ToLower(m)
		for _, p := range paths {
			if p == m || strings.HasPrefix(p, m+"/") {
				return true
			}
		}
		return false
	}
	hasExclusion := map[string]bool{}
	for _, x := range res.Diagnostics {
		if exclusionCodes[x.Code] {
			hasExclusion[x.File] = true
		}
	}
	exclusion := func(x pipeline.Diagnostic) bool {
		if hasExclusion[x.File] {
			return exclusionCodes[x.Code]
		}
		return x.Kind == "parse"
	}

	var out []pipeline.Diagnostic
	for _, x := range res.Diagnostics {
		switch {
		case x.File == buf:
			continue
		case res.Excluded[x.File] && path.Dir(x.File) == filepath.ToSlash(dir) && exclusion(x):
		case x.File == ownMod:
		case rootMods[x.File] && x.Code == codeOf(resolver.ErrModuleFileInvalid):
		case excluded:
			continue
		case x.Kind == "resolve" && importCodes[x.Code] && lines[fileLine{x.File, x.Start.Line}]:
		case causes[x.File] && exclusion(x):
		case x.Code == codeOf(resolver.ErrDuplicateModule) && importsUnder(x.Name):
		default:
			continue
		}
		out = append(out, x)
	}
	return out
}

// editorHints rewords, for the editor, the CLI's hint on an IMPORT_NOT_FOUND
// that stopped at a directory every walk skips (see skipHint).
func editorHints(res pipeline.Result, folders []string) {
	const cli = " (pass it explicitly)"
	hints := map[fileLine]string{}
	for _, imp := range res.File.Imports {
		if o := res.File.ImportOutcomes[imp]; o.Kind == ast.ImportNotFound && o.Skipped != "" {
			hints[fileLine{imp.SourceFile, imp.Line}] = skipHint(o, imp.SourceFile, folders)
		}
	}
	if len(hints) == 0 {
		return
	}
	notFound := codeOf(resolver.ErrImportNotFound)
	for _, e := range res.ResolveErrs {
		if h, ok := hints[fileLine{e.File, e.Line}]; ok && e.Kind == resolver.ErrImportNotFound {
			e.Msg = strings.Replace(e.Msg, cli, h, 1)
		}
	}
	for i, x := range res.Diagnostics {
		if h, ok := hints[fileLine{x.File, x.Start.Line}]; ok && x.Code == notFound {
			res.Diagnostics[i].Message = strings.Replace(x.Message, cli, h, 1)
		}
	}
}

// skipHint is the editor's hint for an import in file that stopped at a
// skipped directory: open that directory as the workspace folder when that
// makes it the file's home folder and a package is there to load; move the
// package out of it when a package is there; else none.
func skipHint(o ast.ImportOutcome, file string, folders []string) string {
	skipped := pipeline.Canonicalize(o.Skipped)
	switch {
	case !o.SkippedProvides:
		return ""
	case homeFolder(append(slices.Clone(folders), skipped), filepath.FromSlash(file)) == skipped:
		return " (open " + filepath.ToSlash(skipped) + " as the workspace folder)"
	}
	return " (move the package out of " + filepath.Base(skipped) + "/ to import it here)"
}
