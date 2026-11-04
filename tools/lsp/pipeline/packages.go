package pipeline

import (
	"fmt"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/resolver"
)

// parsed is one source after parsing: its AST, its parse errors, and where it
// sits among modules and packages.
type parsed struct {
	src  source
	pos  int // input position
	file *ast.File
	errs []*parser.ParseError

	// On-disk sources only (canonical != ""):
	dir     string // canonical directory
	root    string // module root, "" outside every module
	modPath string // the module's path, once its twf.mod parsed
	pkgPath string // package import path, for a packaged file in a module

	excluded bool
}

func (p *parsed) hasClause() bool { return p.file.PackagePos.Line != 0 }

// exclude applies the file-level exclusions, in order, to one run's sources
// and returns their diagnostics, PACKAGE_NAME_MISMATCH included:
//
//  0. a failed, unrecoverable or misplaced package clause (the parser's);
//  1. MODULE_FILE_INVALID — every file of that module;
//     1b. PACKAGE_OUTSIDE_MODULE — an on-disk packaged file with no twf.mod;
//  2. DUPLICATE_MODULE — a later module declaring a path already in the run;
//  3. PACKAGE_CLAUSE_CONFLICT — the losing files of a directory;
//     3b. INVALID_PACKAGE_PATH — a package whose derived path is invalid;
//  4. DUPLICATE_PACKAGE — all but the first of directories sharing a path.
//
// Virtual sources have no directory; excludeVirtual applies steps 0 and 1b.
func (x *expander) exclude(files []*parsed) []*resolver.ResolveError {
	var errs []*resolver.ResolveError
	report := func(p *parsed, kind resolver.ErrorKind, line, col int, name, msg string) {
		errs = append(errs, &resolver.ResolveError{Msg: msg, Line: line, Column: col, Kind: kind, Name: name, File: p.src.base})
	}

	// Step 0, and module discovery for the rest.
	type mod struct {
		root  string
		first *parsed // first input file
		files []*parsed
	}
	var mods []*mod
	byRoot := map[string]*mod{}
	for _, p := range files {
		if p.file.ClauseExcluded {
			p.excluded = true
		}
		if p.src.canonical == "" {
			continue
		}
		p.dir = filepath.Dir(p.src.canonical)
		p.root = x.mods.rootOf(p.dir)
		if p.root == "" {
			continue
		}
		m := byRoot[p.root]
		if m == nil {
			m = &mod{root: p.root, first: p}
			byRoot[p.root] = m
			mods = append(mods, m)
		}
		m.files = append(m.files, p)
	}

	// Step 1: a broken twf.mod is fatal to its module; a valid one's unknown
	// directives are warnings.
	modPath := map[string]string{}
	for _, m := range mods {
		f := x.mods.file(m.root)
		spelled := x.spellModFile(m.root, m.first)
		x.modFilePos[spelled] = m.first.pos
		x.moduleFirst[m.root] = m.first
		if f.err != nil {
			errs = append(errs, &resolver.ResolveError{Msg: f.err.Msg, Line: f.err.Line, Column: 1, Kind: resolver.ErrModuleFileInvalid, File: spelled})
			for _, p := range m.files {
				p.excluded = true
			}
			continue
		}
		modPath[m.root] = f.file.Path
		for _, p := range m.files {
			p.modPath = f.file.Path
		}
		for _, d := range f.file.Unknown {
			errs = append(errs, &resolver.ResolveError{
				Msg: fmt.Sprintf("unknown directive %q in twf.mod; ignored", d.Name), Line: d.Line, Column: 1,
				Severity: "warning", Kind: resolver.ErrModuleFileUnknownDirective, Name: d.Name, File: spelled,
			})
		}
	}

	// Step 1b: a packaged on-disk file needs a module.
	for _, p := range files {
		if p.excluded || p.src.canonical == "" || p.root != "" || !p.hasClause() {
			continue
		}
		errs = append(errs, outsideModule(p))
	}

	// Step 2: one module path, one root. The later module (by its first input
	// file) loses; paths compare case-insensitively. A loser names every other
	// root, by canonical path, so its message does not depend on input order.
	byModPath := map[string][]*mod{}
	var modKeys []string
	for _, m := range mods {
		mp, ok := modPath[m.root]
		if !ok || !hasKept(m.files) {
			// A module left with no files by step 0 claims no path.
			continue
		}
		key := strings.ToLower(mp)
		if byModPath[key] == nil {
			modKeys = append(modKeys, key)
		}
		byModPath[key] = append(byModPath[key], m)
	}
	for _, key := range modKeys {
		group := byModPath[key]
		byRootPath := append([]*mod(nil), group...)
		sort.Slice(byRootPath, func(i, j int) bool { return byRootPath[i].root < byRootPath[j].root })
		for _, m := range group[1:] {
			var others []string
			for _, o := range byRootPath {
				if o != m {
					others = append(others, x.spellRoot(o.root, o.first))
				}
			}
			mp, f := modPath[m.root], x.mods.file(m.root)
			errs = append(errs, &resolver.ResolveError{
				Msg:  fmt.Sprintf("module %s is also rooted at %s; this copy is ignored", mp, strings.Join(others, ", ")),
				Line: f.file.PathLine, Column: 1, Kind: resolver.ErrDuplicateModule, Name: mp, File: x.spellModFile(m.root, m.first),
			})
			delete(modPath, m.root)
			x.lostDuplicate[m.root] = true
			for _, p := range m.files {
				p.excluded = true
			}
		}
	}

	// The known modules: those holding input files and kept through step 2.
	for _, m := range mods {
		if mp, ok := modPath[m.root]; ok {
			x.known = append(x.known, knownModule{root: m.root, path: mp, first: m.first})
		}
	}

	// Package paths for what is left.
	type pkgDir struct {
		dir   string
		path  string
		files []*parsed // kept files of the directory, clause-less ones included
	}
	var dirs []*pkgDir
	byDir := map[string]*pkgDir{}
	for _, p := range files {
		if p.excluded || p.root == "" {
			continue
		}
		d := byDir[p.dir]
		if d == nil {
			d = &pkgDir{dir: p.dir, path: modPath[p.root]}
			if rel, err := filepath.Rel(p.root, p.dir); err == nil && rel != "." {
				d.path += "/" + filepath.ToSlash(rel)
			}
			byDir[p.dir] = d
			dirs = append(dirs, d)
		}
		d.files = append(d.files, p)
	}

	// Step 3: one directory, one package.
	for _, d := range dirs {
		kept := clauseOf(d.files, module.AssumedName(d.path))
		var winner *parsed
		for _, p := range d.files {
			if p.file.Package == kept && p.hasClause() == (kept != "") {
				winner = p
				break
			}
		}
		var survivors []*parsed
		for _, p := range d.files {
			if p.file.Package == kept && p.hasClause() == (kept != "") {
				survivors = append(survivors, p)
				continue
			}
			p.excluded = true
			line, col := p.file.PackagePos.Line, p.file.PackagePos.Column
			if !p.hasClause() {
				line, col = 1, 1
			}
			report(p, resolver.ErrPackageClauseConflict, line, col, p.file.Package, fmt.Sprintf(
				"directory %s holds %s (%s) and %s (%s); %s is ignored",
				spellDir(d.files[0]), describeClause(winner), path.Base(winner.src.base), describeClause(p), path.Base(p.src.base), path.Base(p.src.base)))
		}
		d.files = survivors
	}

	// Step 3b: a package's derived path must be a valid path.
	var pkgs []*pkgDir
	for _, d := range dirs {
		if kept := d.files; len(kept) == 0 || !kept[0].hasClause() {
			continue
		}
		if err := module.CheckPath(d.path); err != nil {
			for _, p := range d.files {
				p.excluded = true
				report(p, resolver.ErrInvalidPackagePath, p.file.PackagePos.Line, p.file.PackagePos.Column, p.file.Package, fmt.Sprintf(
					"package directory %s has the invalid import path %q: %v", spellDir(p), d.path, err))
			}
			continue
		}
		for _, p := range d.files {
			p.pkgPath = d.path
		}
		pkgs = append(pkgs, d)
	}

	// Step 4: one package path, one directory — the byte-wise first by
	// canonical path, whatever the input order. Paths compare
	// case-insensitively.
	byPath := map[string][]*pkgDir{}
	var paths []string
	for _, d := range pkgs {
		key := strings.ToLower(d.path)
		if byPath[key] == nil {
			paths = append(paths, key)
		}
		byPath[key] = append(byPath[key], d)
	}
	var keptPkgs []*pkgDir
	for _, key := range paths {
		group := byPath[key]
		sort.SliceStable(group, func(i, j int) bool { return group[i].dir < group[j].dir })
		keptPkgs = append(keptPkgs, group[0])
		if len(group) == 1 {
			continue
		}
		for _, d := range group {
			var others []string
			for _, o := range group {
				if o != d {
					others = append(others, spellDir(o.files[0]))
				}
			}
			for _, p := range d.files {
				report(p, resolver.ErrDuplicatePackage, p.file.PackagePos.Line, p.file.PackagePos.Column, p.file.Package, fmt.Sprintf(
					"import path %s is also the path of directory %s; only %s is used", d.path, strings.Join(others, ", "), spellDir(group[0].files[0])))
				if d != group[0] {
					p.excluded = true
				}
			}
		}
	}

	// The name rule, on the clause survivors of kept packages.
	for _, d := range keptPkgs {
		assumed := module.AssumedName(d.path)
		if !module.Usable(assumed) {
			continue
		}
		for _, p := range d.files {
			if p.file.PackageRecovered || p.file.Package == assumed {
				continue
			}
			report(p, resolver.ErrPackageNameMismatch, p.file.PackagePos.Line, p.file.PackagePos.Column, p.file.Package, fmt.Sprintf(
				"package %s must be named %s, the assumed name of its import path %s", p.file.Package, assumed, d.path))
		}
	}
	return errs
}

