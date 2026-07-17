package graph_test

import (
	"encoding/json"
	"testing"

	"github.com/spf13/cobra"

	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/clitest"
	"github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/cmdutil"
	graphcmd "github.com/jmbarzee/temporal-architect/tools/lsp/cmd/twf/internal/command/graph"
	"github.com/jmbarzee/temporal-architect/tools/lsp/parser/graph"
)

// runGraph drives the assembled `graph` command (with its `chunks` child) under
// a root, mirroring how main mounts it: `graph` has a parent in the real CLI,
// so positional `.twf` args reach its RunE rather than cobra's root-level
// unknown-subcommand guard.
func runGraph(args []string) int {
	root := &cobra.Command{Use: "twf"}
	root.AddCommand(graphcmd.New())
	root.SetArgs(append([]string{"graph"}, args...))
	return cmdutil.Exec(root)
}

// ---------------------------------------------------------------------------
// graph <file> --json — acceptance test
// ---------------------------------------------------------------------------

func TestGraphCommand_FileJSON(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		code := runGraph([]string{clitest.Testdata("clean.twf"), "--json"})
		if code != 0 {
			t.Errorf("graph exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
	}

	var env struct {
		Summary     map[string]any   `json:"summary"`
		Diagnostics []map[string]any `json:"diagnostics"`
		Graph       *graph.Graph     `json:"graph"`
	}
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v\noutput: %s", err, out)
	}
	if env.Graph == nil {
		t.Fatal("envelope graph is null")
	}
	if env.Summary == nil {
		t.Fatal("envelope summary is null")
	}
	if env.Diagnostics == nil {
		t.Error("envelope diagnostics is null, want []")
	}

	// clean.twf defines ProcessOrder → ValidateOrder; the workflow node must
	// be present (orphan, since there's no worker/namespace).
	wantDef := graph.DefKey(graph.KindWorkflow, "ProcessOrder")
	found := false
	for _, n := range env.Graph.Nodes {
		if n.Definition == wantDef {
			found = true
		}
	}
	if !found {
		t.Errorf("missing workflow node %q in %+v", wantDef, env.Graph.Nodes)
	}
}

// ---------------------------------------------------------------------------
// Text mode smoke test
// ---------------------------------------------------------------------------

func TestGraphCommand_FileText(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		code := runGraph([]string{clitest.Testdata("clean.twf")})
		if code != 0 {
			t.Errorf("graph text mode exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
	}
	if len(out) == 0 {
		t.Error("text output is empty")
	}
}

// ---------------------------------------------------------------------------
// Usage error
// ---------------------------------------------------------------------------

func TestGraphCommand_NoArgs(t *testing.T) {
	code := runGraph([]string{"--json"})
	if code == 0 {
		t.Error("expected non-zero exit when no file arguments are given")
	}
}
