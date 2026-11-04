package pipeline_test

import (
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// layout writes files (slash paths → content) under a fresh directory and
// returns it.
func layout(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, content := range files {
		writeFile(t, filepath.Join(root, filepath.FromSlash(rel)), content)
	}
	return root
}

func wf(pkg, name string) string {
	clause := ""
	if pkg != "" {
		clause = "package " + pkg + "\n\n"
	}
	return clause + "workflow " + name + "():\n    close complete(\"ok\")\n"
}

// check runs `twf check .` in root and returns "file:line:col CODE: message"
// per resolve diagnostic, and the merged definitions' names.
func check(t *testing.T, root string) ([]string, []string) {
	t.Helper()
	t.Chdir(root)
	return checkArgs(t, ".")
}

// runCheck is check over the given arguments in the current directory,
// returning the diagnostics only.
func runCheck(t *testing.T, args ...string) []string {
	t.Helper()
	diags, _ := checkArgs(t, args...)
	return diags
}

func checkArgs(t *testing.T, args ...string) ([]string, []string) {
	t.Helper()
	file, diags, err := pipeline.ParseFiles(args)
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}
	var out []string
	for _, d := range diags {
		if d.Kind == "resolve" || d.Kind == "parse" {
			out = append(out, strings.Join([]string{d.File, strconv.Itoa(d.Start.Line), strconv.Itoa(d.Start.Column)}, ":")+" "+d.Code+": "+d.Message)
		}
	}
	var names []string
	for _, def := range file.Definitions {
		if f := sourceFile(def); f != "" {
			names = append(names, f)
		}
	}
	sort.Strings(names)
	return out, names
}

func TestPackageOutsideModule(t *testing.T) {
	root := layout(t, map[string]string{
		"fabric/v1/f.twf": wf("fabric", "Setup"),
		"flat.twf":        wf("", "Flat"),
	})
	diags, defs := check(t, root)
	want := `fabric/v1/f.twf:1:1 PACKAGE_OUTSIDE_MODULE: package fabric is not in a module; run "twf mod init <module path>" in the design's root directory (with no argument it suggests one; see twf spec packages-and-imports)`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q]", diags, want)
	}
	if strings.Join(defs, ",") != "flat.twf" {
		t.Errorf("kept definitions from %v, want only the clause-less flat.twf", defs)
	}
}

func TestModuleFileInvalidIsFatalToItsModule(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod":         "modul example.com/demo\n",
		"fabric/v1/f.twf": "package fabric\n\nworkflow W():\n    activity Ghost()\n",
	})
	diags, defs := check(t, root)
	want := `twf.mod:1:1 MODULE_FILE_INVALID: unknown directive "modul"; expected "module <path>"`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q] (one error, no cascade)", diags, want)
	}
	if len(defs) != 0 {
		t.Errorf("the broken module's files must be excluded, got %v", defs)
	}
}

func TestModuleFileUnknownDirectiveWarns(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod":         "module example.com/demo\ntwf 1.0\n",
		"fabric/v1/f.twf": wf("fabric", "Setup"),
	})
	diags, defs := check(t, root)
	want := `twf.mod:2:1 MODULE_FILE_UNKNOWN_DIRECTIVE: unknown directive "twf" in twf.mod; ignored`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q]", diags, want)
	}
	if len(defs) != 1 {
		t.Errorf("a warning excludes nothing, got %v", defs)
	}
}

func TestDuplicateModuleExcludesTheLaterCopy(t *testing.T) {
	root := layout(t, map[string]string{
		"kube/twf.mod":     "module github.com/m/kube\n",
		"kube/k.twf":       wf("kube", "K"),
		"kube-old/twf.mod": "module github.com/m/kube\n",
		"kube-old/k.twf":   wf("kube", "K"),
	})
	diags, defs := check(t, root)
	want := `kube-old/twf.mod:1:1 DUPLICATE_MODULE: module github.com/m/kube is also rooted at kube; this copy is ignored`
	if len(diags) != 1 || diags[0] != want {
		t.Errorf("diagnostics = %q, want [%q]", diags, want)
	}
	if strings.Join(defs, ",") != "kube/k.twf" {
		t.Errorf("kept %v, want only kube/k.twf", defs)
	}
}

func TestPackageClauseConflict(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod":         "module example.com/demo\n",
		"fabric/v1/f.twf": wf("fabric", "F"),
		"fabric/v1/g.twf": wf("other", "G"),
		"fabric/v1/h.twf": wf("", "H"),
	})
	diags, defs := check(t, root)
	want := []string{
		`fabric/v1/g.twf:1:1 PACKAGE_CLAUSE_CONFLICT: directory fabric/v1 holds package fabric (f.twf) and package other (g.twf); g.twf is ignored`,
		`fabric/v1/h.twf:1:1 PACKAGE_CLAUSE_CONFLICT: directory fabric/v1 holds package fabric (f.twf) and a file with no package clause (h.twf); h.twf is ignored`,
	}
	if strings.Join(diags, "\n") != strings.Join(want, "\n") {
		t.Errorf("diagnostics =\n%s\nwant\n%s", strings.Join(diags, "\n"), strings.Join(want, "\n"))
	}
	if strings.Join(defs, ",") != "fabric/v1/f.twf" {
		t.Errorf("kept %v", defs)
	}
}

