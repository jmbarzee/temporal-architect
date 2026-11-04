package pipeline

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/validator"
)

// ImplFile is the file an `@sdk` path in the .twf file at twfPath names: the
// path read from the file's module root, else from its directory.
func ImplFile(twfPath, impl string) string {
	dir := filepath.Dir(Canonicalize(twfPath))
	if root, _, _ := ModuleOf(dir); root != "" {
		dir = root
	}
	return filepath.Join(dir, filepath.FromSlash(impl))
}

// IsFile reports whether path names a file, not a directory.
func IsFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// implNotFound reports each worker `@sdk` path that names no file on disk.
// A source with no file has no base to read the path from and is skipped.
func implNotFound(files []*parsed) []*validator.Error {
	var errs []*validator.Error
	for _, p := range files {
		if p.excluded || p.src.canonical == "" {
			continue
		}
		base := p.root
		if base == "" {
			base = p.dir
		}
		for _, def := range p.file.Definitions {
			w, ok := def.(*ast.WorkerDef)
			if !ok {
				continue
			}
			for _, s := range w.SDKs {
				if s.Impl == "" {
					continue
				}
				if IsFile(filepath.Join(base, filepath.FromSlash(s.Impl))) {
					continue
				}
				errs = append(errs, &validator.Error{
					Msg:      fmt.Sprintf("@sdk(%s) path %q names no file; it is read from the module root (the directory of twf.mod), else from this file's directory", s.SDK, s.Impl),
					Line:     s.ImplPos.Line,
					Column:   s.ImplPos.Column,
					Severity: "warning",
					Kind:     validator.ErrImplNotFound,
					Name:     w.Name,
					File:     p.src.base,
				})
			}
		}
	}
	return errs
}
