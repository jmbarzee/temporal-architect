package pipeline

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// inputFile is one file a ParseSources request expands to.
type inputFile struct {
	// spelled is how diagnostics and sourceFile name the file (D9).
	spelled string
	// canonical is the file's identity: its physical path in on-disk spelling.
	canonical string
	// path is what to open, when the file is read from disk.
	path string
}

// expander expands one request's inputs. It canonicalizes each path once.
type expander struct {
	mode     Mode
	physCwd  string
	overlays map[string]string // keyed by canonical path
	canon    map[string]string // path as typed → canonical
	listings map[string][]string
	seen     map[string]bool
	out      []inputFile

	mods *modules
	// modFilePos is the input position of each module's first file, keyed by
	// the twf.mod's spelling, for diagnostic order.
	modFilePos map[string]int
}

func newExpander(mode Mode, overlays map[string]string) (*expander, error) {
	e := &expander{
		mode:     mode,
		overlays: map[string]string{},
		canon:    map[string]string{},
		listings: map[string][]string{},
		seen:     map[string]bool{},
	}
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("working directory: %w", err)
	}
	e.physCwd = e.canonical(cwd)
	e.mods = newModules(e.canonical(os.TempDir()))
	e.modFilePos = map[string]int{}
	for p, text := range overlays {
		e.overlays[e.canonical(p)] = text
	}
	return e, nil
}

// expand turns the request's inputs into the files to parse, in input order,
// each at most once.
func (e *expander) expand(inputs []Input) ([]inputFile, error) {
	for _, in := range inputs {
		if err := e.expandOne(in); err != nil {
			return nil, err
		}
	}
	return e.out, nil
}

func (e *expander) expandOne(in Input) error {
	canon := e.canonical(in.Path)
	info, err := os.Stat(in.Path)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) || !e.overlaid(in.Kind, canon) {
			return fmt.Errorf("stat %s: %w", in.Path, err)
		}
		info = nil
	}
	switch {
	case info != nil && in.Kind == File && info.IsDir():
		return fmt.Errorf("%s is a directory, not a file", in.Path)
	case info != nil && in.Kind != File && !info.IsDir():
		return fmt.Errorf("%s is not a directory", in.Path)
	}

	switch in.Kind {
	case File:
		e.add(spell(in.Path), canon, in.Path)
	case Tree:
		e.walk(in.Path, canon, true)
	case Dir:
		e.walk(in.Path, canon, false)
	}
	return nil
}