// excludeVirtual applies to virtual sources the exclusions that need no
// directory: step 0, and step 1b for a source in no module.
func excludeVirtual(files []*parsed) []*resolver.ResolveError {
	var errs []*resolver.ResolveError
	for _, p := range files {
		p.excluded = p.file.ClauseExcluded
		p.modPath = p.src.module
		if !p.excluded && p.modPath == "" && p.hasClause() {
			errs = append(errs, outsideModule(p))
		}
	}
	return errs
}

// outsideModule excludes a packaged file in no module and returns its
// PACKAGE_OUTSIDE_MODULE.
func outsideModule(p *parsed) *resolver.ResolveError {
	p.excluded = true
	return &resolver.ResolveError{
		Msg: fmt.Sprintf(
			"package %s is not in a module; run \"twf mod init <module path>\" in the design's root directory (with no argument it suggests one; see twf spec packages-and-imports)",
			p.file.Package),
		Line: p.file.PackagePos.Line, Column: p.file.PackagePos.Column,
		Kind: resolver.ErrPackageOutsideModule, Name: p.file.Package, File: p.src.base,
	}
}

// clauseOf picks the clause a directory keeps: the path's assumed name when
// some file declares it (a recovered keyword clause included), else the clause of the byte-wise first
// file by canonical name, a file with a clause beating a clause-less one. ""
// is the clause-less default package.
func clauseOf(files []*parsed, assumed string) string {
	for _, p := range files {
		if p.hasClause() && p.file.Package == assumed {
			return assumed
		}
	}
	byName := append([]*parsed(nil), files...)
	sort.SliceStable(byName, func(i, j int) bool { return byName[i].src.canonical < byName[j].src.canonical })
	for _, p := range byName {
		if p.hasClause() {
			return p.file.Package
		}
	}
	return ""
}

