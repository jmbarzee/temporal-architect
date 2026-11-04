// Package modinit creates a module's twf.mod and suggests a module path for
// it: the shared core of `twf mod init` and the editor's create-twf.mod code
// action.
package modinit

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/parser"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// Source is a place a suggested module path comes from, in the order they are
// tried.
type Source int

const (
	// Enclosing is the enclosing module's path plus the directory below it.
	Enclosing Source = iota
	// Imports derives the path from the design's own import lines.
	Imports
	// Git is the `origin` remote's host and path.
	Git
	// Placeholder is example.com/<directory name>.
	Placeholder
)

// AllSources is every source, as `twf mod init` uses them; the editor offers
// only Imports and Git.
var AllSources = []Source{Enclosing, Imports, Git, Placeholder}

// Create writes `module <path>` to dir/twf.mod after checking, in order, that
// dir holds no twf.mod in any letter case, that dir is not the temp root, and
// that path is a valid module path. It never overwrites (O_EXCL). The error
// text follows `go mod init`'s.
func Create(dir, path string) error {
	dir = pipeline.Canonicalize(dir)
	if existing := moduleFileIn(dir); existing != "" {
		return fmt.Errorf("%s already exists", existing)
	}
	if dir == pipeline.TempRoot() {
		return fmt.Errorf("cannot create a module in the temp directory %s (a twf.mod there is ignored)", dir)
	}
	if module.IsLocal(path) || filepath.IsAbs(path) {
		msg := fmt.Sprintf("malformed module path %q: is a local import path", path)
		if ex := Example(dir); ex != "" {
			msg += fmt.Sprintf("; use a module path such as %q", ex)
		}
		return errors.New(msg)
	}
	if err := module.CheckPath(path); err != nil {
		return fmt.Errorf("malformed module path %q: %v", path, err)
	}
	f, err := os.OpenFile(filepath.Join(dir, module.FileName), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(f, "module %s\n", path)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

// EnclosingModuleFile returns the twf.mod of the module that a module at dir
// nests inside, or "".
func EnclosingModuleFile(dir string) string {
	d := scanDesign(pipeline.Canonicalize(dir))
	if d.enclosingRoot == "" {
		return ""
	}
	return filepath.Join(d.enclosingRoot, module.FileName)
}

// Suggest returns the module paths to suggest for a module rooted at dir, from
// the first of the given sources that yields a candidate passing the check —
// a candidate is skipped if it would give a package file of the design a
// PACKAGE_NAME_MISMATCH, or a package with a usable declared name an unusable
// assumed name. Only Imports can yield several.
func Suggest(dir string, sources []Source) []string {
	d := scanDesign(pipeline.Canonicalize(dir))
	for _, src := range sources {
		var cands []string
		switch src {
		case Enclosing:
			if d.enclosingPath != "" {
				cands = d.fitting(d.enclosingPath + relSuffix(d.enclosingRoot, d.root))
			}
		case Imports:
			cands = d.fromImports()
		case Git:
			if c, ok := gitCandidate(d.root); ok {
				cands = d.fitting(c)
			}
		case Placeholder:
			if c := placeholder(d.root); c != "" {
				cands = d.fitting(c)
			}
		}
		if len(cands) > 0 {
			return cands
		}
	}
	return nil
}

// Example is the path a local-path error suggests: the suggestion, else a
// placeholder, else none.
func Example(dir string) string {
	if cands := Suggest(dir, AllSources); len(cands) > 0 {
		return cands[0]
	}
	return placeholder(pipeline.Canonicalize(dir))
}

// InRepositoryOrAlone reports whether dir is inside a Git repository or holds
// no `.git` anywhere below it — so a folder above several repositories gets
// no editor suggestion.
func InRepositoryOrAlone(dir string) bool {
	if _, _, err := findGitConfig(dir); err == nil {
		return true
	}
	found := false
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil || found {
			return filepath.SkipDir
		}
		if d.Name() == ".git" {
			found = true
			return filepath.SkipAll
		}
		return nil
	})
	return !found
}

// moduleFileIn returns the name of an entry of dir that equals "twf.mod" in any
// letter case, or "": writing would clobber `TWF.MOD` on a case-insensitive
// disk although discovery would not read it.
func moduleFileIn(dir string) string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if _, err := os.Stat(filepath.Join(dir, module.FileName)); err == nil {
			return module.FileName
		}
		return ""
	}
	for _, e := range entries {
		if strings.EqualFold(e.Name(), module.FileName) {
			return e.Name()
		}
	}
	return ""
}

// design is what the suggestion rule reads under the would-be module root.
type design struct {
	root string
	// enclosingRoot and enclosingPath name the module above root, if any; a
	// broken enclosing twf.mod leaves enclosingPath empty.
	enclosingRoot, enclosingPath string
	// pkgDirs maps a slash path below root (outside nested modules) holding a
	// package file to its files' declared names: "" for the root itself.
	pkgDirs map[string][]clause
	imports []string
}

// clause is one package file's declared name and whether it was recovered from
// a failed clause (exempt from the name rule).
type clause struct {
	name      string
	recovered bool
}