func TestPackageNameMismatchAndInvalidPath(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod":                 "module example.com/demo\n",
		"cluster/fabric/v1/c.twf": wf("clusterfabric", "C"),
		"kube (old)/k.twf":        wf("kube", "K"),
	})
	diags, defs := check(t, root)
	want := []string{
		`cluster/fabric/v1/c.twf:1:1 PACKAGE_NAME_MISMATCH: package clusterfabric must be named fabric, the assumed name of its import path example.com/demo/cluster/fabric/v1`,
		`kube (old)/k.twf:1:1 INVALID_PACKAGE_PATH: package directory kube (old) has the invalid import path "example.com/demo/kube (old)": invalid char ' '`,
	}
	if strings.Join(diags, "\n") != strings.Join(want, "\n") {
		t.Errorf("diagnostics =\n%s\nwant\n%s", strings.Join(diags, "\n"), strings.Join(want, "\n"))
	}
	if strings.Join(defs, ",") != "cluster/fabric/v1/c.twf" {
		t.Errorf("kept %v (a mismatch keeps its package; an invalid path does not)", defs)
	}
}

func TestDuplicatePackageAcrossOverlappingModules(t *testing.T) {
	root := layout(t, map[string]string{
		"a/twf.mod":     "module example.com/demo\n",
		"a/lib/x/x.twf": wf("x", "A"),
		"b/twf.mod":     "module example.com/demo/lib\n",
		"b/x/x.twf":     wf("x", "B"),
	})
	diags, defs := check(t, root)
	if len(diags) != 2 || !strings.Contains(diags[0], "DUPLICATE_PACKAGE: import path example.com/demo/lib/x is also the path of directory b/x; only a/lib/x is used") ||
		!strings.Contains(diags[1], "b/x/x.twf:1:1 DUPLICATE_PACKAGE") {
		t.Errorf("diagnostics = %q", diags)
	}
	if strings.Join(defs, ",") != "a/lib/x/x.twf" {
		t.Errorf("kept %v, want the byte-wise first directory", defs)
	}
}

func TestTempRootModuleFileIsIgnored(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("TMPDIR", tmp)
	writeFile(t, filepath.Join(tmp, "twf.mod"), "module stray\n")
	writeFile(t, filepath.Join(tmp, "design", "fabric", "f.twf"), wf("fabric", "F"))
	diags, _ := check(t, filepath.Join(tmp, "design"))
	if len(diags) != 1 || !strings.Contains(diags[0], "PACKAGE_OUTSIDE_MODULE") {
		t.Errorf("a twf.mod at the temp root is not a module: %q", diags)
	}
}

func TestFailedClauseKeepsRecoveredName(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod":      "module example.com/demo\n",
		"fabric/f.twf": "package fabric.x\n\nworkflow F():\n    close complete(\"ok\")\n",
		"fabric/g.twf": "package\n\nworkflow G():\n    close complete(\"ok\")\n",
	})
	diags, defs := check(t, root)
	if len(diags) != 2 || !strings.Contains(diags[0], "fabric/f.twf:1:15") || !strings.Contains(diags[1], "fabric/g.twf:1:1") {
		t.Errorf("diagnostics = %q (two parse errors, no conflict, no mismatch)", diags)
	}
	if strings.Join(defs, ",") != "fabric/f.twf" {
		t.Errorf("kept %v: a recovered clause keeps its file, an unrecoverable one does not", defs)
	}
}

func TestStepZeroOnlyModuleClaimsNoPath(t *testing.T) {
	root := layout(t, map[string]string{
		"a/twf.mod": "module m\n",
		"a/x.twf":   "package\n",
		"b/twf.mod": "module m\n",
		"b/b.twf":   wf("", "B"),
	})
	diags, defs := check(t, root)
	for _, d := range diags {
		if strings.Contains(d, "DUPLICATE_MODULE") {
			t.Errorf("a module with no kept files won DUPLICATE_MODULE: %q", diags)
		}
	}
	if strings.Join(defs, ",") != "b/b.twf" {
		t.Errorf("kept %v, want b/b.twf", defs)
	}
}

func TestAssumedKeywordClauseWinsItsDirectory(t *testing.T) {
	root := layout(t, map[string]string{
		"twf.mod":     "module m\n",
		"nexus/a.twf": wf("aaa", "A"),
		"nexus/b.twf": "package nexus\n\nworkflow B():\n    close complete(\"ok\")\n",
	})
	_, defs := check(t, root)
	if strings.Join(defs, ",") != "nexus/b.twf" {
		t.Errorf("kept %v, want the file declaring the assumed name", defs)
	}
}
