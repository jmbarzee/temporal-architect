package pipeline_test

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/ast"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// tree writes files (slash paths relative to root, content defaulting to a
// one-workflow design named after the file) and returns root.
func tree(t *testing.T, files ...string) string {
	t.Helper()
	root := t.TempDir()
	for _, f := range files {
		name := strings.TrimSuffix(filepath.Base(f), ".twf")
		name = strings.Map(func(r rune) rune {
			if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' {
				return r
			}
			return -1
		}, name)
		writeFile(t, filepath.Join(root, filepath.FromSlash(f)), "workflow W"+name+"():\n    close complete(\"ok\")\n")
	}
	return root
}

func expand(t *testing.T, paths ...string) []string {
	t.Helper()
	got, err := pipeline.ExpandInputs(paths)
	if err != nil {
		t.Fatalf("ExpandInputs(%v): %v", paths, err)
	}
	return got
}

func symlink(t *testing.T, target, link string) {
	t.Helper()
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink: %v", err)
	}
}

func TestExpandInputsSkipsLikeGo(t *testing.T) {
	root := tree(t, "a.twf", ".hidden.twf", "_draft.twf", ".claude/worktrees/x/w.twf", "_old/o.twf", "testdata/t.twf", "sub/b.twf", "sub/testdata/u.twf", "notes.md")
	t.Chdir(root)
	want := []string{"a.twf", "sub/b.twf"}
	if got := expand(t, "."); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	// An argument itself is never skipped.
	if got := expand(t, "_draft.twf", "testdata"); !reflect.DeepEqual(got, []string{"_draft.twf", "testdata/t.twf"}) {
		t.Errorf("explicit arguments skipped: %v", got)
	}
}

func TestExpandInputsWalkOrderIsPerDirectory(t *testing.T) {
	root := tree(t, "kube-old/k.twf", "kube/k.twf")
	t.Chdir(root)
	want := []string{"kube/k.twf", "kube-old/k.twf"}
	if got := expand(t, "."); !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v (a directory's files before a longer sibling name)", got, want)
	}
}

func TestExpandInputsSpelling(t *testing.T) {
	root := tree(t, "top/top.twf", "x/a.twf")
	t.Chdir(root)
	if got := expand(t, "."); !reflect.DeepEqual(got, []string{"top/top.twf", "x/a.twf"}) {
		t.Errorf(". → %v", got)
	}
	if got := expand(t, "x/"); !reflect.DeepEqual(got, []string{"x/a.twf"}) {
		t.Errorf("x/ → %v", got)
	}
	if got := expand(t, "./x//a.twf"); !reflect.DeepEqual(got, []string{"x/a.twf"}) {
		t.Errorf("./x//a.twf → %v", got)
	}
	t.Chdir(filepath.Join(root, "top"))
	if got := expand(t, "../x"); !reflect.DeepEqual(got, []string{"../x/a.twf"}) {
		t.Errorf("../x → %v", got)
	}
}

func TestExpandInputsOneFileOneInput(t *testing.T) {
	root := tree(t, "x/a.twf")
	t.Chdir(root)
	abs := filepath.Join(root, "x", "a.twf")
	if got := expand(t, "x/a.twf", abs, "x", "."); !reflect.DeepEqual(got, []string{"x/a.twf"}) {
		t.Errorf("relative, absolute and walked spellings → %v, want one input", got)
	}
}

func TestExpandInputsSymlinks(t *testing.T) {
	root := tree(t, "real/a.twf", "other/b.twf")
	symlink(t, "real", filepath.Join(root, "link"))
	symlink(t, filepath.Join(root, "other", "b.twf"), filepath.Join(root, "real", "lb.twf"))
	symlink(t, filepath.Join(root, "other"), filepath.Join(root, "real", "ldir"))
	t.Chdir(root)

	// A symlinked directory argument is walked, spelled under the argument; the
	// walk skips the symlinked file and directory inside it.
	if got := expand(t, "link"); !reflect.DeepEqual(got, []string{"link/a.twf"}) {
		t.Errorf("link → %v", got)
	}
	// One file through a symlinked directory is still one input.
	if got := expand(t, "real", "link/a.twf"); !reflect.DeepEqual(got, []string{"real/a.twf"}) {
		t.Errorf("real + link/a.twf → %v", got)
	}
	// An explicit symlinked file is followed: it is its target.
	if got := expand(t, "real/lb.twf", "other"); !reflect.DeepEqual(got, []string{"real/lb.twf"}) {
		t.Errorf("real/lb.twf + other → %v", got)
	}
	// link/../ is the target's parent, not the link's: the OS opens real/../other.
	if got := expand(t, "link/../other/b.twf"); len(got) != 1 {
		t.Errorf("link/../other/b.twf → %v", got)
	}
}

func TestExpandInputsSymlinkedWorkingDirectory(t *testing.T) {
	root := tree(t, "x/a.twf")
	logical := filepath.Join(t.TempDir(), "ws")
	symlink(t, root, logical)
	t.Chdir(logical)
	if got := expand(t, "x/a.twf", filepath.Join(root, "x", "a.twf")); len(got) != 1 {
		t.Errorf("logical and physical spellings → %v, want one input", got)
	}
}