func scanDesign(root string) design {
	d := design{root: root, pkgDirs: map[string][]clause{}}
	if parent := filepath.Dir(root); parent != root {
		if r, p, err := pipeline.ModuleOf(parent); r != "" {
			d.enclosingRoot = r
			if err == nil {
				d.enclosingPath = p
			}
		}
	}
	files, err := pipeline.ExpandInputs([]string{root})
	if err != nil {
		return d
	}
	for _, f := range files {
		dir := filepath.Dir(f)
		if r, _, _ := pipeline.ModuleOf(dir); r != "" && r != d.enclosingRoot {
			continue // a nested module's file
		}
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		file, _ := parser.ParseFileAll(string(data))
		for _, imp := range file.Imports {
			d.imports = append(d.imports, imp.Path)
		}
		if file.PackagePos.Line == 0 || file.ClauseExcluded {
			continue
		}
		rel, err := filepath.Rel(root, pipeline.Canonicalize(dir))
		if err != nil {
			continue
		}
		rel = filepath.ToSlash(rel)
		if rel == "." {
			rel = ""
		}
		d.pkgDirs[rel] = append(d.pkgDirs[rel], clause{file.Package, file.PackageRecovered})
	}
	return d
}

// fromImports derives candidates from the design's own imports: for an import
// path P and the longest package directory R below the root whose path is a
// `/`-boundary suffix of P, the candidate is P minus `/R`. Distinct surviving
// candidates are all returned.
func (d design) fromImports() []string {
	var out []string
	seen := map[string]bool{}
	for _, p := range d.imports {
		if module.CheckPath(p) != nil {
			continue
		}
		best := ""
		for rel := range d.pkgDirs {
			if rel != "" && strings.HasSuffix(p, "/"+rel) && len(rel) > len(best) {
				best = rel
			}
		}
		if best == "" {
			continue
		}
		c := strings.TrimSuffix(p, "/"+best)
		if c == "" || module.CheckPath(c) != nil || !d.fits(c) || seen[c] {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	return out
}

// fitting is [c] when c passes the check, else nothing.
func (d design) fitting(c string) []string {
	if d.fits(c) {
		return []string{c}
	}
	return nil
}

// fits reports whether module path c would leave every package file of the
// design free of PACKAGE_NAME_MISMATCH, and give no package with a usable
// declared name a path whose assumed name is unusable.
func (d design) fits(c string) bool {
	for rel, clauses := range d.pkgDirs {
		pkgPath := c
		if rel != "" {
			pkgPath += "/" + rel
		}
		assumed := module.AssumedName(pkgPath)
		for _, cl := range clauses {
			switch {
			case cl.recovered:
			case module.Usable(assumed) && cl.name != assumed:
				return false
			case module.Usable(cl.name) && !module.Usable(assumed):
				return false
			}
		}
	}
	return true
}

func placeholder(root string) string {
	c := "example.com/" + filepath.Base(root)
	if module.CheckPath(c) != nil {
		return ""
	}
	return c
}

// relSuffix is "/" + dir's slash path below root, or "" at the root.
func relSuffix(root, dir string) string {
	rel, err := filepath.Rel(root, dir)
	if err != nil || rel == "." {
		return ""
	}
	return "/" + filepath.ToSlash(rel)
}

// gitCandidate reads the `origin` remote of the repository holding dir and
// returns its host and path plus dir's path below the worktree root.
func gitCandidate(dir string) (string, bool) {
	worktree, config, err := findGitConfig(dir)
	if err != nil {
		return "", false
	}
	url, ok := originURL(config)
	if !ok {
		return "", false
	}
	base, ok := module.RemotePath(url)
	if !ok {
		return "", false
	}
	c := base + relSuffix(worktree, dir)
	return c, module.CheckPath(c) == nil
}

// findGitConfig walks up from dir to the first `.git` entry and returns the
// worktree root and the text of the repository's config. A `.git` file is
// followed through its `gitdir:` and, for a linked worktree, `commondir`.
func findGitConfig(dir string) (string, string, error) {
	for d := dir; ; {
		dotgit := filepath.Join(d, ".git")
		if info, err := os.Stat(dotgit); err == nil {
			gitDir := dotgit
			if !info.IsDir() {
				data, err := os.ReadFile(dotgit)
				if err != nil {
					return "", "", err
				}
				target, ok := strings.CutPrefix(strings.TrimSpace(string(data)), "gitdir:")
				if !ok {
					return "", "", errors.New("malformed .git file")
				}
				gitDir = strings.TrimSpace(target)
				if !filepath.IsAbs(gitDir) {
					gitDir = filepath.Join(d, gitDir)
				}
				if common, err := os.ReadFile(filepath.Join(gitDir, "commondir")); err == nil {
					c := strings.TrimSpace(string(common))
					if !filepath.IsAbs(c) {
						c = filepath.Join(gitDir, c)
					}
					gitDir = c
				}
			}
			config, err := os.ReadFile(filepath.Join(gitDir, "config"))
			if err != nil {
				return "", "", err
			}
			return d, string(config), nil
		}
		parent := filepath.Dir(d)
		if parent == d {
			return "", "", errors.New("not in a Git repository")
		}
		d = parent
	}
}

// originURL returns `remote.origin.url` from a Git config's text. Includes and
// `insteadOf` are not applied.
func originURL(config string) (string, bool) {
	inOrigin := false
	for _, raw := range strings.Split(config, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || line[0] == '#' || line[0] == ';' {
			continue
		}
		if strings.HasPrefix(line, "[") {
			section := strings.Trim(line, "[]")
			name, sub, _ := strings.Cut(section, " ")
			inOrigin = strings.EqualFold(name, "remote") && strings.Trim(strings.TrimSpace(sub), `"`) == "origin"
			continue
		}
		if !inOrigin {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if ok && strings.EqualFold(strings.TrimSpace(key), "url") {
			return strings.Trim(strings.TrimSpace(value), `"`), true
		}
	}
	return "", false
}
