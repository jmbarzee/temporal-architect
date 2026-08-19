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
// graph <tree> --json — issue #109 multi-package acceptance
// ---------------------------------------------------------------------------

// TestGraphCommand_MultiPackageTree proves the package-aware node identity: a
// tree with the same short workflow name in two packages yields DISTINCT,
// package-qualified nodes (F8), app-package defs carry their package inside the
// name element, and endpoints stay flat-global (unqualified).
func TestGraphCommand_MultiPackageTree(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		if code := runGraph([]string{clitest.Testdata("multipackage"), "--json"}); code != 0 {
			t.Errorf("graph exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
	}

	var env struct {
		Graph *graph.Graph `json:"graph"`
	}
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v\noutput: %s", err, out)
	}
	if env.Graph == nil {
		t.Fatal("envelope graph is null")
	}

	defs := map[string]bool{}
	for _, n := range env.Graph.Nodes {
		defs[n.Definition] = true
	}

	// F8: same short name in two packages → two distinct qualified nodes.
	for _, want := range []string{
		"workflow:orderer.ChannelJoin", // package rides inside the name element
		"workflow:peer.ChannelJoin",
		"workflow:app.Coordinator",
		"nexusService:app.LocalSvc",
		"nexusOperation:app.LocalSvc.DoLocal",
		"nexusEndpoint:Gateway", // endpoints stay flat-global (unqualified)
	} {
		if !defs[want] {
			t.Errorf("missing node definition %q; got %v", want, keys(defs))
		}
	}
	// The unqualified collision must NOT appear — that would be the graph
	// collapsing the two ChannelJoin definitions into one node.
	if defs["workflow:ChannelJoin"] {
		t.Error("found unqualified workflow:ChannelJoin — cross-package defs collapsed")
	}
}

// TestGraphCommand_DefaultPackageIDsStayBare is the byte-identity regression
// proof: an unpackaged design keeps bare (unqualified) definition keys, exactly
// as before issue #109.
func TestGraphCommand_DefaultPackageIDsStayBare(t *testing.T) {
	out, err := clitest.CaptureStdout(func() {
		if code := runGraph([]string{clitest.Testdata("clean.twf"), "--json"}); code != 0 {
			t.Errorf("graph exit code = %d, want 0", code)
		}
	})
	if err != nil {
		t.Fatalf("CaptureStdout: %v", err)
	}
	var env struct {
		Graph *graph.Graph `json:"graph"`
	}
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	for _, n := range env.Graph.Nodes {
		// No default-package node may carry a "." package separator in its
		// definition-key name element (nexus operation names legitimately use
		// "." but there are none in clean.twf).
		if n.Definition == "workflow:.ProcessOrder" || n.Definition == "workflow:ProcessOrder." {
			t.Errorf("default-package node acquired a package qualifier: %q", n.Definition)
		}
	}
	found := false
	for _, n := range env.Graph.Nodes {
		if n.Definition == graph.DefKey(graph.KindWorkflow, "ProcessOrder") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected bare node %q", graph.DefKey(graph.KindWorkflow, "ProcessOrder"))
	}
}

// keys returns the map keys as a slice for test diagnostics.
func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
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
