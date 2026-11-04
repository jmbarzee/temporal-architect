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