func hasKept(files []*parsed) bool {
	for _, p := range files {
		if !p.excluded {
			return true
		}
	}
	return false
}

func describeClause(p *parsed) string {
	if !p.hasClause() {
		return "a file with no package clause"
	}
	return "package " + p.file.Package
}

// spellDir spells a file's directory from the file's own spelling.
func spellDir(p *parsed) string {
	return path.Dir(p.src.base)
}

// spellRoot spells a module root from its first input file's spelling, with
// the module-relative directory removed.
func (x *expander) spellRoot(root string, first *parsed) string {
	dir := spellDir(first)
	rel, err := filepath.Rel(root, first.dir)
	if err != nil || rel == "." {
		return dir
	}
	if trimmed, ok := strings.CutSuffix(dir, "/"+filepath.ToSlash(rel)); ok {
		return trimmed
	}
	if dir == filepath.ToSlash(rel) {
		return "."
	}
	return x.spellPath(root, first)
}

// spellModFile spells a module's twf.mod: relative to the physical working
// directory when the module's first input file was spelled relative, else
// absolute (Canonical mode always is).
func (x *expander) spellModFile(root string, first *parsed) string {
	return x.spellPath(filepath.Join(root, module.FileName), first)
}

func (x *expander) spellPath(p string, first *parsed) string {
	if x.mode == Canonical || path.IsAbs(first.src.base) {
		return filepath.ToSlash(p)
	}
	if rel, err := filepath.Rel(x.physCwd, p); err == nil {
		return spell(rel)
	}
	return filepath.ToSlash(p)
}
