package ast

import "sort"

// StampInput is one parsed file for Stamp: the file, the spelling its
// definitions and diagnostics are attributed to, and — for a packaged file in
// a module — the module's path and the file's directory below the module root
// (slash-separated, "" at the root).
type StampInput struct {
	File       *File
	SourceFile string
	Module     string
	Dir        string
}

// Stamp merges parsed files into one AST and stamps every definition and
// import with its source file, its declared package and its package identity:
// a packaged file's import path when it has a module, else its declared name.
// It is the merge the pipeline runs over its kept inputs, and the seam tests
// and in-memory callers use to give sources an import path. A package's
// imports bind only by path, so a path-less package's imports are external.
func Stamp(inputs []StampInput) *File {
	merged := &File{}
	pkgs := map[string]*PackageInfo{}
	seen := map[string]bool{}
	for _, in := range inputs {
		f := in.File
		id, path := f.Package, ""
		if f.Package != "" && in.Module != "" {
			path = in.Module
			if in.Dir != "" {
				path += "/" + in.Dir
			}
			id = path
		}
		seen[id] = true
		if id != "" && pkgs[id] == nil {
			pkgs[id] = &PackageInfo{ID: id, Name: f.Package, Path: path, Module: in.Module}
		}
		for _, imp := range f.Imports {
			imp.Package, imp.PkgID, imp.SourceFile = f.Package, id, in.SourceFile
			merged.Imports = append(merged.Imports, imp)
		}
		for _, def := range f.Definitions {
			stampDef(def, in.SourceFile, f.Package, id)
			merged.Definitions = append(merged.Definitions, def)
		}
	}
	for _, info := range pkgs {
		merged.Packages = append(merged.Packages, *info)
	}
	sort.Slice(merged.Packages, func(i, j int) bool { return merged.Packages[i].ID < merged.Packages[j].ID })
	// The sole package's declared name when the run is one package (counted by
	// identity), the all-default case included.
	if len(seen) == 1 {
		for id := range seen {
			if info := pkgs[id]; info != nil {
				merged.Package = info.Name
			}
		}
	}
	return merged
}

func stampDef(def Definition, sourceFile, pkg, id string) {
	switch d := def.(type) {
	case *WorkflowDef:
		d.SourceFile, d.Package, d.PkgID = sourceFile, pkg, id
	case *ActivityDef:
		d.SourceFile, d.Package, d.PkgID = sourceFile, pkg, id
	case *WorkerDef:
		d.SourceFile, d.Package, d.PkgID = sourceFile, pkg, id
	case *NamespaceDef:
		d.SourceFile, d.Package, d.PkgID = sourceFile, pkg, id
	case *NexusServiceDef:
		d.SourceFile, d.Package, d.PkgID = sourceFile, pkg, id
	}
}
