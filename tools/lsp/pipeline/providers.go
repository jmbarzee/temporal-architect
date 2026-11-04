package pipeline

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/lexer"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/token"
)

// knownModule is a module holding input files that survived the exclusions.
type knownModule struct {
	root, path string
	first      *parsed
}

// lookupImports runs the provider lookup (spec 15) for every kept import
// whose path no kept package has. kept maps a kept package's path to itself.
func (x *expander) lookupImports(files []*parsed, kept map[string]bool) map[*ast.ImportDecl]ast.ImportOutcome {
	// Pre-check: an excluded input whose directory's derived path is P, and
	// that has a package clause or was excluded at step 0, sinks P. Its causes
	// are the file and, when its module lost DUPLICATE_MODULE, that twf.mod.
	excludedAt := map[string][]string{}
	for _, p := range files {
		if !p.excluded || p.root == "" || (!p.hasClause() && !p.file.ClauseExcluded) {
			continue
		}
		f := x.mods.file(p.root)
		if f.err != nil {
			continue
		}
		dp := f.file.Path
		if rel, err := filepath.Rel(p.root, p.dir); err == nil && rel != "." {
			dp += "/" + filepath.ToSlash(rel)
		}
		excludedAt[dp] = append(excludedAt[dp], p.src.base)
		if x.lostDuplicate[p.root] {
			excludedAt[dp] = append(excludedAt[dp], x.spellModFile(p.root, x.moduleFirst[p.root]))
		}
	}
	inputs := map[string]*parsed{}
	for _, p := range files {
		if p.src.canonical != "" {
			inputs[p.src.canonical] = p
		}
	}

	known := append([]knownModule(nil), x.known...)
	sort.SliceStable(known, func(i, j int) bool { return len(known[i].path) > len(known[j].path) })

	out := map[*ast.ImportDecl]ast.ImportOutcome{}
	for _, p := range files {
		if p.excluded {
			continue
		}
		for _, imp := range p.file.Imports {
			if kept[imp.Path] || module.CheckPath(imp.Path) != nil {
				continue
			}
			if o, ok := x.lookup(imp.Path, known, excludedAt, inputs, kept); ok {
				out[imp] = o
			}
		}
	}
	return out
}

// lookup finds P's provider: under each known module P lies under, longest
// first, it walks P's remaining elements from the module root. ok is false
// when P lies under no known module at all.
func (x *expander) lookup(p string, known []knownModule, excludedAt map[string][]string, inputs map[string]*parsed, kept map[string]bool) (ast.ImportOutcome, bool) {
	if causes := excludedAt[p]; causes != nil {
		return ast.ImportOutcome{Kind: ast.ImportSink, Causes: causes}, true
	}
	var firstReason string
	var first ast.ImportOutcome // the skip of the first reason, if any
	for _, m := range known {
		if !under(p, m.path) {
			continue
		}
		o, reason := x.walkProvider(p, m, inputs)
		if o.Kind != 0 {
			return o, true
		}
		if firstReason == "" {
			firstReason, first = reason, o
		}
	}
	if firstReason == "" {
		for _, m := range known {
			if under(strings.ToLower(p), strings.ToLower(m.path)) {
				firstReason = fmt.Sprintf("module %s (at %s): module path differs in case", m.path, x.spellRoot(m.root, m.first))
				break
			}
		}
	}
	if firstReason == "" {
		return ast.ImportOutcome{}, false
	}
	for k := range kept {
		if strings.EqualFold(k, p) {
			firstReason += fmt.Sprintf("; did you mean %q?", k)
			break
		}
	}
	first.Kind, first.Detail = ast.ImportNotFound, firstReason
	return first, true
}

