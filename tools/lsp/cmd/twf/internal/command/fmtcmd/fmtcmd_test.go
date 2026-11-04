package fmtcmd_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/fmtcmd"
)

// runFmt drives the assembled `fmt` command under a root, mirroring main, and
// returns its exit code and stdout.
func runFmt(t *testing.T, args ...string) (int, string) {
	t.Helper()
	root := &cobra.Command{Use: "twf"}
	root.AddCommand(fmtcmd.New())
	root.SetArgs(append([]string{"fmt"}, args...))
	var code int
	out, err := clitest.CaptureStdout(func() { code = cmdutil.Exec(root) })
	if err != nil {
		t.Fatal(err)
	}
	return code, out
}

const tabbed = "workflow W(x):\n\tif (x):\n\t\tactivity A(x)\n\tclose complete(x)\n\nactivity A(x):\n\treturn x\n"

// TestFmt: over a tree, --check lists the files that need tabs and exits 1
// without touching them; fmt rewrites exactly those to the tab form, leaving
// tab files and the walk's skipped files alone; a second --check is clean.
func TestFmt(t *testing.T) {
	spaced := func(unit string) string { return strings.ReplaceAll(tabbed, "\t", unit) }
	files := map[string]string{
		"two.twf":           spaced("  "),
		"three.twf":         spaced("   "),
		"four.twf":          spaced("    "),
		"crlf.twf":          strings.ReplaceAll(spaced("    "), "\n", "\r\n"),
		"mixed.twf":         strings.Replace(tabbed, "\t\tactivity", "\t    activity", 1),
		"tab.twf":           tabbed,
		"sub/nested.twf":    spaced("  "),
		"_skip/hidden.twf":  spaced("  "),
		"testdata/data.twf": spaced("  "),
		"notes.md":          "    not twf\n",
	}
	want := map[string]string{
		"two.twf":        tabbed,
		"three.twf":      tabbed,
		"four.twf":       tabbed,
		"crlf.twf":       strings.ReplaceAll(tabbed, "\n", "\r\n"),
		"mixed.twf":      tabbed,
		"sub/nested.twf": tabbed,
	}
	dir := t.TempDir()
	t.Chdir(dir)
	for name, src := range files {
		if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(name, []byte(src), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	listed := func(out string) []string {
		var got []string
		for _, line := range strings.Fields(out) {
			got = append(got, strings.TrimPrefix(line, "./"))
		}
		return got
	}
	wantListed := "crlf.twf four.twf mixed.twf sub/nested.twf three.twf two.twf"

	code, out := runFmt(t, "--check", ".")
	if code != 1 || strings.Join(listed(out), " ") != wantListed {
		t.Errorf("--check: exit %d, listed %v, want exit 1 and %s", code, listed(out), wantListed)
	}
	for name, src := range files {
		if data, _ := os.ReadFile(name); string(data) != src {
			t.Errorf("--check rewrote %s", name)
		}
	}

	code, out = runFmt(t, ".")
	if code != 0 || strings.Join(listed(out), " ") != wantListed {
		t.Errorf("fmt: exit %d, listed %v, want exit 0 and %s", code, listed(out), wantListed)
	}
	for name, src := range files {
		w, ok := want[name]
		if !ok {
			w = src
		}
		if data, _ := os.ReadFile(name); string(data) != w {
			t.Errorf("%s = %q, want %q", name, data, w)
		}
	}

	if code, out = runFmt(t, "--check", "."); code != 0 || out != "" {
		t.Errorf("second --check: exit %d, output %q, want a clean exit 0", code, out)
	}
	if code, _ = runFmt(t, "two.twf", "missing.twf"); code == 0 {
		t.Error("a missing path exits 0")
	}
}

// TestFmtFailures: a file whose levels are unclear, or that cannot be written,
// is reported on stderr, left as it was and not listed, and the exit is 1; the
// files after it are still formatted. A symlinked file is rewritten through
// the link, which stays a link.
func TestFmtFailures(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	unclear := "workflow W(x):\n    if (x):\n        activity A(x)\n      close complete(x)\n"
	spaced := strings.ReplaceAll(tabbed, "\t", "  ")
	for name, src := range map[string]string{"a_unclear.twf": unclear, "b_readonly.twf": spaced, "c_ok.twf": spaced, "target.twf.src": spaced} {
		if err := os.WriteFile(name, []byte(src), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Chmod("b_readonly.twf", 0o444); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("target.twf.src", "d_link.twf"); err != nil {
		t.Skipf("no symlinks: %v", err)
	}
	var code int
	var out string
	stderr, err := clitest.CaptureStderr(func() {
		code, out = runFmt(t, "a_unclear.twf", "b_readonly.twf", "c_ok.twf", "d_link.twf")
	})
	if err != nil {
		t.Fatal(err)
	}
	if code != 1 || out != "c_ok.twf\nd_link.twf\n" {
		t.Errorf("exit %d, stdout %q; want exit 1 and the two rewritten files", code, out)
	}
	for _, want := range []string{"a_unclear.twf: line 4: ", "b_readonly.twf: not writable"} {
		if !strings.Contains(stderr, want) {
			t.Errorf("stderr %q lacks %q", stderr, want)
		}
	}
	for name, want := range map[string]string{"a_unclear.twf": unclear, "b_readonly.twf": spaced, "c_ok.twf": tabbed, "target.twf.src": tabbed} {
		if data, _ := os.ReadFile(name); string(data) != want {
			t.Errorf("%s = %q, want %q", name, data, want)
		}
	}
	if fi, err := os.Lstat("d_link.twf"); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("d_link.twf is no longer a symlink (%v)", err)
	}
	if fi, _ := os.Stat("c_ok.twf"); fi.Mode().Perm() != 0o644 {
		t.Errorf("c_ok.twf mode %v, want 0644", fi.Mode().Perm())
	}
}