func TestExpandInputsHardLinksInTwoDirectoriesAreTwoInputs(t *testing.T) {
	root := tree(t, "x/a.twf")
	if err := os.MkdirAll(filepath.Join(root, "y"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(filepath.Join(root, "x", "a.twf"), filepath.Join(root, "y", "a.twf")); err != nil {
		t.Skipf("link: %v", err)
	}
	t.Chdir(root)
	if got := expand(t, "."); !reflect.DeepEqual(got, []string{"x/a.twf", "y/a.twf"}) {
		t.Errorf("got %v", got)
	}
}

func TestCanonicalizeCaseAndNormalization(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("case-insensitive, normalization-insensitive disk")
	}
	root := tree(t, "Fabric/a.twf")
	nfc := filepath.Join(root, "café.twf")
	writeFile(t, nfc, calleeTWF)
	if _, err := os.Stat(filepath.Join(root, "fabric")); err != nil {
		t.Skip("disk is case-sensitive")
	}
	want := pipeline.Canonicalize(filepath.Join(root, "Fabric", "a.twf"))
	if got := pipeline.Canonicalize(filepath.Join(root, "FABRIC", "A.TWF")); got != want {
		t.Errorf("wrong case: %s, want %s", got, want)
	}
	if got, want := pipeline.Canonicalize(filepath.Join(root, "café.twf")), pipeline.Canonicalize(nfc); got != want {
		t.Errorf("NFD name: %s, want %s", got, want)
	}
	if got := pipeline.Canonicalize("/System/Volumes/Data" + want); got != want {
		if _, err := os.Stat("/System/Volumes/Data" + want); err == nil {
			t.Errorf("firmlink spelling: %s, want %s", got, want)
		}
	}
}

func TestCanonicalizeMissingFileKeepsItsTail(t *testing.T) {
	root := tree(t, "x/a.twf")
	got := pipeline.Canonicalize(filepath.Join(root, "x", "new", "b.twf"))
	want := filepath.Join(pipeline.Canonicalize(filepath.Join(root, "x")), "new", "b.twf")
	if got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestCanonicalizeMissingFileAfterSymlinkDotDot(t *testing.T) {
	root := tree(t, "other/sub/a.twf")
	symlink(t, filepath.Join(root, "other", "sub"), filepath.Join(root, "lnk"))
	t.Chdir(root)
	want := filepath.Join(pipeline.Canonicalize(filepath.Join(root, "other")), "x.twf")
	if got := pipeline.Canonicalize("lnk/../x.twf"); got != want {
		t.Errorf("got %s, want %s (.. after a symlink is physical)", got, want)
	}
}

func TestInWalk(t *testing.T) {
	root := tree(t, "a.twf", "_x/b.twf", ".claude/worktrees/w/c.twf", "sub/testdata/d.twf", "sub/e.twf")
	tests := map[string]bool{
		"a.twf":                     true,
		"sub/e.twf":                 true,
		"_x/b.twf":                  false,
		".claude/worktrees/w/c.twf": false,
		"sub/testdata/d.twf":        false,
		"new/unsaved.twf":           true,
	}
	for rel, want := range tests {
		if got := pipeline.InWalk(root, filepath.Join(root, filepath.FromSlash(rel))); got != want {
			t.Errorf("InWalk(%s) = %v, want %v", rel, got, want)
		}
	}
	if pipeline.InWalk(filepath.Join(root, "sub"), filepath.Join(root, "a.twf")) {
		t.Error("a file outside the root is not in its walk")
	}
}

func TestParseSourcesCanonicalMode(t *testing.T) {
	root := tree(t, "x/a.twf")
	res, err := pipeline.ParseSources(pipeline.Request{
		Inputs: []pipeline.Input{{Path: root, Kind: pipeline.Tree}},
		Mode:   pipeline.Canonical,
	})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.ToSlash(pipeline.Canonicalize(filepath.Join(root, "x", "a.twf")))
	if len(res.File.Definitions) != 1 {
		t.Fatalf("want one definition, got %d", len(res.File.Definitions))
	}
	if got := sourceFile(res.File.Definitions[0]); got != want {
		t.Errorf("sourceFile = %s, want %s", got, want)
	}
}

func TestParseSourcesDirIsNotRecursive(t *testing.T) {
	root := tree(t, "a.twf", "_b.twf", "sub/c.twf")
	res, err := pipeline.ParseSources(pipeline.Request{Inputs: []pipeline.Input{{Path: root, Kind: pipeline.Dir}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.File.Definitions) != 1 {
		t.Errorf("a Dir input reads only its own non-skipped files; got %d definitions", len(res.File.Definitions))
	}
}

func sourceFile(def ast.Definition) string {
	if wf, ok := def.(*ast.WorkflowDef); ok {
		return wf.SourceFile
	}
	return ""
}