// walkProvider follows P's elements below m's root by exact directory names. It
// returns an outcome when it reaches a provider or a sink, else the reason it
// found none (with the skipped directory, when it stopped at one).
func (x *expander) walkProvider(p string, m knownModule, inputs map[string]*parsed) (ast.ImportOutcome, string) {
	dir, modPath := m.root, m.path
	at := x.spellRoot(m.root, m.first)
	noPackage := func() string {
		return fmt.Sprintf("module %s (at %s) has no package %s", m.path, at, strings.TrimPrefix(strings.TrimPrefix(p, m.path), "/"))
	}
	rest := strings.TrimPrefix(strings.TrimPrefix(p, modPath), "/")
	var walked []string // elements walked below modPath
	for rest != "" {
		el, more, _ := strings.Cut(rest, "/")
		rest = more
		walked = append(walked, el)
		if skipped(el) {
			s := filepath.Join(dir, el)
			return ast.ImportOutcome{Skipped: s, SkippedProvides: providesBelow(s, rest)}, fmt.Sprintf("%s: the walk skips %s/ (pass it explicitly)", noPackage(), el)
		}
		next := filepath.Join(dir, el)
		info, err := os.Lstat(next)
		switch {
		case err != nil || !hasEntry(dir, el):
			return ast.ImportOutcome{}, noPackage()
		case info.Mode()&os.ModeSymlink != 0:
			return ast.ImportOutcome{}, fmt.Sprintf("%s: %s is a symlinked directory (not followed)", noPackage(), el)
		case !info.IsDir():
			return ast.ImportOutcome{}, noPackage()
		}
		dir = next
		consumed := modPath + "/" + strings.Join(walked, "/")
		if dir == x.mods.tempRoot || !hasModuleFile(dir) {
			continue
		}
		f := x.mods.file(dir)
		switch {
		case f.err != nil:
			if first := x.moduleFirst[dir]; first != nil {
				return ast.ImportOutcome{Kind: ast.ImportSink, Causes: []string{x.spellModFile(dir, first)}}, ""
			}
			return ast.ImportOutcome{}, fmt.Sprintf("%s: %s is broken", noPackage(), x.spellPath(filepath.Join(dir, module.FileName), m.first))
		case x.lostDuplicate[dir]:
			return ast.ImportOutcome{Kind: ast.ImportSink, Causes: []string{x.spellModFile(dir, x.moduleFirst[dir])}}, ""
		case !under(p, f.file.Path) || !under(f.file.Path, consumed):
			rel, _ := filepath.Rel(m.root, dir)
			return ast.ImportOutcome{}, fmt.Sprintf("%s: the nested module at %s declares %s, which does not provide it (or pass the module that provides it)", noPackage(), filepath.ToSlash(rel), f.file.Path)
		}
		// Re-root at the nested module.
		modPath = f.file.Path
		rest = strings.TrimPrefix(strings.TrimPrefix(p, modPath), "/")
		walked = nil
	}

	var pkgFiles, inInputs, kept int
	var causes []string
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") || !strings.HasSuffix(name, ".twf") || e.Type()&os.ModeSymlink != 0 || e.IsDir() {
			continue
		}
		file := filepath.Join(dir, name)
		if !firstTokenIsPackage(file) {
			continue
		}
		pkgFiles++
		if in := inputs[file]; in != nil {
			inInputs++
			if !in.excluded {
				kept++
			} else {
				causes = append(causes, in.src.base)
			}
		}
	}
	switch {
	case pkgFiles == 0:
		return ast.ImportOutcome{}, fmt.Sprintf("%s: the directory holds no package", noPackage())
	case inInputs > 0 && kept == 0:
		return ast.ImportOutcome{Kind: ast.ImportSink, Causes: causes}, ""
	case inInputs == 0:
		rel, _ := filepath.Rel(m.root, dir)
		return ast.ImportOutcome{Kind: ast.ImportNotLoaded, Detail: fmt.Sprintf("pass its package directory %s (module %s)", path.Join(at, filepath.ToSlash(rel)), modPath)}, ""
	}
	return ast.ImportOutcome{}, noPackage()
}

// skipped reports whether a walk skips a directory named el.
func skipped(el string) bool {
	return strings.HasPrefix(el, ".") || strings.HasPrefix(el, "_") || el == "testdata"
}

// providesBelow reports whether a walk of dir would reach, by the elements
// rest, a directory that provides a package: no element skipped, symlinked or
// holding a twf.mod on the way.
func providesBelow(dir, rest string) bool {
	for _, el := range strings.Split(rest, "/") {
		if el == "" {
			continue
		}
		next := filepath.Join(dir, el)
		info, err := os.Lstat(next)
		if skipped(el) || err != nil || !info.IsDir() || !hasEntry(dir, el) || hasModuleFile(next) {
			return false
		}
		dir = next
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		name := e.Name()
		if !skipped(name) && strings.HasSuffix(name, ".twf") && e.Type().IsRegular() && firstTokenIsPackage(filepath.Join(dir, name)) {
			return true
		}
	}
	return false
}

// under reports whether path p lies under module path m: equal, or m plus
// `/` and more.
func under(p, m string) bool {
	return p == m || strings.HasPrefix(p, m+"/")
}

// hasEntry reports whether dir lists an entry named exactly name, so a
// case-insensitive disk does not match another spelling.
func hasEntry(dir, name string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.Name() == name {
			return true
		}
	}
	return false
}

// firstTokenIsPackage reports whether a file's first token other than
// comments, newlines and indentation is `package`.
func firstTokenIsPackage(file string) bool {
	data, err := os.ReadFile(file)
	if err != nil {
		return false
	}
	l := lexer.New(strings.TrimPrefix(string(data), "\ufeff"))
	for {
		switch t := l.NextToken(); t.Type {
		case token.COMMENT, token.NEWLINE, token.INDENT, token.DEDENT:
		case token.PACKAGE:
			return true
		default:
			return false
		}
	}
}
