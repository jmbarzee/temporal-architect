package pipeline

import (
	"os"
	"path/filepath"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/module"
)

// modules discovers the module each directory belongs to and reads each
// module's `twf.mod` once. Directories are canonical paths.
type modules struct {
	tempRoot string
	roots    map[string]string // directory → its module root, "" for none
	files    map[string]*moduleFile
}

// moduleFile is one module root's `twf.mod`: parsed, or the reason it is not
// usable.
type moduleFile struct {
	root string
	file *module.File
	err  *module.Error
}

func newModules(tempRoot string) *modules {
	return &modules{tempRoot: tempRoot, roots: map[string]string{}, files: map[string]*moduleFile{}}
}

// rootOf returns the module root of directory dir: the nearest directory at or
// above it holding a `twf.mod`, or "" when there is none. The walk stops at
// the temp root, where a `twf.mod` is ignored (Go's rule for a stray `go.mod`
// there).
func (m *modules) rootOf(dir string) string {
	if root, ok := m.roots[dir]; ok {
		return root
	}
	var root string
	switch {
	case dir == m.tempRoot:
	case hasModuleFile(dir):
		root = dir
	default:
		if parent := filepath.Dir(dir); parent != dir {
			root = m.rootOf(parent)
		}
	}
	m.roots[dir] = root
	return root
}

// file returns the `twf.mod` at a module root, read and parsed once.
func (m *modules) file(root string) *moduleFile {
	if f, ok := m.files[root]; ok {
		return f
	}
	f := &moduleFile{root: root}
	data, err := os.ReadFile(filepath.Join(root, module.FileName))
	if err != nil {
		f.err = &module.Error{Msg: "cannot read twf.mod: " + err.Error(), Line: 1}
	} else {
		f.file, f.err = module.Parse(data)
	}
	m.files[root] = f
	return f
}

// hasModuleFile reports whether dir holds a `twf.mod`: an entry of exactly that
// name (on a case-insensitive disk, Stat alone would also accept `TWF.MOD`)
// that is a regular file once symlinks are followed. When dir cannot be
// listed, Stat of the exact name decides.
func hasModuleFile(dir string) bool {
	path := filepath.Join(dir, module.FileName)
	if entries, err := os.ReadDir(dir); err == nil {
		found := false
		for _, e := range entries {
			if e.Name() == module.FileName {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

// TempRoot is the canonical temp root, where a `twf.mod` is never a module
// file and `twf mod init` refuses to write one.
func TempRoot() string {
	return Canonicalize(os.TempDir())
}

// ModuleOf returns the module containing directory dir — its root and its
// `twf.mod`'s module path — or "" for both when dir is in no module. A broken
// `twf.mod` gives its root and the error that makes it unusable.
func ModuleOf(dir string) (root, path string, err error) {
	m := newModules(TempRoot())
	root = m.rootOf(Canonicalize(dir))
	if root == "" {
		return "", "", nil
	}
	f := m.file(root)
	if f.err != nil {
		return root, "", f.err
	}
	return root, f.file.Path, nil
}
