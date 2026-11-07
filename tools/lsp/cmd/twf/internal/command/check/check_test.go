package check_test

import (
	"os"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	checkcmd "github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/check"
	"github.com/jmbarzee/temporal-architect/tools/lsp/pipeline"
)

// runCheck drives the assembled `check` command under a root, mirroring main.
func runCheck(args []string) int {
	root := &cobra.Command{Use: "twf"}
	root.AddCommand(checkcmd.New())
	root.SetArgs(append([]string{"check"}, args...))
	return cmdutil.Exec(root)
}

// TestCheckMultiPackageTree is the issue #109 CLI acceptance: `twf check` over a
// directory (tree) with two packages and one external (unresolved) import must
// exit 0 — the external import is a warning, not an error — and surface the
// "treated as external" UNRESOLVED_IMPORT diagnostic. Cross-package resolution
// (peer → orderer) and the local/external nexus-service coexistence (the #31
// cliff removed) must produce no error-severity diagnostics.
func TestCheckMultiPackageTree(t *testing.T) {
	tree := clitest.Testdata("multipackage")

	// Exit 0: a directory of two packages + one external import resolves clean.
	if code := runCheck([]string{tree}); code != 0 {
		t.Fatalf("check exit code = %d, want 0", code)
	}

	// Assert the diagnostic set through the shared envelope entrypoint (the same
	// path the command runs) rather than scraping stderr: exactly the external
	// import warning, and zero error-severity diagnostics.
	_, diags, err := pipeline.ParseFiles([]string{tree})
	if err != nil {
		t.Fatalf("ParseFiles: %v", err)
	}
	var sawExternal bool
	for _, d := range diags {
		if d.Severity == "error" {
			t.Errorf("unexpected error-severity diagnostic: %s %q", d.Code, d.Message)
		}
		if d.Code == "UNRESOLVED_IMPORT" {
			sawExternal = true
		}
	}
	if !sawExternal {
		t.Errorf("expected an UNRESOLVED_IMPORT (treated-as-external) warning, got %+v", diags)
	}
}

// TestCheckReportsIndentationErrorsFirst: on a file with bad indentation, the
// first diagnostic `twf check` prints is the LEX error, not the parser error it
// causes, even where both fall at one position.
func TestCheckReportsIndentationErrorsFirst(t *testing.T) {
	for _, tc := range []struct{ name, src, want string }{
		{"mixed", "workflow W(x):\n\tif (x):\n\t  close complete(x)\n",
			"[parse/LEX] at bad.twf:3:2: indentation mixes tabs and spaces; .twf indents with tabs, one per level"},
		{"spaces", "workflow W(x):\n    close complete(x)\n",
			"[parse/LEX] at bad.twf:2:1: indented with spaces; .twf indents with tabs, one per level"},
		{"dedent to no open block", "activity A(d) -> (string):\n\t\t# c\n\twork(d)\n",
			"[parse/LEX] at bad.twf:3:2: inconsistent indentation"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Chdir(t.TempDir())
			if err := os.WriteFile("bad.twf", []byte(tc.src), 0o644); err != nil {
				t.Fatal(err)
			}
			var code int
			var stderr string
			var errErr error
			stdout, err := clitest.CaptureStdout(func() {
				stderr, errErr = clitest.CaptureStderr(func() { code = runCheck([]string{"bad.twf"}) })
			})
			if err != nil || errErr != nil {
				t.Fatal(err, errErr)
			}
			first, _, _ := strings.Cut(stdout+stderr, "\n")
			if code == 0 || !strings.Contains(first, tc.want) {
				t.Errorf("twf check exit %d, first line %q, want %q\nstdout:\n%s\nstderr:\n%s", code, first, tc.want, stdout, stderr)
			}
		})
	}
}

// TestCheckPrintsCrossSDKCall: `twf check` prints the CROSS_SDK_CALL hint and
// exits 0.
func TestCheckPrintsCrossSDKCall(t *testing.T) {
	t.Chdir(t.TempDir())
	const src = "workflow W():\n\tactivity A()\n\tclose complete()\n\nactivity A():\n\tdefault_options:\n\t\ttask_queue: \"a\"\n\treturn x\n\n@sdk(go)\nworker wW:\n\tworkflow W\n\n@sdk(python)\nworker aW:\n\tactivity A\n\nnamespace ns:\n\tworker wW\n\t\toptions:\n\t\t\ttask_queue: \"w\"\n\tworker aW\n\t\toptions:\n\t\t\ttask_queue: \"a\"\n"
	if err := os.WriteFile("sdks.twf", []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	var code int
	stderr, err := clitest.CaptureStderr(func() { code = runCheck([]string{"sdks.twf"}) })
	if err != nil {
		t.Fatal(err)
	}
	const want = "hint [validate/CROSS_SDK_CALL] at sdks.twf:2:2: activity A runs on python and its caller on go; read skills/temporal-architect/reference/cross-sdk.md\n"
	if code != 0 || stderr != want {
		t.Errorf("twf check exit %d, stderr %q, want 0 and %q", code, stderr, want)
	}
}
