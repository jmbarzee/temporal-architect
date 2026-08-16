package check_test

import (
	"testing"

	"github.com/spf13/cobra"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	checkcmd "github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/check"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/envelope"
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
	_, diags, err := envelope.ParseFiles([]string{tree})
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