// overlaid reports whether a missing input still contributes overlays: a File
// that is itself overlaid, or a Tree or Dir with an overlaid file below it.
func (e *expander) overlaid(kind InputKind, canon string) bool {
	if kind == File {
		_, ok := e.overlays[canon]
		return ok
	}
	for p := range e.overlays {
		if strings.HasPrefix(p, canon+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

// walk adds the `.twf` files of the directory whose argument spelling is
// spelledDir and whose canonical path is canonDir: recursively for a Tree,
// directly inside it for a Dir. A walk follows Go's rules: entries named `.*`
// or `_*`, directories named `testdata`, and symlinks are skipped (a symlinked
// `.twf` file would take its target's directory). Entries are visited in
// lexical order, and overlaid files not on disk join at their position.
func (e *expander) walk(spelledDir, canonDir string, recursive bool) {
	for _, ent := range e.entries(canonDir) {
		name := ent.name
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
			continue
		}
		canon := filepath.Join(canonDir, name)
		spelled := spelledDir + "/" + name
		switch {
		case !ent.onDisk:
			// An overlay, or a directory holding one.
			if _, ok := e.overlays[canon]; ok {
				if strings.HasSuffix(name, ".twf") {
					e.add(spell(spelled), canon, "")
				}
			} else if recursive && name != "testdata" {
				e.walk(spelled, canon, true)
			}
		case ent.mode&fs.ModeSymlink != 0:
		case ent.mode.IsDir():
			if recursive && name != "testdata" {
				e.walk(spelled, canon, true)
			}
		case strings.HasSuffix(name, ".twf"):
			e.add(spell(spelled), canon, canon)
		}
	}
}

// entry is one name a directory lists: on disk with its type, or only the
// first path element of an overlay below it.
type entry struct {
	name   string
	onDisk bool
	mode   fs.FileMode
}

// entries lists a directory's names in lexical order: what is on disk plus the
// first path element of every overlay below it.
func (e *expander) entries(canonDir string) []entry {
	byName := map[string]entry{}
	if dirents, err := os.ReadDir(canonDir); err == nil {
		for _, d := range dirents {
			byName[d.Name()] = entry{name: d.Name(), onDisk: true, mode: d.Type()}
		}
	}
	prefix := canonDir + string(filepath.Separator)
	for p := range e.overlays {
		if rest, ok := strings.CutPrefix(p, prefix); ok {
			first, _, _ := strings.Cut(rest, string(filepath.Separator))
			if _, ok := byName[first]; !ok {
				byName[first] = entry{name: first}
			}
		}
	}
	out := make([]entry, 0, len(byName))
	for _, ent := range byName {
		out = append(out, ent)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out
}

func (e *expander) add(spelled, canon, path string) {
	if e.seen[canon] {
		return
	}
	e.seen[canon] = true
	if e.mode == Canonical {
		spelled = filepath.ToSlash(canon)
	}
	e.out = append(e.out, inputFile{spelled: spelled, canonical: canon, path: path})
}

// content returns a file's overlay text, else its text on disk.
func (e *expander) content(f inputFile) (string, error) {
	if text, ok := e.overlays[f.canonical]; ok {
		return text, nil
	}
	data, err := os.ReadFile(f.path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", f.spelled, err)
	}
	return string(data), nil
}

// canonical returns p's identity: its physical absolute path, with symlinks
// (and `..` after them) resolved, each element in its on-disk spelling (case
// and Unicode normalization), and macOS firmlink spellings removed. A path not
// on disk canonicalizes its nearest existing ancestor and keeps the rest.
func (e *expander) canonical(p string) string {
	if c, ok := e.canon[p]; ok {
		return c
	}
	abs := p
	if !filepath.IsAbs(abs) {
		if e.physCwd != "" && !(runtime.GOOS == "windows" && (strings.HasPrefix(p, `\`) || filepath.VolumeName(p) != "")) {
			// Concatenate, not Join: Join would clean `..` before symlinks resolve.
			abs = e.physCwd + string(filepath.Separator) + p
		} else if a, err := filepath.Abs(p); err == nil {
			abs = a
		}
	}

	// The longest prefix that exists, resolved physically; elements are split
	// by hand, since Dir would clean `..` before a symlink before it resolves.
	vol := filepath.VolumeName(abs)
	elems := strings.Split(abs[len(vol):], string(filepath.Separator))
	resolved, rest := filepath.Clean(abs), []string(nil)
	for k := len(elems); k > 0; k-- {
		prefix := vol + strings.Join(elems[:k], string(filepath.Separator))
		if prefix == vol {
			prefix += string(filepath.Separator)
		}
		if r, err := filepath.EvalSymlinks(prefix); err == nil {
			resolved, rest = r, elems[k:]
			break
		}
	}

	c := e.onDiskSpelling(stripFirmlink(resolved))
	if len(rest) > 0 {
		c = filepath.Join(append([]string{c}, rest...)...)
	}
	e.canon[p] = c
	return c
}

// onDiskSpelling rewrites each element of an existing physical path to the
// name its directory lists for it, preferring the typed name, then a
// case-insensitively equal one, then the lexically first (hard links can give
// several). An element whose directory cannot be read is kept as typed.
func (e *expander) onDiskSpelling(p string) string {
	vol := filepath.VolumeName(p)
	elems := strings.Split(strings.TrimPrefix(p[len(vol):], string(filepath.Separator)), string(filepath.Separator))
	dir := vol + string(filepath.Separator)
	for _, name := range elems {
		if name == "" {
			continue
		}
		dir = filepath.Join(dir, e.listedName(dir, name))
	}
	return dir
}

func (e *expander) listedName(dir, name string) string {
	names, ok := e.listings[dir]
	if !ok {
		if dirents, err := os.ReadDir(dir); err == nil {
			for _, d := range dirents {
				names = append(names, d.Name())
			}
		}
		e.listings[dir] = names
	}
	for _, n := range names {
		if n == name {
			return n
		}
	}
	target, err := os.Lstat(filepath.Join(dir, name))
	if err != nil {
		return name
	}
	var folded, first string
	for _, n := range names {
		info, err := os.Lstat(filepath.Join(dir, n))
		if err != nil || !os.SameFile(info, target) {
			continue
		}
		if folded == "" && strings.EqualFold(n, name) {
			folded = n
		}
		if first == "" {
			first = n
		}
	}
	switch {
	case folded != "":
		return folded
	case first != "":
		return first
	}
	return name
}

// stripFirmlink removes macOS's `/System/Volumes/Data` prefix when the shorter
// path names the same directory.
func stripFirmlink(p string) string {
	const data = "/System/Volumes/Data"
	if runtime.GOOS != "darwin" || !strings.HasPrefix(p, data+"/") {
		return p
	}
	short := strings.TrimPrefix(p, data)
	a, errA := os.Stat(p)
	b, errB := os.Stat(short)
	if errA == nil && errB == nil && os.SameFile(a, b) {
		return short
	}
	return p
}

// spell is D9's spelling of a path as given: slash-separated, a leading `./`
// removed, `//` collapsed (a leading UNC `//host` kept), `.` elements dropped,
// `..` kept; an empty result is `.`.
func spell(p string) string {
	s := filepath.ToSlash(p)
	unc := strings.HasPrefix(s, "//") && !strings.HasPrefix(s, "///")
	if unc {
		s = s[2:]
	}
	abs := strings.HasPrefix(s, "/")
	var kept []string
	for _, el := range strings.Split(s, "/") {
		if el == "" || el == "." {
			continue
		}
		kept = append(kept, el)
	}
	out := strings.Join(kept, "/")
	switch {
	case unc:
		return "//" + out
	case abs:
		return "/" + out
	case out == "":
		return "."
	}
	return out
}

// Canonicalize returns path's identity as ParseSources computes it: the
// physical absolute path in on-disk spelling, which is also how Canonical mode
// spells the file. An editor compares buffers against it.
func Canonicalize(path string) string {
	e, err := newExpander(Canonical, nil)
	if err != nil {
		return filepath.Clean(path)
	}
	return e.canonical(path)
}

// InWalk reports whether a Tree walk of root reaches the `.twf` file at path,
// under ParseSources' skip rules. Both are canonicalized first.
func InWalk(root, path string) bool {
	e, err := newExpander(Canonical, nil)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(e.canonical(root), e.canonical(path))
	if err != nil || rel == "." || !strings.HasSuffix(rel, ".twf") {
		return false
	}
	elems := strings.Split(rel, string(filepath.Separator))
	for i, el := range elems {
		if el == ".." || strings.HasPrefix(el, ".") || strings.HasPrefix(el, "_") || (i < len(elems)-1 && el == "testdata") {
			return false
		}
	}
	return true
}
